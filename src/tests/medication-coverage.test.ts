import { describe, expect, it } from 'vitest';

/**
 * F10 (audit 2026-10-21): the coverage report must match what the runtime does.
 * Classes partition the catalog; the Georgian name of an unapproved crosswalk
 * entry shows no product (no fuzzy or name-only substitution).
 */
describe('medication coverage report', () => {
  it('partitions every MIS entity into exactly one class', async () => {
    // @ts-expect-error plain ESM script without type declarations
    const { coverage } = await import('../../scripts/medication-coverage.mjs');
    const r = coverage();
    const sum = Object.values(r.classes as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(sum).toBe(r.mis_entities);
    expect(r.mis_entities).toBe(29591);
    expect(r.snapshots.fda_mis_package).toBe('2026-10-16');
    expect(r.confirmed_labels_persisted).toBe(0);
  });

  it('a Georgian name with only an unapproved crosswalk stays catalog-only at runtime', async () => {
    const { searchMedication } = await import('@/server/medications/identity');
    const r = await searchMedication('კოლომიცინი');
    expect(r.status).toBe('catalog_name_only');
    expect(r.candidates).toEqual([]);
  });
});
