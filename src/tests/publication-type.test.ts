import { describe, expect, it } from 'vitest';
import { classify } from '@/services/literature';

/** F05 (audit 2026-10-21): rank is raised only on explicit evidence; when in doubt it stays low. */
describe('publication type — conservative', () => {
  it('an audit of guideline compliance is a study, not a guideline (PMID 40688888)', () => {
    expect(classify(['research-article', 'Journal Article'], false, 'Improving Patient Care and Clinical Services: Compliance With the National Institute for Health and Care Excellence (NICE) Guidelines for Venous Thromboembolism Prophylaxis After Hip and Knee Arthroplasty', 'Cureus')).toBe('cohort_or_other');
    // Even if the metadata wrongly says guideline, a study of guideline use is not one.
    expect(classify(['Practice Guideline'], false, 'Adherence to ESC heart failure guidelines: a retrospective audit', '')).toBe('cohort_or_other');
  });
  it('a guideline word in the title alone does not make a guideline', () => {
    expect(classify(['Journal Article'], false, 'Recommendations for the management of hypertension: a narrative review', '')).toBe('cohort_or_other');
    expect(classify(['Journal Article'], false, 'Guidelines for perioperative care: consensus statement', '')).toBe('cohort_or_other');
  });
  it('a real guideline with guideline metadata is a guideline', () => {
    expect(classify(['Practice Guideline', 'Journal Article'], false, '2024 ESC Guidelines for the management of elevated blood pressure and hypertension', 'European Heart Journal')).toBe('guideline');
    expect(classify(['Guideline'], false, 'KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease', 'Kidney International')).toBe('guideline');
  });
  it('systematic reviews by metadata, Cochrane journal or explicit title; protocols are not reviews', () => {
    expect(classify(['Systematic Review'], false, 'Statins for primary prevention', '')).toBe('systematic_review');
    expect(classify(['Journal Article'], false, 'Interventions for X', 'Cochrane Database of Systematic Reviews')).toBe('systematic_review');
    expect(classify(['Journal Article'], false, 'Exercise for knee pain: a systematic review and meta-analysis', '')).toBe('systematic_review');
    expect(classify(['Journal Article'], false, 'Exercise for knee pain: protocol for a systematic review', '')).toBe('cohort_or_other');
  });
  it('a preprint stays a preprint even when it is a meta-analysis', () => {
    expect(classify(['Preprint'], true, 'A meta-analysis of drug X', '')).toBe('preprint');
  });
  it('editorials, comments and letters are never ranked as evidence', () => {
    expect(classify(['Editorial'], false, 'Randomized controlled trials and the new hypertension guideline', '')).toBe('cohort_or_other');
    expect(classify(['Comment', 'Letter'], false, 'A systematic review of reviews?', '')).toBe('cohort_or_other');
  });
});
