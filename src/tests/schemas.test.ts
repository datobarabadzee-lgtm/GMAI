import { describe, expect, it } from 'vitest';
import { PatientContextSchema, ClinicalAnswerSchema, emptyPatientContext, RiskClassSchema } from '@/schemas/clinical';
import { SourceSchema, ClaimSchema } from '@/schemas/evidence';
import { AgentSpecSchema } from '@/schemas/agent';
import { DefectObjectSchema } from '@/schemas/quality';
import { AGENTS } from '@/agents/registry';
import { SOURCES } from '@/knowledge/sources';

describe('schema contracts', () => {
  it('creates a valid empty patient context', () => {
    const p = emptyPatientContext();
    expect(PatientContextSchema.safeParse(p).success).toBe(true);
    expect(p.medications).toEqual([]);
  });

  it('rejects an out-of-range age', () => {
    expect(PatientContextSchema.safeParse({ age: 400 }).success).toBe(false);
  });

  it('validates every shipped source against the source schema', () => {
    SOURCES.forEach((s) => {
      const r = SourceSchema.safeParse(s);
      if (!r.success) throw new Error(`${s.source_id}: ${JSON.stringify(r.error.issues)}`);
      expect(r.success).toBe(true);
    });
  });

  it('validates every agent spec', () => {
    AGENTS.forEach((a) => {
      const r = AgentSpecSchema.safeParse(a);
      if (!r.success) throw new Error(`${a.id}: ${JSON.stringify(r.error.issues)}`);
      expect(r.success).toBe(true);
    });
  });

  it('defines exactly the risk classes R0-R5', () => {
    expect(RiskClassSchema.options).toEqual(['R0', 'R1', 'R2', 'R3', 'R4', 'R5']);
  });

  it('forces every defect object to require human review', () => {
    const d = DefectObjectSchema.parse({
      id: 'D1',
      domain: 'documentation',
      titleKa: 'ტესტი',
      expectedStandard: 'x',
      actualCare: 'y',
      deviation: 'z',
      deviationJustified: 'cannot_determine',
      potentialHarm: 'cannot_determine',
      severity: 'moderate',
      confidence: 'low',
    });
    expect(d.humanReviewRequired).toBe(true);
  });

  it('constrains claim verification status to the four defined states plus not_verified', () => {
    expect(ClaimSchema.shape.verification_status.options).toEqual(['supported', 'partially_supported', 'unsupported', 'conflicting', 'not_verified']);
  });

  it('requires a clinical answer to carry uncertainty and an engine flag', () => {
    const bad = ClinicalAnswerSchema.safeParse({ queryId: '1', mode: 'quick', intent: 'clinical_reasoning', risk: 'R2', bottomLine: 'x', sections: [], generatedAt: 'now' });
    expect(bad.success).toBe(false);
  });
});
