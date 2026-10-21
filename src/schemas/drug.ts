import { z } from 'zod';

export const DrugSchema = z.object({
  id: z.string(),
  generic_name: z.string(),
  generic_ka: z.string().default(''),
  brand_names: z.array(z.string()).default([]),
  atc: z.string().default(''),
  class: z.string().default(''),
  formulation: z.array(z.string()).default([]),
  route: z.array(z.string()).default([]),
  indications: z.array(z.string()).default([]),
  adult_dose: z.string().default(''),
  pediatric_dose: z.string().default(''),
  renal_adjustment: z.array(z.object({ threshold: z.string(), action: z.string() })).default([]),
  hepatic_adjustment: z.string().default(''),
  pregnancy: z.string().default(''),
  lactation: z.string().default(''),
  contraindications: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  adverse_effects: z.array(z.string()).default([]),
  monitoring: z.array(z.string()).default([]),
  withdrawal: z.string().default(''),
  taper: z.string().default(''),
  overdose: z.string().default(''),
  georgia_availability: z.string().default(''),
  properties: z
    .object({
      anticholinergic: z.number().min(0).max(3).default(0),
      sedative: z.number().min(0).max(3).default(0),
      bleeding: z.number().min(0).max(3).default(0),
      qt: z.number().min(0).max(3).default(0),
      serotonergic: z.number().min(0).max(3).default(0),
      nephrotoxic: z.number().min(0).max(3).default(0),
      fallRisk: z.number().min(0).max(3).default(0),
    })
    .default({}),
  sources: z.array(z.string()).default([]),
});
export type Drug = z.infer<typeof DrugSchema>;

export const InteractionSchema = z.object({
  id: z.string(),
  a: z.string(),
  b: z.string(),
  severity: z.enum(['contraindicated', 'major', 'moderate', 'minor']),
  mechanism: z.string(),
  effect: z.string(),
  management: z.string(),
  sources: z.array(z.string()).default([]),
});
export type Interaction = z.infer<typeof InteractionSchema>;

export const MedicationFindingSchema = z.object({
  id: z.string(),
  category: z.enum([
    'duplicate',
    'interaction',
    'drug_disease',
    'renal',
    'hepatic',
    'anticholinergic',
    'sedation',
    'bleeding',
    'qt',
    'serotonergic',
    'unnecessary',
    'deprescribing',
    'missing_indication',
    'cascade',
  ]),
  severity: z.enum(['critical', 'high', 'moderate', 'low', 'info']),
  titleKa: z.string(),
  detail: z.string(),
  drugs: z.array(z.string()).default([]),
  action: z.string().default(''),
  sources: z.array(z.string()).default([]),
});
export type MedicationFinding = z.infer<typeof MedicationFindingSchema>;

export const DeprescribingItemSchema = z.object({
  drug: z.string(),
  originalIndication: z.string(),
  stillIndicated: z.enum(['yes', 'unclear', 'likely_no']),
  potentialBenefit: z.string(),
  currentRisk: z.string(),
  withdrawalRisk: z.string(),
  taperNeeded: z.boolean(),
  taperConcept: z.string(),
  monitoring: z.string(),
  restartCriteria: z.string(),
});
export type DeprescribingItem = z.infer<typeof DeprescribingItemSchema>;
