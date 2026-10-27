import { z } from 'zod';

/** The request body both prevention endpoints accept. Every field is optional except what the engine gates on itself. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const num = (min: number, max: number) => z.number().finite().min(min).max(max);

export const PreventionInputSchema = z
  .object({
    age: num(0, 130).optional(),
    sex: z.enum(['female', 'male']).optional(),
    heightCm: num(50, 260).optional(),
    weightKg: num(10, 400).optional(),
    waistCm: num(30, 250).optional(),
    smoking: z.enum(['never', 'former', 'current']).optional(),
    packYears: num(0, 300).optional(),
    quitYear: num(1900, 2100).optional(),
    systolicBp: num(60, 300).optional(),
    diastolicBp: num(30, 200).optional(),
    totalChol: num(0.5, 1000).optional(),
    hdlChol: num(0.1, 300).optional(),
    cholUnit: z.enum(['mmol/L', 'mg/dL']).optional(),
    glucoseFasting: num(1, 1000).optional(),
    glucoseUnit: z.enum(['mmol/L', 'mg/dL']).optional(),
    hba1c: num(2, 25).optional(),
    family: z
      .object({
        earlyCvd: z.boolean().optional(),
        colorectalCancer: z.boolean().optional(),
        breastOrOvarianCancer: z.boolean().optional(),
        diabetes: z.enum(['none', 'second', 'first']).optional(),
      })
      .optional(),
    pregnant: z.boolean().optional(),
    planningPregnancy: z.boolean().optional(),
    postmenopausal: z.boolean().optional(),
    conditions: z.array(z.enum(['diabetes', 'cvd', 'ckd', 'copd_asthma', 'immunosuppression', 'liver', 'hypertension_treated'])).max(10).optional(),
    activeDaily30: z.boolean().optional(),
    vegFruitDaily: z.boolean().optional(),
    everHighGlucose: z.boolean().optional(),
    lastDone: z.record(z.string().max(40), isoDate).optional(),
    vaccines: z
      .record(
        z.enum(['influenza', 'td', 'pneumococcal', 'hpv', 'hepb', 'mmr', 'zoster', 'rsv']),
        z.object({ done: z.boolean().optional(), lastDate: isoDate.optional() }),
      )
      .optional(),
    redFlags: z.array(z.string().max(40)).max(20).optional(),
  })
  .strict();

export const PlanRequestSchema = z.object({ input: PreventionInputSchema, today: isoDate.optional() });

export const ExplainRequestSchema = z.object({
  input: PreventionInputSchema,
  today: isoDate.optional(),
  kind: z.enum(['screening', 'vaccine', 'risk']),
  id: z.string().min(1).max(60),
});
