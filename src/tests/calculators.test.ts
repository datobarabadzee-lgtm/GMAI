import { describe, expect, it } from 'vitest';
import { CALCULATORS, calculatorById, suggestCalculators } from '@/lib/calculators';

const run = (id: string, input: Record<string, number | boolean | string>) => calculatorById(id)!.compute(input);

describe('calculator registry', () => {
  it('exposes at least the 18 required validated scores', () => {
    expect(CALCULATORS.length).toBeGreaterThanOrEqual(18);
  });

  it('gives every calculator a formula and deterministic compute function', () => {
    CALCULATORS.forEach((c) => {
      expect(c.formulaKa.length).toBeGreaterThan(5);
      expect(typeof c.compute).toBe('function');
    });
  });

  it('produces identical output for identical input (determinism)', () => {
    const input = { age: 81, weight: 58, creat: 1.6, female: true };
    const a = run('crcl', input);
    const b = run('crcl', input);
    expect(a.value).toBe(b.value);
  });
});

describe('CHA2DS2-VASc', () => {
  it('scores the demo AF patient correctly (81f, HTN, CKD, no stroke)', () => {
    const r = run('cha2ds2-vasc', { age: 81, female: true, htn: true, chf: false, dm: false, stroke: false, vascular: false });
    // age >= 75 (2) + hypertension (1) + female (1) = 4
    expect(r.value).toBe(4);
    expect(r.severity).toBe('high');
  });

  it('counts age 65-74 as one point, not two', () => {
    const r = run('cha2ds2-vasc', { age: 70, female: false, htn: false, chf: false, dm: false, stroke: false, vascular: false });
    expect(r.value).toBe(1);
  });

  it('gives prior stroke two points', () => {
    const r = run('cha2ds2-vasc', { age: 50, female: false, stroke: true, htn: false, chf: false, dm: false, vascular: false });
    expect(r.value).toBe(2);
  });

  it('does not present a fabricated numeric annual risk', () => {
    const r = run('cha2ds2-vasc', { age: 81, female: true, htn: true });
    expect(r.interpretationKa).not.toMatch(/\d+(\.\d+)?\s*%/);
  });
});

describe('HAS-BLED', () => {
  it('never presents a high score as a contraindication to anticoagulation', () => {
    const r = run('has-bled', { htn: true, renal: true, stroke: true, bleed: true, elderly: true });
    expect(r.value).toBe(5);
    expect(r.interpretationKa).toContain('არ არის ანტიკოაგულაციაზე უარის');
  });
});

describe('renal function equations', () => {
  it('Cockcroft-Gault matches the hand-calculated value', () => {
    // ((140-81) * 58 * 0.85) / (72 * 1.6) = 25.2
    const r = run('crcl', { age: 81, weight: 58, creat: 1.6, female: true });
    expect(r.value).toBeCloseTo(25.2, 1);
    expect(r.severity).toBe('high');
  });

  it('CKD-EPI 2021 returns a plausible eGFR and a CKD stage', () => {
    const r = run('egfr', { age: 60, creat: 1.0, female: false });
    expect(r.value).toBeGreaterThan(60);
    expect(r.value).toBeLessThan(110);
    expect(r.interpretationKa).toMatch(/CKD სტადია G[12]/);
  });
});

describe('other scores', () => {
  it('GCS sums its three components', () => {
    const r = run('gcs', { eye: 3, verbal: 4, motor: 5 });
    expect(r.value).toBe(12);
    expect(r.display).toContain('E3 V4 M5');
  });

  it('MELD clamps values below 1 and caps creatinine at 4', () => {
    const low = run('meld', { bili: 0.5, inr: 0.9, creat: 0.5 });
    const capped = run('meld', { bili: 2, inr: 1.5, creat: 9 });
    const atFour = run('meld', { bili: 2, inr: 1.5, creat: 4 });
    expect(low.value).toBe(6);
    expect(capped.value).toBe(atFour.value);
  });

  it('Child-Pugh classifies A/B/C by total points', () => {
    expect(run('child-pugh', { bili: 1, alb: 4, inr: 1, ascites: 1, enceph: 1 }).display).toContain('კლასი A');
    expect(run('child-pugh', { bili: 4, alb: 2.5, inr: 2.5, ascites: 3, enceph: 3 }).display).toContain('კლასი C');
  });

  it('QTc reports both Bazett and Fridericia', () => {
    const r = run('qtc', { qt: 440, hr: 60, female: false });
    expect(r.value).toBe(440); // RR = 1s so QTc == QT
    expect(r.display).toContain('Fridericia');
  });

  it('anion gap corrects for albumin', () => {
    const r = run('anion-gap', { na: 140, cl: 100, hco3: 24, alb: 2 });
    // raw 16, corrected 16 + 2.5*2 = 21
    expect(r.value).toBe(16);
    expect(r.display).toContain('21');
    expect(r.severity).toBe('critical');
  });

  it('BSA uses the Mosteller formula', () => {
    const r = run('bsa', { weight: 70, height: 170 });
    expect(r.value).toBeCloseTo(1.82, 2);
  });

  it('PERC is negative only when every criterion is negative', () => {
    expect(run('perc', { age: 40, hr: 80, spo2: 98 }).display).toContain('უარყოფითი');
    expect(run('perc', { age: 55, hr: 80, spo2: 98 }).display).toContain('დადებითი');
  });
});

describe('calculator suggestion', () => {
  it('suggests stroke and anticoagulation scores from a Georgian AF narrative', () => {
    const ids = suggestCalculators('პაციენტს აღენიშნება წინაგულების ფიბრილაცია და საჭიროა ანტიკოაგულაცია').map((c) => c.id);
    expect(ids).toContain('cha2ds2-vasc');
    expect(ids).toContain('has-bled');
  });
});
