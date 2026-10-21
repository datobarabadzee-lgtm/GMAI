import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyPatientContext } from '@/schemas/clinical';

/**
 * Phase 4 acceptance: the public tier retrieves from the shipped quality corpus
 * with the same hybrid pipeline and coverage gate as the internal tier — and
 * says "not covered" for questions the corpus does not address.
 */
describe('open-corpus retrieval in the public tier', () => {
  beforeEach(() => vi.stubEnv('APP_TIER', 'public'));
  afterEach(() => vi.unstubAllEnvs());

  it('retrieves and covers a consent / delay case from the author corpus', async () => {
    const { retrieveRules } = await import('@/kb/retrieval-service');
    const r = await retrieveRules('ისტორიაში არ არის დოკუმენტირებული ინფორმირებული თანხმობა ოპერაციაზე, დიაგნოზი დაგვიანდა', { kinds: ['quality_rule', 'audit_question'], limit: 6 });
    expect(r.coverage).toBe('COVERED');
    expect(r.hits[0].rule_id).toMatch(/^Q(DR|AQ)-/);
    expect(r.trace?.embedding.semantic).toBe(false); // honest label: hashed n-grams, not a trained model
  });

  it('finds the stroke door-to-needle criterion for a thrombolysis delay', async () => {
    const { retrieveRules } = await import('@/kb/retrieval-service');
    const r = await retrieveRules('ინსულტის დროს თრომბოლიზისი დაგვიანდა', { kinds: ['quality_rule'], limit: 5 });
    expect(r.coverage).not.toBe('NOT_COVERED');
    const text = r.hits.map((h) => (h.kind === 'quality_rule' ? h.criterion_or_action ?? '' : '')).join(' ');
    expect(text).toMatch(/ინსულტ/);
  });

  it('does not pretend to cover an unrelated question', async () => {
    const { retrieveRules } = await import('@/kb/retrieval-service');
    const r = await retrieveRules('ფეხბურთის მატჩის შედეგი', { kinds: ['quality_rule', 'audit_question'] });
    expect(r.coverage).toBe('NOT_COVERED');
  });

  it('still reports the licensed clinical corpus as unavailable', async () => {
    const { retrieveRules } = await import('@/kb/retrieval-service');
    const r = await retrieveRules('აპიქსაბანის დოზა', { kinds: ['clinical_rule'] });
    expect(r.coverage).toBe('KB_UNAVAILABLE');
  });

  it('grounds a quality-mode orchestration in retrieved rules', async () => {
    const { orchestrate } = await import('@/services/orchestrator');
    const n = 'ისტორიაში არ არის დოკუმენტირებული ინფორმირებული თანხმობა ოპერაციაზე და ოპერაციის ოქმი არასრულია.';
    const out = await orchestrate({ question: 'ჩაატარე ხარისხის მიმოხილვა', mode: 'quality', patient: { ...emptyPatientContext(), narrative: n }, extras: { caseNarrative: n } });
    expect(out.kb.hitCount).toBeGreaterThan(0);
    expect(out.kb.coverage).toBe('COVERED');
    expect(out.verification.citations.fabricated).toEqual([]);
  });
});
