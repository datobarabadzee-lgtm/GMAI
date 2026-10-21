import { describe, expect, it } from 'vitest';
import { parseLabText } from '@/lib/labs';

describe('lab parsing — real clinician input', () => {
  it('reads a comma-separated inline list on one line', () => {
    const v = parseLabText('Na 128, K 3.1, კრეატინინი 1.2, eGFR 44, TSH 8.2');
    expect(v.map((x) => x.analyte)).toEqual(['Na', 'K', 'კრეატინინი', 'eGFR', 'TSH']);
    expect(v.map((x) => x.value)).toEqual([128, 3.1, 1.2, 44, 8.2]);
  });

  it('reads Georgian names with units', () => {
    const v = parseLabText('ჰემოგლობინი 9.8 გ/დლ, ფერიტინი 8 ნგ/მლ');
    expect(v).toHaveLength(2);
    expect(v[0].unit).toBe('გ/დლ');
    expect(v[1].value).toBe(8);
  });

  it('reads colon and equals separators', () => {
    const v = parseLabText('K: 3.1\nNa=128');
    expect(v.map((x) => x.value)).toEqual([3.1, 128]);
  });

  it('still reads a delimited table with a date', () => {
    const v = parseLabText('ჰემოგლობინი; 9.8; გ/დლ; 2026-10-01');
    expect(v).toHaveLength(1);
    expect(v[0].date).toBe('2026-10-01');
    expect(v[0].unit).toBe('გ/დლ');
  });

  it('skips header rows and junk', () => {
    expect(parseLabText('მაჩვენებელი; შედეგი')).toHaveLength(0);
    expect(parseLabText('აქ რიცხვი არ არის')).toHaveLength(0);
    expect(parseLabText('')).toHaveLength(0);
  });

  it('does not treat a bare number as an analyte', () => {
    expect(parseLabText('128, 3.1')).toHaveLength(0);
  });

  it('deduplicates the same analyte and value', () => {
    expect(parseLabText('Na 128\nNa 128')).toHaveLength(1);
  });
});
