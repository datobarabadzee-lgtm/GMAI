import { describe, expect, it } from 'vitest';

/**
 * F12 (audit 2026-10-21): retrieval is lexical and says so. This measures it on
 * synthetic paraphrases (Georgian / English / lay) — a characterization, not a
 * tuned benchmark. Exact terms must always work; the paraphrase figures are
 * reported in docs/RETRIEVAL_EVAL.md and KNOWN_LIMITATIONS.md.
 */
describe('clinical-v2 retrieval on paraphrases', () => {
  it('finds every topic by its exact Georgian term and labels the method as non-semantic', async () => {
    const { evalRetrieval } = await import('../../scripts/eval-retrieval');
    const { recall, rows } = await evalRetrieval();
    expect(recall.exact).toBe(1);
    expect(recall.english).toBeGreaterThanOrEqual(0.75);
    expect(rows.length).toBe(32);
    const { clinicalV2Search } = await import('@/kb/clinical-v2-search');
    const { trace } = await clinicalV2Search('მასიური ტრანსფუზია', { limit: 3 });
    expect(trace.embedding.semantic).toBe(false);
    expect(trace.embedding.labelKa).toMatch(/სემანტიკური ძიება ჩართული არ არის/);
  });
});
