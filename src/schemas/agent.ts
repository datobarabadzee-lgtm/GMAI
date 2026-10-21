import { z } from 'zod';
import { IntentSchema, RiskClassSchema } from './clinical';

export const AgentIdSchema = z.string().regex(/^A\d{2}$/);

export const AgentSpecSchema = z.object({
  id: AgentIdSchema,
  code: z.string(),
  name: z.string(),
  nameKa: z.string(),
  description: z.string(),
  acceptedIntents: z.array(IntentSchema),
  requiredInputs: z.array(z.string()),
  optionalInputs: z.array(z.string()).default([]),
  outputSchema: z.string(),
  riskClass: RiskClassSchema,
  tools: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  verification: z.array(z.enum(['citation', 'numeric', 'temporal', 'safety_gate', 'human_review'])).default([]),
  guardrail: z.string(),
});
export type AgentSpec = z.infer<typeof AgentSpecSchema>;

export const AgentResultSchema = z.object({
  agentId: z.string(),
  status: z.enum(['ok', 'skipped', 'insufficient_input', 'unavailable', 'error']),
  summary: z.string().default(''),
  sections: z
    .array(z.object({ titleKa: z.string(), titleEn: z.string(), bullets: z.array(z.string()).default([]), body: z.string().default('') }))
    .default([]),
  claims: z.array(z.string()).default([]),
  sourceIds: z.array(z.string()).default([]),
  data: z.record(z.string(), z.unknown()).default({}),
  humanReviewRequired: z.boolean().default(false),
  note: z.string().default(''),
});
export type AgentResult = z.infer<typeof AgentResultSchema>;

export const OrchestrationPlanSchema = z.object({
  mode: z.string(),
  intent: IntentSchema,
  risk: RiskClassSchema,
  emergency: z.boolean(),
  redFlags: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
  parallel: z.array(z.string()).default([]),
  sequential: z.array(z.string()).default([]),
  verificationRequired: z.array(z.string()).default([]),
  rationale: z.string().default(''),
});
export type OrchestrationPlan = z.infer<typeof OrchestrationPlanSchema>;
