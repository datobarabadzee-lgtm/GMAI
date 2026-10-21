import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyPatientContext } from '@/schemas/clinical';
import { buildLedger, ledgerFreshness, scrubReferences, verifyReferences } from '@/services/run-ledger';
import { releaseGate, verifyCitations, verifyNumerics } from '@/services/verifiers';
import type { AgentResult } from '@/schemas/agent';

/**
 * Phase 3 acceptance: A19/A20 must verify something in the public tier,
 * where the internal knowledge base is absent by design.
 *   - a corpus rule ID an agent returned is SUPPORTED, not "fabricated";
 *   - an invented rule ID is still rejected;
 *   - a dose the model wrote that no engine produced is caught and the
 *     model's sentence is not published;
 *   - a DOI the model wrote that no agent retrieved is removed.
 */

let modelText = '';
vi.mock('@/services/ai-provider', async (orig) => {
  const real = await orig<typeof import('@/services/ai-provider')>();
  const provider = {
    name: 'test', live: true,
    info: () => ({ engine: 'test', provider: 'test', fast: 'm', reasoning: 'm' }),
    complete: async () => modelText,
    completeDetailed: async () => ({ text: modelText, model: 'test-model', usage: { ...real.EMPTY_USAGE }, latencyMs: 1, truncated: false }),
  };
  return { ...real, getProvider: () => provider, getProviderFor: () => ({ provider, ownKey: false }) };
});

const agent = (over: Partial<AgentResult>): AgentResult => ({
  agentId: 'A13', status: 'ok', summary: '', sections: [], claims: [], sourceIds: [], data: {}, humanReviewRequired: false, note: '', ...over,
});

describe('run ledger', () => {
  it('collects corpus rule IDs, retrieved citations and numbers from agent output only', () => {
    const ledger = buildLedger(
      [
        agent({ sections: [{ titleKa: 'x', titleEn: 'x', body: 'QDR-00101 · დოკუმენტაცია', bullets: ['QDR-99999 არარსებული'] }] }),
        agent({ agentId: 'A18', data: { citations: [{ id: 'MED:1', title: 'T', doi: '10.1016/j.maturitas.2017.04.002', pmid: '28531318', year: 2017, evidenceTier: 'systematic_review' }] } }),
        agent({ agentId: 'A07', summary: 'აპიქსაბანი 2.5 მგ ორჯერ დღეში' }),
      ],
      'ასაკი 81, eGFR 28',
    );
    expect(ledger.ruleIds.has('QDR-00101')).toBe(true);
    expect(ledger.ruleIds.has('QDR-99999')).toBe(false);
    expect(ledger.dois.has('10.1016/j.maturitas.2017.04.002')).toBe(true);
    for (const n of ['2.5', '81', '28']) expect(ledger.numbers.has(n)).toBe(true);
  });

  it('treats a returned corpus ID as supported and an invented one as fabricated', () => {
    const ledger = buildLedger([agent({ summary: 'QDR-00101' })], '');
    const { checks, fabricated } = verifyCitations(['QDR-00101', 'QDR-99999'], [], { known: (id) => id === 'QDR-00101', returned: ledger.ruleIds });
    expect(checks.find((c) => c.ruleId === 'QDR-00101')?.status).toBe('SUPPORTED');
    expect(fabricated).toEqual(['QDR-99999']);
  });

  it('verifies model numbers against the engines and flags invented ones', () => {
    const ledger = buildLedger([agent({ summary: 'დოზა 2.5 მგ' })], 'eGFR 28');
    const n = verifyNumerics('დანიშნეთ 2.5 მგ; ან 10 მგ.', [], ledger);
    expect(n.find((x) => x.value.startsWith('2.5'))?.status).toBe('VERIFIED_AGAINST_ENGINE');
    expect(n.find((x) => x.value.startsWith('10'))?.status).toBe('UNVERIFIED');
  });

  it('removes a DOI that no agent retrieved and keeps one that was', () => {
    const ledger = buildLedger([agent({ data: { citations: [{ id: 'a', title: 'T', doi: '10.1056/nejmoa2034577', pmid: null, year: 2024, evidenceTier: 'guideline' }] } })], '');
    const refs = verifyReferences('იხ. doi:10.1056/NEJMoa2034577 და 10.9999/fake.123.', ledger);
    expect(refs.map((r) => r.status)).toEqual(['RETRIEVED', 'NOT_RETRIEVED']);
    const scrubbed = scrubReferences('იხ. doi:10.1056/NEJMoa2034577 და 10.9999/fake.123.', refs.filter((r) => r.status === 'NOT_RETRIEVED'));
    expect(scrubbed).toContain('10.1056/NEJMoa2034577');
    expect(scrubbed).not.toContain('fake');
  });

  it('marks retrieved guideline evidence older than five years for refresh', () => {
    const old = buildLedger([agent({ data: { citations: [{ id: 'a', title: 'T', doi: '10.1/x', pmid: null, year: 2018, evidenceTier: 'guideline' }] } })], '');
    expect(ledgerFreshness(old, 2026).status).toBe('REFRESH_REQUIRED');
    expect(ledgerFreshness(buildLedger([], ''), 2026).status).toBe('UNCERTAIN');
  });
});

describe('release gate in the public tier', () => {
  const base = { riskLevel: 'R2', coverage: 'KB_UNAVAILABLE' as const, numerics: [], citations: { checks: [], fabricated: [] }, freshness: { status: 'CURRENT' as const, refreshRuleIds: [], oldestVintage: null, messageKa: '' }, contradictions: [], qualityContext: false };
  it('does not send every answer to human review because the KB is absent by design', () => {
    expect(releaseGate({ ...base, tier: 'public', grounding: 5 }).status).toBe('PASS');
  });
  it('warns when nothing in the run grounds the answer', () => {
    const r = releaseGate({ ...base, tier: 'public', grounding: 0 });
    expect(r.status).toBe('PASS_WITH_WARNING');
  });
  it('still sends the internal tier to review when its KB is missing', () => {
    expect(releaseGate({ ...base, tier: 'internal' }).status).toBe('HUMAN_REVIEW');
  });
});

describe('orchestrator end-to-end in the public tier (model mocked)', () => {
  beforeEach(() => vi.stubEnv('APP_TIER', 'public'));
  afterEach(() => vi.unstubAllEnvs());

  it('replaces a model bottom line that invents a dose', async () => {
    const { orchestrate } = await import('@/services/orchestrator');
    modelText = 'რეკომენდებულია აპიქსაბანი 7.5 მგ დღეში.';
    const out = await orchestrate({ question: 'რა დოზით დავნიშნო აპიქსაბანი?', mode: 'quick', patient: { ...emptyPatientContext(), age: 81, egfr: 28 } });
    expect(out.answer.bottomLine).not.toContain('7.5');
    expect(out.answer.sections.find((s) => s.id === 'safety-gate')?.bullets.join(' ')).toMatch(/დეტერმინისტული დასკვნა/);
  });

  it('publishes a model bottom line whose numbers all come from the engines, minus an unretrieved DOI', async () => {
    const { orchestrate } = await import('@/services/orchestrator');
    modelText = 'პაციენტი 81 წლისაა და eGFR 28-ია — დოზა ფრთხილად შეირჩეს. იხ. doi:10.5555/invented.2020';
    const out = await orchestrate({ question: 'რა დოზით დავნიშნო აპიქსაბანი?', mode: 'quick', patient: { ...emptyPatientContext(), age: 81, egfr: 28 } });
    expect(out.answer.bottomLine).toContain('81 წლისაა');
    expect(out.answer.bottomLine).not.toContain('10.5555/invented');
    expect(out.verification!.references[0]?.status).toBe('NOT_RETRIEVED');
  });

  it('does not flag the author corpus IDs as fabricated in quality mode', async () => {
    const { orchestrate } = await import('@/services/orchestrator');
    modelText = '';
    const out = await orchestrate({
      question: 'ჩაატარე ხარისხის მიმოხილვა',
      mode: 'quality',
      patient: { ...emptyPatientContext(), narrative: 'ისტორიაში არ არის დოკუმენტირებული ინფორმირებული თანხმობა ოპერაციაზე და ოპერაციის ოქმი არასრულია. დიაგნოზი დაგვიანდა 48 საათით.' },
      extras: { caseNarrative: 'ისტორიაში არ არის დოკუმენტირებული ინფორმირებული თანხმობა ოპერაციაზე და ოპერაციის ოქმი არასრულია. დიაგნოზი დაგვიანდა 48 საათით.' },
    });
    expect(out.verification!.citations.checks.length).toBeGreaterThan(0);
    expect(out.verification!.citations.fabricated).toEqual([]);
    expect(out.verification!.citations.checks.every((c) => c.status === 'SUPPORTED')).toBe(true);
  });
});

describe('script drift salvage', () => {
  it('keeps clean sentences when one short clause drifted', async () => {
    const { salvageSentences } = await import('@/services/orchestrator');
    const t = 'ჰემოგლობინი დაბალია და საჭიროებს ექიმის შეფასებას. ვარფარინის ფონზე სისხლდენის გამორიცხვა აუცილებელია, ამიტომ დღესვე დაუკავშირდით ექიმს. Կապ հաստատեք:';
    expect(salvageSentences(t)).toBe('ჰემოგლობინი დაბალია და საჭიროებს ექიმის შეფასებას. ვარფარინის ფონზე სისხლდენის გამორიცხვა აუცილებელია, ამიტომ დღესვე დაუკავშირდით ექიმს.');
  });
  it('rejects text where drift is widespread', async () => {
    const { salvageSentences } = await import('@/services/orchestrator');
    expect(salvageSentences('Սա հայերեն է. Նաև սա. ქართული.')).toBeNull();
  });
});
