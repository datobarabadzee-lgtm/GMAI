import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/** Acceptance (audit E): 51 topics / 962 units, verified from the shipped data, presented as reference material. */
describe('clinical-v2 collection size', () => {
  it('ships 51 topics and 962 units, and the catalog agrees with the units', () => {
    const units = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'authored/gmai_clinical_v2/units.json'), 'utf8')).units as { topic_id: string }[];
    const catalog = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/clinical-v2/catalog.json'), 'utf8')) as { topics: { id?: string; topic_id?: string; unitCount: number }[] };
    expect(units.length).toBe(962);
    expect(new Set(units.map((u) => u.topic_id)).size).toBe(51);
    expect(catalog.topics.length).toBe(51);
    expect(catalog.topics.reduce((a, t) => a + t.unitCount, 0)).toBe(962);
  });

  it('is labelled as reference material, not as interactive courses', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/features/clinical-v2/library.tsx'), 'utf8');
    expect(src).toMatch(/არა ინტერაქტიული კურსი/);
  });
});
