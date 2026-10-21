import { z } from 'zod';

/**
 * ZERO-TRUST VALIDATION.
 *
 * Structured input is never trusted. Every record is parsed against an explicit
 * schema; failures are quarantined with the raw payload, never silently dropped.
 * Nulls are preserved — `null` and "absent" are different clinical facts.
 */

const nullableString = z.string().nullable().optional();

/** Defect classes arrive either as plain strings or as {code, name} objects. */
export const ClassRefSchema = z.union([z.string(), z.object({ code: nullableString, name: nullableString })]);
export type ClassRef = z.infer<typeof ClassRefSchema>;
export const classRefName = (c: ClassRef): string => (typeof c === 'string' ? c : (c.name ?? c.code ?? '')).trim();
export const classRefCode = (c: ClassRef): string => (typeof c === 'string' ? '' : (c.code ?? '')).trim();

export const ClinicalRuleSchema = z.object({
  rule_id: z.string().min(1),
  topic_order: z.number().int().nullable().optional(),
  topic_id: z.string().min(1),
  source_topic_id: nullableString,
  topic_title: nullableString,
  clinical_domains: z.array(z.string()).default([]),
  rule_type: nullableString,
  maturity: z.enum(['L3_STRUCTURED_RULE', 'L3_HIGH_COMPUTABILITY_CANDIDATE', 'L3_CANDIDATE']),
  validation_status: z.string().min(1),
  clinical_logic: z.object({
    trigger: z
      .object({
        source_trigger: nullableString,
        normalized_condition_text: nullableString,
        executable_expression: nullableString,
        expression_language: nullableString,
      })
      .default({}),
    required_data: z.array(z.string()).nullable().default([]),
    fhir_data_requirements: z
      .array(z.object({ field: nullableString, resource: nullableString, path: nullableString, transform: nullableString, concept: nullableString }))
      .nullable()
      .default([]),
    numeric_constraints: z.array(z.unknown()).nullable().default([]),
    action: nullableString,
    exceptions_or_exclusions: z.array(z.unknown()).nullable().default([]),
    monitoring_or_follow_up: z.array(z.unknown()).nullable().default([]),
    escalation: z.array(z.unknown()).nullable().default([]),
  }),
  safety: z.object({
    flags: z.array(z.string()).nullable().default([]),
    patient_specific_safety_check_required: z.boolean().default(false),
    numeric_verification_required: z.boolean().default(false),
    human_clinical_validation_required: z.boolean().default(true),
    current_evidence_refresh_required: z.boolean().default(true),
  }),
  provenance: z.object({
    source_family: nullableString,
    source_pages: z.array(z.union([z.number(), z.string()])).nullable().default([]),
    source_section: nullableString,
    literature_review_current_through: nullableString,
    topic_last_updated: nullableString,
    rights_status: z.string().min(1),
  }),
  source_derived_statement_internal: nullableString,
  implementation: z.object({
    eligible_for_rule_engine: z.boolean().default(false),
    eligible_for_production_cds: z.boolean().default(false),
    next_required_step: nullableString,
  }),
});
export type ClinicalRuleRecord = z.infer<typeof ClinicalRuleSchema>;

export const ClinicalTopicSchema = z.object({
  topic_order: z.number().int().nullable().optional(),
  topic_id: z.string().min(1),
  source_topic_id: nullableString,
  title: z.string().min(1),
  domains: z.union([z.array(z.string()), z.string()]).nullable().optional(),
  source_start_page: z.number().int().nullable().optional(),
  source_end_page: z.number().int().nullable().optional(),
  l2_objects: z.number().int().nullable().optional(),
  clinical_rules: z.number().int().nullable().optional(),
  validation_status: nullableString,
});

export const QualityRuleSchema = z.object({
  rule_id: z.string().min(1),
  source_l2_object_id: nullableString,
  rule_family: nullableString,
  defect_classes: z.array(ClassRefSchema).nullable().default([]),
  maturity: z.enum(['HUMAN_JUDGMENT_RULE', 'QUALITY_RULE_CANDIDATE', 'STRUCTURED_DECISION_RULE', 'COMPUTABLE_AUDIT_CHECK', 'HIGH_COMPUTABILITY_RULE']),
  rule_logic: z.object({
    trigger_or_question: nullableString,
    criterion_or_action: nullableString,
    required_evidence: z.array(z.string()).nullable().default([]),
    exceptions: z.array(z.unknown()).nullable().default([]),
    positive_finding: z.record(z.string(), z.unknown()).nullable().optional(),
    causality_assessment_required: z.boolean().default(false),
    standard_comparison_required: z.boolean().default(false),
    documentation_assessment_required: z.boolean().default(false),
  }),
  implementation: z.object({
    automation_level: nullableString,
    eligible_for_automatic_flagging: z.boolean().default(false),
    eligible_for_autonomous_legal_conclusion: z.boolean().default(false),
    human_review_required: z.boolean().default(true),
  }),
  source_locator: z
    .object({ block_no: z.number().int().nullable().optional(), sentence_no: z.number().int().nullable().optional(), heading_path: z.array(z.string()).nullable().default([]) })
    .nullable()
    .optional(),
  source_statement: nullableString,
  source_status: nullableString,
  validation_status: z.string().min(1),
});
export type QualityRuleRecord = z.infer<typeof QualityRuleSchema>;

export const TaxonomyNodeSchema = z.object({
  taxonomy_id: z.string().min(1),
  taxonomy_type: nullableString,
  code: nullableString,
  name: z.string().min(1),
  parent: nullableString,
  source_heading_path: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  source: nullableString,
});

export const AuditQuestionSchema = z.object({
  question_id: z.string().min(1),
  question: z.string().min(1),
  defect_classes: z.union([z.array(ClassRefSchema), z.string()]).nullable().optional(),
  evidence_dimensions: z.union([z.array(z.string()), z.string()]).nullable().optional(),
  heading_path: z.union([z.string(), z.array(z.string())]).nullable().optional(),
});

/** Rights classes permitted in the registry. UNKNOWN is quarantined. */
export const RIGHTS_CLASSES = ['OPEN', 'LICENSED', 'PROPRIETARY_INTERNAL', 'RESTRICTED_INTERNAL_REFERENCE', 'PUBLIC_REGULATORY'] as const;
export type RightsClass = (typeof RIGHTS_CLASSES)[number];

/** Source-derived verbatim text may never leave the server for these classes. */
export const RESTRICTED_RIGHTS: RightsClass[] = ['RESTRICTED_INTERNAL_REFERENCE', 'PROPRIETARY_INTERNAL', 'LICENSED'];
export const isRestricted = (r: string) => RESTRICTED_RIGHTS.includes(r as RightsClass);
