/**
 * Additional published risk models for the simulator hub. Each one is the
 * model exactly as its source publishes it; the source is named next to it.
 */

/* ── Lung cancer: PLCOm2012 ──────────────────────────────────────────────
 * Tammemägi MC et al. Selection criteria for lung-cancer screening.
 * N Engl J Med 2013;368:728-36, Table 2 (PMC3929969). 6-year probability of
 * lung cancer in people who have ever smoked. Race is fixed at the reference
 * group (White), which is the appropriate group for Georgia's population.
 */
export type LungInput = {
  age: number;
  /** 1 < high school … 4 some college … 6 postgraduate */
  education: 1 | 2 | 3 | 4 | 5 | 6;
  bmi: number;
  copd: boolean;
  personalCancer: boolean;
  familyLungCancer: boolean;
  current: boolean;
  cigsPerDay: number;
  yearsSmoked: number;
  /** 0 for current smokers */
  yearsSinceQuit: number;
};

export function plcom2012(i: LungInput): number {
  const intensity = Math.pow(Math.max(1, i.cigsPerDay) / 10, -1) - 0.4021541613;
  const logit =
    -4.532506 +
    0.0778868 * (i.age - 62) +
    -0.0812744 * (i.education - 4) +
    -0.0274194 * (i.bmi - 27) +
    0.3553063 * (i.copd ? 1 : 0) +
    0.4589971 * (i.personalCancer ? 1 : 0) +
    0.587185 * (i.familyLungCancer ? 1 : 0) +
    0.2597431 * (i.current ? 1 : 0) +
    -1.822606 * intensity +
    0.0317321 * (i.yearsSmoked - 27) +
    -0.0308572 * ((i.current ? 0 : i.yearsSinceQuit) - 10);
  const p = Math.exp(logit) / (1 + Math.exp(logit));
  return Math.round(p * 10000) / 100;
}

/** Risk threshold used to select people for screening in the PLCOm2012 literature (6-year risk ≥1.51%). */
export const PLCO_THRESHOLD = 1.51;

/* ── Hypertension: Framingham 4-year risk ────────────────────────────────
 * Parikh NI et al. Ann Intern Med 2008;148:102-10. Weibull model; β and scale
 * as reproduced in Koohi F et al., BMC Public Health 2021;21:794, Table S1.
 * Valid for people aged 20–69 without hypertension (BP below 140/90) or diabetes.
 * Parental hypertension enters per category step (none 0, one parent 1, both 2).
 */
export type HtnInput = { age: number; female: boolean; sbp: number; dbp: number; bmi: number; smoker: boolean; parents: 0 | 1 | 2 };

export function framinghamHypertension(i: HtnInput, years = 4): number {
  const xb =
    22.94954 +
    -0.15641 * i.age +
    -0.20293 * (i.female ? 1 : 0) +
    -0.05933 * i.sbp +
    -0.12847 * i.dbp +
    -0.19073 * (i.smoker ? 1 : 0) +
    -0.16612 * i.parents +
    -0.03388 * i.bmi +
    0.00162 * i.age * i.dbp;
  const p = 1 - Math.exp(-Math.exp((Math.log(years) - xb) / 0.87692));
  return Math.round(p * 1000) / 10;
}

/* ── Osteoporosis: OST ────────────────────────────────────────────────────
 * OST = 0.2 × (weight kg − age), truncated. A score below 2 → refer for DXA
 * (Richy F et al. QJM 2004;97:39-46, postmenopausal Caucasian women).
 */
export function ostScore(weightKg: number, age: number): number {
  return Math.trunc(0.2 * (weightKg - age));
}
export const OST_DXA_BELOW = 2;

/* ── Alcohol: AUDIT-C ─────────────────────────────────────────────────────
 * Three questions scored 0–4 (WHO AUDIT items 1–3). Positive screen:
 * ≥4 men, ≥3 women (Bradley KA et al. Alcohol Clin Exp Res 2007;31:1208-17).
 */
export function auditC(q1: number, q2: number, q3: number): number {
  return [q1, q2, q3].reduce((a, b) => a + Math.max(0, Math.min(4, b)), 0);
}
export const auditCPositive = (score: number, female: boolean) => score >= (female ? 3 : 4);

/* ── Quitting smoking: WHO ────────────────────────────────────────────────
 * Life expectancy gained by quitting, versus continuing (WHO Q&A „Tobacco:
 * health benefits of smoking cessation“, 2020): ~30 y almost 10, ~40 y 9,
 * ~50 y 6, ~60 y 3 years. Returns the figure for the nearest stated age.
 */
export function lifeYearsGained(age: number): { atAge: number; years: number; almost: boolean } | null {
  if (age < 25 || age > 70) return null;
  const rows = [
    { atAge: 30, years: 10, almost: true },
    { atAge: 40, years: 9, almost: false },
    { atAge: 50, years: 6, almost: false },
    { atAge: 60, years: 3, almost: false },
  ];
  return rows.reduce((best, r) => (Math.abs(r.atAge - age) < Math.abs(best.atAge - age) ? r : best));
}
