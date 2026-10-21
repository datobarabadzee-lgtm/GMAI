import { z } from 'zod';

/** Core clinical data objects (Blueprint Appendix B). */

export const SexSchema = z.enum(['male', 'female', 'unspecified']);
export type Sex = z.infer<typeof SexSchema>;

export const MedicationSchema = z.object({
  id: z.string(),
  drug: z.string().min(1),
  dose: z.string().default(''),
  frequency: z.string().default(''),
  route: z.string().default(''),
  indication: z.string().default(''),
  startDate: z.string().default(''),
  status: z.enum(['active', 'stopped', 'held', 'unknown']).default('active'),
});
export type Medication = z.infer<typeof MedicationSchema>;

export const LabValueSchema = z.object({
  id: z.string(),
  analyte: z.string().min(1),
  value: z.number(),
  unit: z.string().default(''),
  date: z.string().default(''),
  refLow: z.number().optional(),
  refHigh: z.number().optional(),
});
export type LabValue = z.infer<typeof LabValueSchema>;

export const TimelineEventSchema = z.object({
  id: z.string(),
  date: z.string().default(''),
  category: z.enum(['encounter', 'symptom', 'investigation', 'treatment', 'procedure', 'document', 'other']).default('other'),
  title: z.string(),
  detail: z.string().default(''),
});
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export const PatientContextSchema = z.object({
  label: z.string().default('უსახელო ქეისი'),
  age: z.number().int().min(0).max(130).nullable().default(null),
  ageUnit: z.enum(['years', 'months', 'days']).default('years'),
  sex: SexSchema.default('unspecified'),
  pregnant: z.enum(['no', 'yes', 'unknown', 'not-applicable']).default('not-applicable'),
  breastfeeding: z.boolean().default(false),
  weightKg: z.number().positive().nullable().default(null),
  heightCm: z.number().positive().nullable().default(null),
  creatinineMgDl: z.number().positive().nullable().default(null),
  egfr: z.number().positive().nullable().default(null),
  hepaticImpairment: z.enum(['none', 'mild', 'moderate', 'severe', 'unknown']).default('unknown'),
  allergies: z.array(z.string()).default([]),
  problems: z.array(z.string()).default([]),
  medications: z.array(MedicationSchema).default([]),
  labs: z.array(LabValueSchema).default([]),
  timeline: z.array(TimelineEventSchema).default([]),
  narrative: z.string().default(''),
  documents: z.array(z.object({ id: z.string(), name: z.string(), text: z.string() })).default([]),
});
export type PatientContext = z.infer<typeof PatientContextSchema>;

export const emptyPatientContext = (): PatientContext => PatientContextSchema.parse({});

/** Risk classes R0–R5 (master spec §7). */
export const RiskClassSchema = z.enum(['R0', 'R1', 'R2', 'R3', 'R4', 'R5']);
export type RiskClass = z.infer<typeof RiskClassSchema>;

export const RISK_LABELS: Record<RiskClass, { ka: string; en: string; tone: string }> = {
  R0: { ka: 'ადმინისტრაციული', en: 'Administrative', tone: 'text-slate-300' },
  R1: { ka: 'საგანმანათლებლო / ზოგადი', en: 'Educational / general', tone: 'text-clinical-info' },
  R2: { ka: 'დაბალი რისკის კლინიკური ინფორმაცია', en: 'Low-risk clinical information', tone: 'text-clinical-low' },
  R3: { ka: 'პაციენტ-სპეციფიკური CDS', en: 'Patient-specific CDS', tone: 'text-clinical-moderate' },
  R4: { ka: 'მაღალი რისკის პაციენტ-სპეციფიკური გადაწყვეტილება', en: 'High-risk patient-specific decision', tone: 'text-clinical-high' },
  R5: { ka: 'დროით კრიტიკული / გადაუდებელი', en: 'Time-critical / emergency', tone: 'text-clinical-critical' },
};

export const ClinicalModeSchema = z.enum([
  'quick',
  'deep',
  'evidence',
  'challenge',
  'missing',
  'quality',
  'second-opinion',
  'patient',
]);
export type ClinicalMode = z.infer<typeof ClinicalModeSchema>;

export const IntentSchema = z.enum([
  'clinical_reasoning',
  'differential',
  'evidence',
  'guideline_comparison',
  'drug',
  'medication_review',
  'calculator',
  'laboratory',
  'documentation',
  'quality',
  'defect',
  'patient_education',
  'academy',
  'research',
  'imaging',
  'administrative',
]);
export type Intent = z.infer<typeof IntentSchema>;

export const UncertaintySchema = z.object({
  level: z.enum(['low', 'moderate', 'high']),
  drivers: z.array(z.string()).default([]),
});

export const ClinicalSectionSchema = z.object({
  id: z.string(),
  titleKa: z.string(),
  titleEn: z.string(),
  body: z.string().default(''),
  bullets: z.array(z.string()).default([]),
  tone: z.enum(['neutral', 'warning', 'critical', 'positive']).default('neutral'),
});
export type ClinicalSection = z.infer<typeof ClinicalSectionSchema>;

export const ClinicalAnswerSchema = z.object({
  queryId: z.string(),
  mode: ClinicalModeSchema,
  intent: IntentSchema,
  risk: RiskClassSchema,
  emergency: z.boolean().default(false),
  bottomLine: z.string(),
  sections: z.array(ClinicalSectionSchema),
  claims: z.array(z.string()).default([]),
  agentsUsed: z.array(z.string()).default([]),
  uncertainty: UncertaintySchema,
  humanReviewRequired: z.boolean().default(false),
  generatedAt: z.string(),
  engine: z.enum(['mock', 'live']),
});
export type ClinicalAnswer = z.infer<typeof ClinicalAnswerSchema>;
