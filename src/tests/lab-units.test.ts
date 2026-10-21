import { describe, expect, it } from 'vitest';
import { findRef, interpretLabs, parseLabText, extractLabsFromProse } from '@/lib/labs';
import { emptyPatientContext } from '@/schemas/clinical';

/** F02 (audit 2026-10-21): every interpretation reads the value in the analyte's canonical unit. */

const lab = (analyte: string, value: number, unit: string, extra: Record<string, unknown> = {}) => ({ id: `${analyte}-${value}-${unit}`, analyte, value, unit, date: '', ...extra });

describe('unit normalisation', () => {
  it('hemoglobin 14 g/dL and 140 g/L are the same result', () => {
    const [a, b] = interpretLabs([lab('hemoglobin', 14, 'g/dL'), lab('hemoglobin', 140, 'g/L')]).results;
    expect(a.status).toBe('normal');
    expect(b.status).toBe(a.status);
    expect(b.canonicalValue).toBe(14);
    expect(b.value).toBe(140);
    expect(b.unit).toBe('g/L');
  });

  it('critical limits and patterns use the normalised value', () => {
    const r = interpretLabs([lab('hemoglobin', 65, 'გ/ლ')]);
    expect(r.results[0].status).toBe('critical_low');
    const cr = interpretLabs([lab('creatinine', 300, 'µmol/L')]).results[0];
    expect(cr.canonicalValue).toBeCloseTo(3.393, 2);
    expect(cr.status).toBe('critical_high');
  });

  it('an unknown or incompatible unit stops interpretation', () => {
    const r = interpretLabs([lab('hemoglobin', 14, 'mg/kg')]).results[0];
    expect(r.status).toBe('unknown');
    expect(r.noteKa).toMatch(/დააზუსტეთ ერთეული/);
  });

  it('a missing unit is inferred only when the value fits exactly one unit, and the inference is stated', () => {
    const hb = interpretLabs([lab('ჰემოგლობინი', 9.1, '')]).results[0];
    expect(hb.status).toBe('low');
    expect(hb.unitInferred).toBe(true);
    expect(hb.noteKa).toMatch(/ერთეული არ იყო მითითებული/);
    const glu = interpretLabs([lab('glucose', 30, '')]).results[0];
    expect(glu.status).toBe('unknown');
    expect(glu.noteKa).toMatch(/დააზუსტეთ ერთეული/);
  });

  it('BUN and urea are different analytes', () => {
    expect(findRef('BUN')?.key).toBe('bun');
    expect(findRef('urea')?.key).toBe('urea');
    expect(interpretLabs([lab('BUN', 15, 'mg/dL')]).results[0].status).toBe('normal');
  });

  it('the laboratory’s own reference range is not overwritten by the built-in one', () => {
    const r = interpretLabs([lab('creatinine', 1.25, 'mg/dL', { refLow: 0.7, refHigh: 1.3 })]).results[0];
    expect(r.status).toBe('normal');
    expect(r.refSource).toBe('lab');
    const builtin = interpretLabs([lab('creatinine', 1.25, 'mg/dL')]).results[0];
    expect(builtin.status).toBe('high');
    expect(builtin.refSource).toBe('builtin_unvalidated');
  });

  it('adult built-in ranges are not applied to a child', () => {
    const p = { ...emptyPatientContext(), age: 6 };
    const r = interpretLabs([lab('hemoglobin', 11, 'g/dL')], p).results[0];
    expect(r.status).toBe('unknown');
    expect(r.noteKa).toMatch(/ბავშვის/);
  });

  it('trends compare normalised values across units', () => {
    const t = interpretLabs([
      { ...lab('creatinine', 88.42, 'µmol/L'), date: '2026-01-01' },
      { ...lab('creatinine', 1.6, 'mg/dL'), date: '2026-06-01' },
    ]).trends[0];
    expect(t.direction).toBe('rising');
    expect(t.deltaPct).toBe(60);
  });

  it('parsers keep the written unit and never copy built-in ranges into the value', () => {
    const [row] = parseLabText('Hemoglobin; 140; g/L');
    expect(row.unit).toBe('g/L');
    expect(row.refLow).toBeUndefined();
    const [p] = extractLabsFromProse('ჰემოგლობინი 9.1');
    expect(p.unit).toBe('');
    expect(p.refLow).toBeUndefined();
  });
});
