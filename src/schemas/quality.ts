import { z } from 'zod';

export const DefectDomainSchema = z.enum([
  'diagnostic',
  'therapeutic',
  'documentation',
  'safety',
  'organizational',
  'communication',
  'consent',
  'anesthesia',
  'critical_care',
  'economic',
]);
export type DefectDomain = z.infer<typeof DefectDomainSchema>;

export const DEFECT_DOMAIN_KA: Record<DefectDomain, string> = {
  diagnostic: 'დიაგნოსტიკური',
  therapeutic: 'თერაპიული',
  documentation: 'დოკუმენტაციის',
  safety: 'უსაფრთხოების',
  organizational: 'ორგანიზაციული',
  communication: 'კომუნიკაციის',
  consent: 'ინფორმირებული თანხმობის',
  anesthesia: 'ანესთეზიოლოგიური',
  critical_care: 'ICU / კრიტიკული მედიცინის',
  economic: 'ეკონომიკური / ლოგისტიკური',
};

export const DefectObjectSchema = z.object({
  id: z.string(),
  domain: DefectDomainSchema,
  titleKa: z.string(),
  expectedStandard: z.string(),
  actualCare: z.string(),
  deviation: z.string(),
  deviationJustified: z.enum(['justified', 'partially_justified', 'not_justified', 'cannot_determine']),
  justificationNote: z.string().default(''),
  potentialHarm: z.enum(['none_identified', 'potential', 'probable', 'cannot_determine']),
  harmNote: z.string().default(''),
  causality: z.enum(['not_assessable', 'unlikely', 'possible', 'probable']).default('not_assessable'),
  documentationIssue: z.string().default(''),
  severity: z.enum(['critical', 'high', 'moderate', 'low']),
  confidence: z.enum(['high', 'moderate', 'low']),
  correctiveAction: z.string().default(''),
  preventiveAction: z.string().default(''),
  rootCauseCategory: z
    .enum(['human_factor', 'process', 'communication', 'technology', 'environment', 'training', 'governance', 'undetermined'])
    .default('undetermined'),
  sources: z.array(z.string()).default([]),
  humanReviewRequired: z.literal(true).default(true),
});
export type DefectObject = z.infer<typeof DefectObjectSchema>;

export const DefectReviewModeSchema = z.enum(['patient', 'clinician', 'clinic_defense', 'regulator']);
export type DefectReviewMode = z.infer<typeof DefectReviewModeSchema>;

export const DEFECT_MODE_KA: Record<DefectReviewMode, string> = {
  patient: 'პაციენტის მიმოხილვა',
  clinician: 'ექიმის მიმოხილვა',
  clinic_defense: 'კლინიკის დაცვის მიმოხილვა',
  regulator: 'მარეგულირებლის / ინსპექტორის მიმოხილვა',
};
