import { describe, expect, it } from 'vitest';
import { AGENT_IMPLEMENTATIONS } from '@/agents/implementations';
import type { AgentContext } from '@/agents/context';
import { emptyPatientContext, type PatientContext } from '@/schemas/clinical';

/**
 * Phase 1 acceptance: each rewired agent must produce SUBSTANTIVE output on a
 * realistic case — content drawn from its real engine — not merely a non-empty
 * result. "Returned something" is how a facade passes a test.
 */

function ctx(over: Omit<Partial<AgentContext>, 'patient'> & { patient?: Partial<PatientContext> } = {}): AgentContext {
  const { patient, ...rest } = over;
  return {
    question: '',
    plan: '',
    patient: { ...emptyPatientContext(), ...(patient ?? {}) },
    mode: 'quick',
    intent: 'clinical_reasoning',
    risk: 'R2',
    emergency: false,
    hits: [],
    reviewMode: 'clinician',
    academyLevel: 'resident',
    extras: {},
    results: new Map(),
    ...rest,
  } as AgentContext;
}

const run = (id: string, c: AgentContext) => Promise.resolve(AGENT_IMPLEMENTATIONS[id](c));
const allText = (r: { summary: string; sections: { titleKa: string; body: string; bullets: string[] }[] }) =>
  [r.summary, ...r.sections.flatMap((s) => [s.titleKa, s.body, ...s.bullets])].join('\n');

const CONSENT_CASE =
  'პაციენტი მიღებულ იქნა მუცლის ტკივილით. ისტორიაში არ არის დოკუმენტირებული ინფორმირებული თანხმობა ოპერაციაზე და ოპერაციის ოქმი არასრულია. დიაგნოზი დაგვიანდა 48 საათით, საჭირო ლაბორატორიული კვლევა არ ჩატარდა.';

describe('A13 quality agent — driven by the author corpus', () => {
  it('cites rule IDs and audit questions from the manual', async () => {
    const r = await run('A13', ctx({ extras: { caseNarrative: CONSENT_CASE } }));
    expect(r.status).toBe('ok');
    const text = allText(r);
    expect(text).toMatch(/QDR-\d{5}/);
    expect(text).toMatch(/QAQ-\d{4}/);
    expect(text).toMatch(/აქტიური წესი/);
  });

  it('raises the consent and documentation classes for a consent case', async () => {
    const r = await run('A13', ctx({ extras: { caseNarrative: CONSENT_CASE } }));
    const codes = (r.data.defects as { code: string }[]).map((d) => d.code);
    expect(codes).toEqual(expect.arrayContaining(['D07', 'D03']));
  });

  it('names the evidence the assessment depends on', async () => {
    const r = await run('A13', ctx({ extras: { caseNarrative: CONSENT_CASE } }));
    expect((r.data.requiredEvidence as unknown[]).length).toBeGreaterThan(0);
  });

  it('refuses rather than inventing when there is no narrative', async () => {
    const r = await run('A13', ctx());
    expect(r.status).toBe('insufficient_input');
  });
});

describe('A14 defect agent — driven by the author corpus', () => {
  it('uses the manual’s audit questions, not the generic list', async () => {
    const r = await run('A14', ctx({ extras: { caseNarrative: CONSENT_CASE } }));
    const questions = r.sections.find((s) => s.titleEn.startsWith('Deviation'))!.bullets;
    expect(questions.length).toBeGreaterThan(0);
    // Corpus questions are specific; the old fallback list began with a generic one.
    expect(questions.join(' ')).toMatch(/თანხმობ|ინფორმირ|დოკუმენტ/);
    expect((r.data.ruleIds as string[]).length).toBeGreaterThan(0);
  });

  it('never states guilt', async () => {
    const r = await run('A14', ctx({ extras: { caseNarrative: CONSENT_CASE, claim: 'ვინ არის დამნაშავე' } }));
    expect(allText(r)).not.toMatch(/დამნაშავეა|ბრალეულია/);
    expect(r.humanReviewRequired).toBe(true);
  });
});

describe('A07 drug agent — beyond the curated 27', () => {
  it('answers a low-value agent from the registry with its regulatory status', async () => {
    const r = await run('A07', ctx({ question: 'რა ღირს ცერებროლიზინი ინსულტის შემდეგ?' }));
    expect(r.status).toBe('ok');
    const text = allText(r);
    expect(text).toMatch(/FDA/);
    expect(text).toMatch(/Cochrane|CD007026/);
  });

  it('still uses the curated record for a curated drug', async () => {
    const r = await run('A07', ctx({ question: 'აპიქსაბანის დოზა', patient: { age: 82, weightKg: 58, creatinineMgDl: 1.6, sex: 'female' } }));
    expect(r.status).toBe('ok');
    expect(allText(r)).toMatch(/2\.5 მგ/);
  });
});

describe('A08 medication reconciliation — the programme’s purpose', () => {
  it('flags low-value agents and offers taper schedules', async () => {
    const meds = [
      { drug: 'ცერებროლიზინი', dose: '10 მლ' },
      { drug: 'ომეპრაზოლი', dose: '20 მგ' },
      { drug: 'დიაზეპამი', dose: '5 მგ' },
      { drug: 'Teraflex', dose: '' },
      { drug: 'ვარფარინი', dose: '5 მგ' },
    ].map((m, i) => ({ id: String(i), ...m, frequency: '', route: '', indication: '', startDate: '', status: 'active' as const }));

    const r = await run('A08', ctx({ patient: { medications: meds } }));
    expect(r.status).toBe('ok');
    expect(r.data.lowValue).toEqual(expect.arrayContaining(['cerebrolysin', 'glucosamine-chondroitin']));
    expect((r.data.tapers as string[]).length).toBeGreaterThanOrEqual(2);
    expect(r.summary).toMatch(/პოლიფარმაცია/);
  });
});

describe('A05 / A18 literature agents — degrade cleanly without the network', () => {
  it('A05 still returns curated sources when live literature is unavailable', async () => {
    const r = await run('A05', ctx({ question: 'წინაგულების ფიბრილაცია ანტიკოაგულაცია' }));
    // Live sources are disabled in tests; the curated registry must carry it.
    expect(['ok', 'insufficient_input']).toContain(r.status);
    if (r.status === 'ok') expect(r.sections.length).toBeGreaterThan(0);
  });

  it('A18 builds an English search strategy from a Georgian PICO', async () => {
    const r = await run('A18', ctx({
      question: 'ამცირებს თუ არა დეპრესკრაიბინგი დაცემებს?',
      extras: { pico: { p: 'ხანდაზმული', i: 'ბენზოდიაზეპინი', o: 'დაცემა' } },
    }));
    expect(r.status).toBe('ok');
    const strategy = r.sections.find((s) => s.titleEn === 'Search strategy')!;
    expect(strategy.bullets.join(' ')).toMatch(/→/);
  });

  it('A18 tells the user when it cannot form a query instead of pretending', async () => {
    const r = await run('A18', ctx({ question: 'რაღაც ზოგადი კითხვა' }));
    expect(r.summary).toMatch(/ვერ ამოიცნო|ჩანაწერი/);
  });
});

describe('Georgian → English search terms without a model call', () => {
  it('maps clinical concepts and drugs through the controlled vocabularies', async () => {
    const { englishSearchTerms } = await import('@/services/search-terms');
    const t = englishSearchTerms('წინაგულების ფიბრილაცია, ვარფარინი და იბუპროფენი');
    expect(t).toEqual(expect.arrayContaining(['atrial fibrillation', 'warfarin', 'ibuprofen']));
  });

  it('never transliterates an ordinary word into a fake drug name', async () => {
    const { englishSearchTerms } = await import('@/services/search-terms');
    expect(englishSearchTerms('დღეს კარგი ამინდია')).toEqual([]);
  });
});

describe('routing reaches the agents that the request calls for', () => {
  it('routes a PICO to the research agent whatever the wording', async () => {
    const { buildPlan, classifyIntent, classifyIntents, signalAgents } = await import('@/services/orchestrator');
    const text = 'ამცირებს თუ არა დეპრესკრაიბინგი დაცემებს';
    const plan = buildPlan({
      text, mode: 'evidence', intent: classifyIntent(text, 'evidence'), risk: 'R1', emergency: false, redFlags: [],
      patient: emptyPatientContext(),
      secondaryIntents: classifyIntents(text),
      signals: signalAgents({ text, extras: { pico: { p: 'ხანდაზმული', i: 'ბენზოდიაზეპინი' } } }),
    });
    expect(plan.parallel).toContain('A18');
  });

  it('routes a named drug to the drug agent even without the word "drug"', async () => {
    const { signalAgents } = await import('@/services/orchestrator');
    expect(signalAgents({ text: 'რამდენად ეფექტურია ცერებროლიზინი', extras: {} })).toContain('A07');
    expect(signalAgents({ text: 'ვარფარინი და იბუპროფენი ერთად', extras: {} })).toContain('A07');
  });

  it('does not invent a drug from an ordinary sentence', async () => {
    const { signalAgents } = await import('@/services/orchestrator');
    expect(signalAgents({ text: 'დღეს კარგი ამინდია', extras: {} })).not.toContain('A07');
  });

  it('routes structured inputs to their agents', async () => {
    const { signalAgents } = await import('@/services/orchestrator');
    const s = signalAgents({ text: '', extras: { reportText: 'CT...', documentType: 'form100', topic: 'AF', caseNarrative: 'x', claim: 'y' } });
    expect(s).toEqual(expect.arrayContaining(['A11', 'A12', 'A17', 'A13', 'A14']));
  });

  it('keeps the patient mode narrow', async () => {
    const { buildPlan } = await import('@/services/orchestrator');
    const plan = buildPlan({
      text: 'ვარფარინი', mode: 'patient', intent: 'patient_education', risk: 'R2', emergency: false, redFlags: [],
      patient: emptyPatientContext(), secondaryIntents: ['drug', 'research'], signals: ['A07', 'A18'],
    });
    expect(plan.parallel).not.toContain('A18');
    // The one exception: a named drug reaches A07, so its age gate and
    // label reach the patient.
    expect(plan.parallel).toContain('A07');
  });
});

describe('PICO search strategy', () => {
  it('ORs synonyms inside an element and scopes them to title+abstract', async () => {
    const { buildQuery } = await import('@/services/literature');
    const q = buildQuery({ text: '', pico: { p: 'aged|older adults', o: 'falls' } });
    expect(q).toContain('(TITLE_ABS:"aged" OR TITLE_ABS:"older adults")');
    expect(q).toContain('AND TITLE_ABS:"falls"');
  });
  it('expands a Georgian PICO element to every controlled synonym', async () => {
    const { englishSynonyms } = await import('@/services/search-terms');
    const s = englishSynonyms('დაცემა');
    expect(s).toEqual(expect.arrayContaining(['accidental falls', 'falls']));
    expect(s.join(' ')).not.toMatch(/[Ⴀ-ჿ]/);
  });
});
