import { describe, expect, it } from 'vitest';
import { MAX_BYTES, ParseError, extractFacts, parseFile } from '@/lib/parsers';

const buf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe('file parsing', () => {
  it('reads plain text', async () => {
    const r = await parseFile('note.txt', buf('პაციენტი 68 წლის'));
    expect(r.text).toContain('68');
    expect(r.type).toBe('txt');
  });

  it('reads markdown', async () => {
    const r = await parseFile('note.md', buf('# სათაური\nტექსტი'));
    expect(r.text).toContain('სათაური');
  });

  it('reads CSV', async () => {
    const r = await parseFile('labs.csv', buf('analyte,value\nSodium,128'));
    expect(r.type).toBe('csv');
    expect(r.text).toContain('Sodium');
  });

  it('rejects an unsupported file type with a Georgian message', async () => {
    await expect(parseFile('image.bmp', buf('x'))).rejects.toBeInstanceOf(ParseError);
    try {
      await parseFile('image.bmp', buf('x'));
    } catch (e) {
      expect((e as ParseError).code).toBe('UNSUPPORTED_TYPE');
      expect((e as ParseError).messageKa).toContain('არ არის მხარდაჭერილი');
    }
  });

  it('rejects an empty text file', async () => {
    try {
      await parseFile('empty.txt', buf('   '));
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as ParseError).code).toBe('EMPTY');
    }
  });

  it('rejects an oversized file', async () => {
    const big = new ArrayBuffer(MAX_BYTES + 1);
    try {
      await parseFile('big.txt', big);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as ParseError).code).toBe('TOO_LARGE');
    }
  });

  it('reports a corrupt PDF as unreadable rather than returning empty text silently', async () => {
    try {
      await parseFile('broken.pdf', buf('not really a pdf'));
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as ParseError).code).toBe('UNREADABLE');
    }
  });
});

describe('clinical fact extraction', () => {
  const text = `პაციენტი მიმართა 2026-09-06 გულმკერდის ტკივილით.
ჩაუტარდა ეკგ და ტროპონინი არ განსაზღვრულა.
დიაგნოზი: კარდიალგია
ინიშნება: ამლოდიპინი 5 მგ
ოპერაცია არ ჩატარებულა.`;

  it('extracts diagnoses, medications, investigations and dates', () => {
    const f = extractFacts(text);
    expect(f.diagnoses.join(' ')).toContain('კარდიალგია');
    expect(f.medications.join(' ')).toContain('ამლოდიპინი');
    expect(f.investigations.join(' ')).toMatch(/ეკგ|ტროპონინ/);
    expect(f.dates).toContain('2026-09-06');
  });

  it('flags missing consent and allergy documentation as potential inconsistencies', () => {
    const f = extractFacts(text);
    expect(f.inconsistencies.join(' ')).toContain('თანხმობის');
    expect(f.inconsistencies.join(' ')).toContain('ალერგიული');
  });

  it('flags a document with no diagnosis at all', () => {
    const f = extractFacts('პაციენტი მოვიდა და წავიდა.');
    expect(f.inconsistencies.join(' ')).toContain('დიაგნოზი ვერ იდენტიფიცირდა');
  });
});
