/**
 * FINDRISC — Finnish Diabetes Risk Score (Lindström & Tuomilehto), the
 * self-completed eight-question version. Points and bands as published on the
 * clinician tool of the Canadian Task Force on Preventive Health Care (2012).
 */

export type FindriscInput = {
  age: number;
  sex: 'female' | 'male';
  bmi: number;
  waistCm: number;
  activeDaily30: boolean;
  vegFruitDaily: boolean;
  bpMedication: boolean;
  everHighGlucose: boolean;
  familyDiabetes: 'none' | 'second' | 'first';
};

export function findriscPoints(i: FindriscInput): number {
  let p = 0;
  p += i.age < 45 ? 0 : i.age < 55 ? 2 : i.age < 65 ? 3 : 4;
  p += i.bmi < 25 ? 0 : i.bmi < 30 ? 1 : 3;
  if (i.sex === 'male') p += i.waistCm < 94 ? 0 : i.waistCm <= 102 ? 3 : 4;
  else p += i.waistCm < 80 ? 0 : i.waistCm <= 88 ? 3 : 4;
  p += i.activeDaily30 ? 0 : 2;
  p += i.vegFruitDaily ? 0 : 1;
  p += i.bpMedication ? 2 : 0;
  p += i.everHighGlucose ? 5 : 0;
  p += i.familyDiabetes === 'first' ? 5 : i.familyDiabetes === 'second' ? 3 : 0;
  return p;
}

/** Original FINDRISC bands and the 10-year probability of type 2 diabetes each carries. */
export function findriscBand(points: number): { band: 'low' | 'moderate' | 'high' | 'very_high'; labelKa: string; riskKa: string } {
  if (points < 7) return { band: 'low', labelKa: 'დაბალი', riskKa: 'დაახლოებით 100-დან 1' };
  if (points <= 11) return { band: 'low', labelKa: 'ოდნავ მომატებული', riskKa: 'დაახლოებით 25-დან 1' };
  if (points <= 14) return { band: 'moderate', labelKa: 'ზომიერი', riskKa: 'დაახლოებით 6-დან 1' };
  if (points <= 20) return { band: 'high', labelKa: 'მაღალი', riskKa: 'დაახლოებით 3-დან 1' };
  return { band: 'very_high', labelKa: 'ძალიან მაღალი', riskKa: 'დაახლოებით 2-დან 1' };
}
