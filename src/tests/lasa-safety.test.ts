import { describe, expect, test } from 'vitest';
import { drugMentions, latinCandidates, resolveDrugName } from '@/services/drug-naming';
import { findDrug } from '@/knowledge/drugs';

/**
 * Look-alike / sound-alike (LASA) safety. Incident 2026-10-19: „კოლომიცინი"
 * (Colomycin = colistimethate) was resolved by edit distance to „კოლხიცინი"
 * (colchicine) and a colchicine label was summarised under the wrong name.
 * Rule: a name the dictionaries do not know is never replaced by a similar one.
 */
describe('LASA: unknown names are never silently replaced', () => {
  test('Colomycin resolves to colistimethate, not colchicine', () => {
    for (const n of ['კოლომიცინი', 'Colomycin', 'colomycin', 'კოლიმიცინი']) {
      const r = resolveDrugName(n);
      expect(r.inn).toBe('colistimethate');
      expect(latinCandidates(n)).not.toContain('colchicine');
    }
    expect(drugMentions('პაციენტს უკეთდება კოლომიცინი').map((m) => m.inn)).toEqual(['colistimethate']);
  });

  test('colchicine itself still resolves exactly', () => {
    expect(resolveDrugName('კოლხიცინი')).toMatchObject({ inn: 'colchicine', via: 'exact' });
  });

  test.each([
    'კოლომიცინო', // one letter off a known brand → still a question, not an answer
    'მეტოპროლი',
    'ჰიდროქსიზინი',
  ])('%s: near-miss gives no INN and no lookup candidate from the dictionary', (n) => {
    const r = resolveDrugName(n);
    if (r.via === 'fuzzy') {
      expect(r.inn).toBeNull();
      expect(r.suggestion).toBeDefined();
      expect(latinCandidates(n)).not.toContain(r.suggestion!.inn);
    }
    expect(drugMentions(n).length).toBe(0);
  });

  test('free text never turns a look-alike into a drug', () => {
    expect(drugMentions('კოლომიცინო და მეტოპროლი')).toEqual([]);
  });

  test('a short fragment does not pick the first alphabetical drug', () => {
    expect(findDrug('მეტო')).toBeUndefined();
    expect(findDrug('met')).toBeUndefined();
  });

  test('ICU drugs from the clinical collection are in the dictionary', () => {
    for (const [ka, inn] of [
      ['კოლისტინი', 'colistin'],
      ['ნორადრენალინი', 'norepinephrine'],
      ['ადრენალინი', 'epinephrine'],
      ['პროპოფოლი', 'propofol'],
      ['მიდაზოლამი', 'midazolam'],
      ['დექსმედეტომიდინი', 'dexmedetomidine'],
      ['როკურონიუმი', 'rocuronium'],
    ]) expect(resolveDrugName(ka).inn).toBe(inn);
  });
});
