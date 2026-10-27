import { describe, expect, it } from 'vitest';
import { auditC, auditCPositive, framinghamHypertension, lifeYearsGained, ostScore, plcom2012 } from '@/prevention/risk/more-models';

// Reference values computed independently from the published equations (Python), not from this code.
describe('PLCOm2012 lung-cancer model', () => {
  const base = { age: 62, education: 4 as const, bmi: 27, copd: false, personalCancer: false, familyLungCancer: false, current: true, cigsPerDay: 20, yearsSmoked: 27, yearsSinceQuit: 0 };
  it('matches the equation at the centring values', () => {
    expect(plcom2012(base)).toBe(1.56);
  });
  it('matches a former smoker with COPD and family history', () => {
    expect(plcom2012({ age: 70, education: 2, bmi: 24, copd: true, personalCancer: false, familyLungCancer: true, current: false, cigsPerDay: 30, yearsSmoked: 45, yearsSinceQuit: 5 })).toBe(13.34);
  });
  it('quitting lowers risk and longer abstinence lowers it further', () => {
    const current = plcom2012(base);
    const quit5 = plcom2012({ ...base, current: false, yearsSinceQuit: 5 });
    const quit15 = plcom2012({ ...base, current: false, yearsSinceQuit: 15 });
    expect(quit5).toBeLessThan(current);
    expect(quit15).toBeLessThan(quit5);
  });
});

describe('Framingham 4-year hypertension risk', () => {
  it('matches the equation', () => {
    expect(framinghamHypertension({ age: 40, female: false, sbp: 120, dbp: 80, bmi: 25, smoker: false, parents: 0 })).toBe(7.4);
    expect(framinghamHypertension({ age: 55, female: true, sbp: 135, dbp: 85, bmi: 31, smoker: true, parents: 2 })).toBe(70.4);
  });
  it('rises with blood pressure and weight', () => {
    const a = framinghamHypertension({ age: 45, female: true, sbp: 118, dbp: 76, bmi: 24, smoker: false, parents: 1 });
    const b = framinghamHypertension({ age: 45, female: true, sbp: 132, dbp: 84, bmi: 30, smoker: false, parents: 1 });
    expect(b).toBeGreaterThan(a);
  });
});

describe('OST, AUDIT-C, WHO quit benefits', () => {
  it('OST truncates 0.2 × (weight − age)', () => {
    expect(ostScore(60, 70)).toBe(-2);
    expect(ostScore(80, 65)).toBe(3);
    expect(ostScore(64, 55)).toBe(1);
  });
  it('AUDIT-C scores and sex-specific cut-offs', () => {
    expect(auditC(2, 1, 0)).toBe(3);
    expect(auditCPositive(3, true)).toBe(true);
    expect(auditCPositive(3, false)).toBe(false);
    expect(auditCPositive(4, false)).toBe(true);
  });
  it('life-years gained follows the WHO table', () => {
    expect(lifeYearsGained(31)?.years).toBe(10);
    expect(lifeYearsGained(52)?.years).toBe(6);
    expect(lifeYearsGained(80)).toBeNull();
  });
});
