/**
 * PREVENTION MODULE — shared types.
 *
 * The plan is produced by versioned, deterministic rules (src/prevention/rules).
 * The AI layer only explains a finished plan; it can neither add nor remove a
 * recommendation, change an interval or a status, or name a dose.
 */

export type Sex = 'female' | 'male';

export type SmokingStatus = 'never' | 'former' | 'current';

export type CholUnit = 'mmol/L' | 'mg/dL';
export type GlucoseUnit = 'mmol/L' | 'mg/dL';

export type FamilyHistory = {
  /** First-degree relative with heart attack or stroke before 55 (men) / 65 (women). */
  earlyCvd?: boolean;
  colorectalCancer?: boolean;
  breastOrOvarianCancer?: boolean;
  /** For FINDRISC: none, second-degree, or first-degree relative with diabetes. */
  diabetes?: 'none' | 'second' | 'first';
};

export type ChronicCondition =
  | 'diabetes'
  | 'cvd'
  | 'ckd'
  | 'copd_asthma'
  | 'immunosuppression'
  | 'liver'
  | 'hypertension_treated';

export type VaccineId = 'influenza' | 'td' | 'pneumococcal' | 'hpv' | 'hepb' | 'mmr' | 'zoster' | 'rsv';

export type PreventionInput = {
  age?: number;
  sex?: Sex;
  heightCm?: number;
  weightKg?: number;
  waistCm?: number;
  smoking?: SmokingStatus;
  packYears?: number;
  /** Calendar year in which a former smoker quit. */
  quitYear?: number;
  systolicBp?: number;
  diastolicBp?: number;
  totalChol?: number;
  hdlChol?: number;
  cholUnit?: CholUnit;
  glucoseFasting?: number;
  glucoseUnit?: GlucoseUnit;
  hba1c?: number;
  family?: FamilyHistory;
  pregnant?: boolean;
  planningPregnancy?: boolean;
  postmenopausal?: boolean;
  conditions?: ChronicCondition[];
  /** FINDRISC items the patient answers themselves. */
  activeDaily30?: boolean;
  vegFruitDaily?: boolean;
  everHighGlucose?: boolean;
  /** ISO dates (YYYY-MM-DD) of the last time each screening rule's test was done, keyed by rule group. */
  lastDone?: Record<string, string>;
  /** Vaccination status the patient reports, keyed by vaccine id. */
  vaccines?: Partial<Record<VaccineId, { done?: boolean; lastDate?: string }>>;
  /** Red-flag symptoms ticked on the intake screen. */
  redFlags?: string[];
};

export type Source = {
  org: string;
  title: string;
  year: number;
  url: string;
  /** Strength of recommendation or evidence grade, as the source states it (e.g. USPSTF B). */
  grade?: string;
};

export type ReviewStatus = 'DRAFT' | 'CLINICALLY_REVIEWED';

export type ScreeningStatus =
  /** Done within the interval; next date known. */
  | 'up_to_date'
  /** Done, but the interval has passed. */
  | 'overdue'
  /** Applies, no date entered: do it now. */
  | 'due'
  /** Applies only after a conversation with a doctor (shared decision). */
  | 'discuss'
  /** Could apply, but a required answer is missing. */
  | 'needs_data'
  /** Does not apply to this person (age, sex or risk). */
  | 'not_needed';

export type PlanItem = {
  id: string;
  group: string;
  titleKa: string;
  shortKa: string;
  icon: string;
  status: ScreeningStatus;
  frequencyKa: string;
  /** Why it is (or is not) on this person's plan. */
  reasonKa: string;
  whyKa: string;
  howKa?: string;
  lastDone?: string;
  nextDue?: string;
  /** Interval in months, when the rule has a fixed one. */
  intervalMonths?: number;
  missingKa?: string[];
  sources: Source[];
  reviewStatus: ReviewStatus;
};

export type RiskBand = 'low' | 'moderate' | 'high' | 'very_high';

export type RiskResult = {
  id: 'score2' | 'findrisc' | 'bmi' | 'waist' | 'bp' | 'glycaemia';
  titleKa: string;
  available: boolean;
  /** Numeric result (percent for SCORE2, points for FINDRISC, kg/m² for BMI …). */
  value?: number;
  unitKa?: string;
  band?: RiskBand;
  bandKa?: string;
  summaryKa: string;
  missingKa?: string[];
  /** The single change that lowers risk the most, recomputed by the same model. */
  leverKa?: string;
  leverFrom?: number;
  leverTo?: number;
  sources: Source[];
};

export type VaccineItem = {
  id: VaccineId | 'pregnancy_flu' | 'pregnancy_tdap' | 'pregnancy_rsv';
  titleKa: string;
  status: 'recommended' | 'up_to_date' | 'consider' | 'not_needed';
  frequencyKa: string;
  reasonKa: string;
  noteKa?: string;
  nextDue?: string;
  sources: Source[];
  reviewStatus: ReviewStatus;
};

export type PreconceptionItem = {
  id: string;
  titleKa: string;
  textKa: string;
  actionKa?: string;
  link?: string;
  sources: Source[];
  reviewStatus: ReviewStatus;
};

export type LowValueItem = {
  id: string;
  titleKa: string;
  whyNotKa: string;
  insteadKa: string;
  /** Applies to this person (age/sex) — shown first. */
  relevant: boolean;
  sources: Source[];
  registryId?: string;
  reviewStatus: ReviewStatus;
};

export type GoalItem = {
  id: string;
  titleKa: string;
  targetKa: string;
  whyKa: string;
  stepsKa: string[];
  sources: Source[];
  reviewStatus: ReviewStatus;
};

export type WarningCard = {
  id: string;
  titleKa: string;
  signsKa: string[];
  actionKa: string;
  call112: boolean;
  sources: Source[];
};

export type RedFlag = { id: string; labelKa: string; level: 'emergency' | 'urgent'; adviceKa: string };

export type PreventionPlan =
  | {
      kind: 'NEEDS_PATIENT_DATA';
      missingKa: string[];
      rulesVersion: string;
    }
  | {
      kind: 'RED_FLAG_STOP';
      flags: RedFlag[];
      emergency: boolean;
      rulesVersion: string;
    }
  | {
      kind: 'PLAN';
      rulesVersion: string;
      generatedFor: string;
      ageYears: number;
      sex: Sex;
      screening: PlanItem[];
      risks: RiskResult[];
      vaccines: VaccineItem[];
      preconception: PreconceptionItem[] | null;
      lowValue: LowValueItem[];
      goals: GoalItem[];
      warnings: WarningCard[];
      /** Inputs the plan would use but did not get — stated, never assumed. */
      missingKa: string[];
      counts: { due: number; overdue: number; upToDate: number; discuss: number; needsData: number };
    };
