// Audit-only tests added to the isolated copy. Original application untouched.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyNumerics } from '@/services/verifiers';
import { searchLiterature } from '@/services/literature';
import { interpretLabs } from '@/lib/labs';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('independent audit: verification must preserve meaning', () => {
  it('must interpret equivalent hemoglobin concentrations consistently across g/dL and g/L', () => {
    const mk = (value: number, unit: string) => [{id: 'audit', analyte: 'hemoglobin', value, unit, date: ''}];
    const a = interpretLabs(mk(14, 'g/dL')).results[0];
    const b = interpretLabs(mk(140, 'g/L')).results[0];
    expect(b.status).toBe(a.status);
  });
  it('must not certify a 5 mg dose merely because a rule contains age 5 years', () => {
    const hits = [{kind: 'quality_rule', rule_id: 'AUDIT-AGE', trigger_or_question: 'Age 5 years', criterion_or_action: 'Review consent'}];
    const result = verifyNumerics('პრეპარატის დოზაა 5 მგ.', hits as never);
    expect(result[0].status).toBe('UNVERIFIED');
  });
  it('must not certify 5 mL from an untyped ledger containing the number 5', () => {
    const result = verifyNumerics('მოცულობაა 5 მლ.', [], new Set(['5']));
    expect(result[0].status).toBe('UNVERIFIED');
  });
  it('must classify an audit of guideline compliance as a study, not a guideline', async () => {
    vi.stubEnv('DISABLE_LIVE_SOURCES', '0');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: true, json: async () => ({hitCount: 1, resultList: {result: [{id: '40688888', source: 'MED', title: 'Improving Patient Care and Clinical Services: Compliance With the National Institute for Health and Care Excellence (NICE) Guidelines for Venous Thromboembolism Prophylaxis After Hip and Knee Arthroplasty', pubTypeList: {pubType: ['research-article', 'Journal Article']}, journalInfo: {journal: {title: 'Cureus'}}, pubYear: '2025'}]}})}));
    const result = await searchLiterature({text: 'venous thromboembolism', openAccessOnly: false});
    expect(result.citations[0].evidenceTier).toBe('cohort_or_other');
  });
});
