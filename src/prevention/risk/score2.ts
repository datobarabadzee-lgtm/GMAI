/**
 * SCORE2 (40–69 y) and SCORE2-OP (70–89 y) — 10-year risk of fatal and
 * non-fatal cardiovascular disease, recalibrated to an ESC risk region.
 *
 * Coefficients, baseline survivals and regional recalibration scales are those
 * of the SCORE2 / SCORE2-OP publications (Eur Heart J 2021;42:2439 and 2455,
 * supplementary material), as implemented in the CRAN package RiskScorescvd
 * 0.3.1 (11_SCORE2_func.R), from which they were transcribed.
 *
 * Georgia is in the ESC 2021 "very high" risk region.
 *
 * SCORE2 does not apply to people with diabetes, established cardiovascular
 * disease, chronic kidney disease or familial hypercholesterolaemia: they are
 * at high or very high risk by definition and need a clinician, not this model.
 */

export type Score2Region = 'low' | 'moderate' | 'high' | 'very_high';

export type Score2Input = {
  age: number;
  sex: 'female' | 'male';
  smoker: boolean;
  systolicBp: number;
  /** mmol/L */
  totalChol: number;
  /** mmol/L */
  hdlChol: number;
  region?: Score2Region;
};

const SCALES_SCORE2: Record<Score2Region, Record<'male' | 'female', [number, number]>> = {
  low: { male: [-0.5699, 0.7476], female: [-0.738, 0.7019] },
  moderate: { male: [-0.1565, 0.8009], female: [-0.3143, 0.7701] },
  high: { male: [0.3207, 0.936], female: [0.571, 0.9369] },
  very_high: { male: [0.5836, 0.8294], female: [0.9412, 0.8329] },
};

const SCALES_OP: Record<Score2Region, Record<'male' | 'female', [number, number]>> = {
  low: { male: [-0.34, 1.19], female: [-0.52, 1.01] },
  moderate: { male: [0.01, 1.25], female: [-0.1, 1.1] },
  high: { male: [0.08, 1.15], female: [0.38, 1.09] },
  very_high: { male: [0.05, 0.7], female: [0.38, 0.69] },
};

const recalibrate = (uncalibrated: number, [s1, s2]: [number, number]) =>
  1 - Math.exp(-Math.exp(s1 + s2 * Math.log(-Math.log(1 - uncalibrated))));

/** 10-year risk in percent, one decimal. Returns null outside 40–89 years. */
export function score2(input: Score2Input): number | null {
  const { age, sex, systolicBp: sbp, totalChol: tc, hdlChol: hdl } = input;
  const smoker = input.smoker ? 1 : 0;
  const region = input.region ?? 'very_high';
  if (!(age >= 40 && age <= 89)) return null;

  let risk: number;
  if (age < 70) {
    const cage = (age - 60) / 5;
    const csbp = (sbp - 120) / 20;
    const ctc = tc - 6;
    const chdl = (hdl - 1.3) / 0.5;
    // Diabetes terms are part of the model but SCORE2 is not used in diabetes: always 0 here.
    const lp =
      sex === 'male'
        ? 0.3742 * cage + 0.6012 * smoker + 0.2777 * csbp + 0.1458 * ctc - 0.2698 * chdl -
          0.0755 * cage * smoker - 0.0255 * cage * csbp - 0.0281 * cage * ctc + 0.0426 * cage * chdl
        : 0.4648 * cage + 0.7744 * smoker + 0.3131 * csbp + 0.1002 * ctc - 0.2606 * chdl -
          0.1088 * cage * smoker - 0.0277 * cage * csbp - 0.0226 * cage * ctc + 0.0613 * cage * chdl;
    const s0 = sex === 'male' ? 0.9605 : 0.9776;
    risk = recalibrate(1 - Math.pow(s0, Math.exp(lp)), SCALES_SCORE2[region][sex]);
  } else {
    const cage = age - 73;
    const csbp = sbp - 150;
    const ctc = tc - 6;
    const chdl = hdl - 1.4;
    const lp =
      sex === 'male'
        ? 0.0634 * cage + 0.3524 * smoker + 0.0094 * csbp + 0.085 * ctc - 0.3564 * chdl -
          0.0247 * cage * smoker - 0.0005 * cage * csbp + 0.0073 * cage * ctc + 0.0091 * cage * chdl
        : 0.0789 * cage + 0.4921 * smoker + 0.0102 * csbp + 0.0605 * ctc - 0.304 * chdl -
          0.0255 * cage * smoker - 0.0004 * cage * csbp - 0.0009 * cage * ctc + 0.0154 * cage * chdl;
    const uncal = sex === 'male' ? 1 - Math.pow(0.7576, Math.exp(lp - 0.0929)) : 1 - Math.pow(0.8082, Math.exp(lp - 0.229));
    risk = recalibrate(uncal, SCALES_OP[region][sex]);
  }
  return Math.round(risk * 1000) / 10;
}

/**
 * ESC 2021 risk categories for apparently healthy people (age-specific):
 * <50 y: <2.5 % low-to-moderate, 2.5–<7.5 % high, ≥7.5 % very high;
 * 50–69 y: <5 %, 5–<10 %, ≥10 %; ≥70 y: <7.5 %, 7.5–<15 %, ≥15 %.
 */
export function score2Band(age: number, riskPct: number): 'moderate' | 'high' | 'very_high' {
  const [hi, vhi] = age < 50 ? [2.5, 7.5] : age < 70 ? [5, 10] : [7.5, 15];
  if (riskPct >= vhi) return 'very_high';
  if (riskPct >= hi) return 'high';
  return 'moderate';
}

export const SCORE2_BAND_KA: Record<'moderate' | 'high' | 'very_high', string> = {
  moderate: 'დაბალი–ზომიერი',
  high: 'მაღალი',
  very_high: 'ძალიან მაღალი',
};

export const mgdlToMmolChol = (mgdl: number) => mgdl / 38.67;
