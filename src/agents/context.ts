import type { ClinicalMode, Intent, PatientContext, RiskClass } from '@/schemas/clinical';
import type { RetrievalHit } from '@/schemas/evidence';
import type { DefectReviewMode } from '@/schemas/quality';
import type { AgentResult } from '@/schemas/agent';
import type { MedicationGate } from '@/server/medications/agent-gate';

export type AgentContext = {
  question: string;
  plan: string;
  patient: PatientContext;
  mode: ClinicalMode;
  intent: Intent;
  risk: RiskClass;
  emergency: boolean;
  hits: RetrievalHit[];
  reviewMode: DefectReviewMode;
  academyLevel: 'student' | 'resident' | 'gp' | 'specialist';
  extras: Record<string, unknown>;
  results: Map<string, AgentResult>;
  /** Built server-side by the orchestrator; the only source of drug identity for agents. */
  medication?: MedicationGate;
};

export type AgentImpl = (ctx: AgentContext) => AgentResult | Promise<AgentResult>;

export const ok = (agentId: string, partial: Partial<AgentResult>): AgentResult => ({
  agentId,
  status: 'ok',
  summary: '',
  sections: [],
  claims: [],
  sourceIds: [],
  data: {},
  humanReviewRequired: false,
  note: '',
  ...partial,
});

export const skipped = (agentId: string, note: string): AgentResult => ({
  agentId,
  status: 'insufficient_input',
  summary: '',
  sections: [],
  claims: [],
  sourceIds: [],
  data: {},
  humanReviewRequired: false,
  note,
});
