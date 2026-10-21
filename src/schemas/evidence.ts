import { z } from 'zod';

export const SourceTypeSchema = z.enum([
  'guideline',
  'systematic_review',
  'meta_analysis',
  'rct',
  'cohort',
  'case_control',
  'consensus',
  'drug_label',
  'regulatory',
  'textbook',
  'local_protocol',
  'legal',
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

/** Evidence hierarchy rank — lower = stronger (Blueprint §8.1). */
export const EVIDENCE_RANK: Record<SourceType, number> = {
  guideline: 1,
  regulatory: 1,
  systematic_review: 2,
  meta_analysis: 2,
  rct: 3,
  cohort: 4,
  case_control: 4,
  consensus: 5,
  drug_label: 2,
  textbook: 6,
  local_protocol: 5,
  legal: 1,
};

export const RightsStatusSchema = z.enum([
  'OPEN',
  'PUBLIC_DOMAIN',
  'LICENSED',
  'INTERNAL_REFERENCE',
  'RESTRICTED',
  'UNKNOWN',
]);
export type RightsStatus = z.infer<typeof RightsStatusSchema>;

export const FreshnessSchema = z.enum(['current', 'review_due', 'superseded', 'historical']);
export type Freshness = z.infer<typeof FreshnessSchema>;

export const SourceSchema = z.object({
  source_id: z.string(),
  title: z.string(),
  publisher: z.string(),
  year: z.number().int(),
  publication_date: z.string().default(''),
  source_type: SourceTypeSchema,
  specialty: z.array(z.string()).default([]),
  jurisdiction: z.enum(['international', 'us', 'eu', 'uk', 'georgia', 'who', 'other']).default('international'),
  rights_status: RightsStatusSchema,
  version: z.string().default('1'),
  last_checked: z.string(),
  url: z.string().default(''),
  citation_text: z.string(),
  evidence_rank: z.number().int().min(1).max(7),
  freshness: FreshnessSchema.default('current'),
  is_current: z.boolean().default(true),
  superseded_by: z.string().nullable().default(null),
  population: z.string().default(''),
  key_finding: z.string().default(''),
  applicability: z.string().default(''),
  keywords: z.array(z.string()).default([]),
  fulltext_public: z.boolean().default(false),
  excerpt: z.string().default(''),
});
export type Source = z.infer<typeof SourceSchema>;

export const ClaimSchema = z.object({
  claim_id: z.string(),
  claim_text: z.string(),
  clinical_importance: z.enum(['critical', 'major', 'minor']),
  source_ids: z.array(z.string()).default([]),
  verification_status: z.enum(['supported', 'partially_supported', 'unsupported', 'conflicting', 'not_verified']),
  support_strength: z.enum(['strong', 'moderate', 'weak', 'none']),
  note: z.string().default(''),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const RetrievalQuerySchema = z.object({
  text: z.string().default(''),
  pico: z
    .object({ p: z.string().default(''), i: z.string().default(''), c: z.string().default(''), o: z.string().default('') })
    .optional(),
  sourceTypes: z.array(SourceTypeSchema).default([]),
  specialties: z.array(z.string()).default([]),
  jurisdictions: z.array(z.string()).default([]),
  yearFrom: z.number().int().optional(),
  onlyCurrent: z.boolean().default(false),
  limit: z.number().int().min(1).max(50).default(12),
});
export type RetrievalQuery = z.infer<typeof RetrievalQuerySchema>;

export const RetrievalHitSchema = z.object({
  source: SourceSchema,
  score: z.number(),
  semantic: z.number(),
  lexical: z.number(),
  authority: z.number(),
  recency: z.number(),
  matched: z.array(z.string()).default([]),
});
export type RetrievalHit = z.infer<typeof RetrievalHitSchema>;
