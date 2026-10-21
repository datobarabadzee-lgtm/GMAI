import { describe, expect, it, vi } from 'vitest';
import { emptyPatientContext } from '@/schemas/clinical';

/**
 * F03 (audit 2026-10-21): a BLOCK decision is enforced on the response itself.
 * The production call path is exercised end to end — API route → orchestrator
 * → verifiers → release gate → publication contract → Markdown export — with
 * only the language model replaced.
 */

let modelText = '';
vi.mock('@/services/ai-provider', async (orig) => {
  const real = await orig<typeof import('@/services/ai-provider')>();
  const provider = {
    name: 'test', live: true,
    info: () => ({ engine: 'live', provider: 'test', fast: 'm', reasoning: 'm' }),
    complete: async () => modelText,
    completeDetailed: async () => ({ text: modelText, model: 'test-model', usage: { ...real.EMPTY_USAGE }, latencyMs: 1, truncated: false }),
  };
  return { ...real, getProvider: () => provider, getProviderFor: () => ({ provider, ownKey: false }), engineStatus: () => ({ engine: 'live', provider: 'test' }) };
});

const SECRET_SENTENCE = 'ეს არის შეკავებას დაქვემდებარებული გამოგონილი რეკომენდაცია';

async function post(body: unknown, headers: Record<string, string> = {}) {
  const { POST } = await import('@/app/api/orchestrate/route');
  const res = await POST(new Request('http://localhost/api/orchestrate', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json(), raw: '' };
}

describe('BLOCK is enforced on every output path', () => {
  it('a fabricated rule citation withholds the whole answer: API, structured fields, agent panels, Markdown', async () => {
    modelText = `${SECRET_SENTENCE} [QDR-99999]. პაციენტს დაენიშნოს მონიტორინგი.`;
    const r = await post({ question: 'პაციენტს აქვს ჰიპერტენზია და ცერებროვასკულური რისკი — რა გავაკეთო?', mode: 'quick', patient: { ...emptyPatientContext(), age: 70 } });
    expect(r.status).toBe(200);
    expect(r.json.release.status).toBe('BLOCK');
    expect(r.json.publication.state).toBe('withheld');
    const payload = JSON.stringify(r.json);
    expect(payload).not.toContain(SECRET_SENTENCE);
    expect(payload).not.toContain('QDR-99999]');
    expect(r.json.answer.bottomLine).toMatch(/შეკავებულია/);
    expect(r.json.agentResults.every((a: { sections: unknown[] }) => a.sections.length === 0)).toBe(true);
    expect(r.json.sources).toEqual([]);
    expect(r.json.claims).toEqual([]);
    const { toMarkdown } = await import('@/features/clinical/answer-export');
    const md = toMarkdown(r.json);
    expect(md).not.toContain(SECRET_SENTENCE);
    expect(md).toMatch(/სტატუსი: პასუხი შეკავებულია/);
  });

  it('a patient never sees internal diagnostics of a withheld answer', async () => {
    modelText = `${SECRET_SENTENCE} [QDR-99999].`;
    const r = await post({ question: 'რას ნიშნავს მაღალი წნევა?', mode: 'patient' }, { 'x-consent-version': (await import('@/knowledge/controller')).CONSENT_VERSION });
    expect(r.json.publication.state).toBe('withheld');
    expect(JSON.stringify(r.json)).not.toContain('QDR-99999');
    expect(r.json.release.reasonsKa).toEqual([]);
    expect(r.json.answer.bottomLine).toMatch(/112/);
  });

  it('a model sentence with an invented dose is not published; the deterministic text is, and it is marked', async () => {
    modelText = 'აპიქსაბანი დანიშნეთ 17 მგ ორჯერ დღეში.';
    const r = await post({ question: 'რა დოზით დავნიშნო აპიქსაბანი?', mode: 'quick', patient: { ...emptyPatientContext(), age: 81, weightKg: 58, creatinineMgDl: 1.6 } });
    expect(JSON.stringify(r.json.answer)).not.toContain('17 მგ');
    expect(['PASS_WITH_WARNING', 'HUMAN_REVIEW']).toContain(r.json.release.status);
    expect(r.json.publication.state).not.toBe('published');
  });

  it('HUMAN_REVIEW is published as a draft that is not automatically approved', async () => {
    const { enforcePublication } = await import('@/services/release-contract');
    const out = enforcePublication({ answer: { bottomLine: 'x', sections: [] } as unknown as import('@/schemas/clinical').ClinicalAnswer, claims: [], agentResults: [], sources: [], release: { status: 'HUMAN_REVIEW', reasonsKa: ['r'], humanReviewRequired: true } }, 'quick');
    expect(out.publication.state).toBe('pending_human_review');
    expect(out.publication.noteKa).toMatch(/ავტომატურად დამტკიცებული არ არის/);
    expect(out.answer.bottomLine).toBe('x');
  });
});

describe('F04: unrelated sources cannot ground an answer', () => {
  it('the audit question gets no drug intent, no unrelated sources and is not PASS', async () => {
    modelText = 'არტერიული ჰიპერტენზია არის არტერიული წნევის ხანგრძლივი მომატება, რაც გულ-სისხლძარღვთა გართულებების რისკს ზრდის.';
    const r = await post({ question: 'რა არის არტერიული ჰიპერტენზია? განმარტება მჭირდება, დოზირების გარეშე.', mode: 'quick' });
    expect(r.json.answer.intent).not.toBe('drug');
    const ids = r.json.sources.map((s: { source_id: string }) => s.source_id);
    for (const unrelated of ['SRC-COCKCROFT-1976', 'SRC-GE-PATIENT-RIGHTS', 'SRC-GE-DATA-PROTECTION', 'SRC-EMA-SMPC', 'SRC-MOSTELLER-1987']) expect(ids).not.toContain(unrelated);
    expect(r.json.release.status).not.toBe('PASS');
    expect(r.json.answer.bottomLine).not.toMatch(/პრეპარატი ჩვენს ბაზაში .* ვერ მოიძებნა/);
    expect(r.json.claimSupport.linkedClaims).toBe(0);
    expect(r.json.release.reasonsKa.join(' ')).toMatch(/ზოგადი ინფორმაციაა/);
  });
});

describe('claim → passage linking', () => {
  it('links a sentence to a passage on the same specific concepts, and not to an unrelated one', async () => {
    const { mapClaims } = await import('@/services/claim-support');
    const passages = [
      { id: 'SRC-AF', sourceId: 'SRC-AF', kind: 'registry' as const, title: 'Atrial fibrillation guideline', text: 'Oral anticoagulation with a DOAC is recommended for stroke prevention in atrial fibrillation with CHA2DS2-VA score of 2 or more.' },
      { id: 'SRC-CG', sourceId: 'SRC-CG', kind: 'registry' as const, title: 'Prediction of creatinine clearance from serum creatinine', text: 'Cockcroft-Gault equation for renal dosing.' },
    ];
    const m = mapClaims('წინაგულების ფიბრილაციისას ინსულტის პრევენციისთვის რეკომენდებულია ანტიკოაგულაცია DOAC-ით.', 'წინაგულების ფიბრილაცია ანტიკოაგულაცია ინსულტი', passages);
    expect(m.linkedSourceIds).toEqual(['SRC-AF']);
    const none = mapClaims('არტერიული ჰიპერტენზია არის არტერიული წნევის ხანგრძლივი მომატება.', 'რა არის არტერიული ჰიპერტენზია?', passages);
    expect(none.linkedClaims).toBe(0);
  });
});
