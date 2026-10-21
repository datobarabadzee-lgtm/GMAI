import { pgTable, text, integer, boolean, timestamp, jsonb, index, uniqueIndex, real, serial } from 'drizzle-orm/pg-core';

/**
 * DATABASE SCHEMA — PostgreSQL (pgvector-ready).
 *
 * The application runs entirely without a database: the knowledge base ships as
 * typed modules and patient data is session-local. This schema is what a
 * production deployment uses for the knowledge corpus, the audit trail and
 * (once authentication exists) persisted cases.
 *
 * Enable pgvector before applying: CREATE EXTENSION IF NOT EXISTS vector;
 * Then add: ALTER TABLE source_chunks ADD COLUMN embedding vector(1536);
 */

export const sources = pgTable(
  'sources',
  {
    sourceId: text('source_id').primaryKey(),
    title: text('title').notNull(),
    publisher: text('publisher').notNull(),
    year: integer('year').notNull(),
    publicationDate: text('publication_date').default(''),
    sourceType: text('source_type').notNull(),
    specialty: jsonb('specialty').$type<string[]>().default([]),
    jurisdiction: text('jurisdiction').notNull().default('international'),
    rightsStatus: text('rights_status').notNull().default('UNKNOWN'),
    version: text('version').notNull().default('1'),
    lastChecked: text('last_checked').notNull(),
    url: text('url').default(''),
    citationText: text('citation_text').notNull(),
    evidenceRank: integer('evidence_rank').notNull(),
    freshness: text('freshness').notNull().default('current'),
    isCurrent: boolean('is_current').notNull().default(true),
    supersededBy: text('superseded_by'),
    population: text('population').default(''),
    keyFinding: text('key_finding').default(''),
    applicability: text('applicability').default(''),
    keywords: jsonb('keywords').$type<string[]>().default([]),
    fulltextPublic: boolean('fulltext_public').notNull().default(false),
    excerpt: text('excerpt').default(''),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => ({
    typeIdx: index('sources_type_idx').on(t.sourceType),
    jurisdictionIdx: index('sources_jurisdiction_idx').on(t.jurisdiction),
    freshnessIdx: index('sources_freshness_idx').on(t.freshness),
  }),
);

export const sourceChunks = pgTable(
  'source_chunks',
  {
    id: serial('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.sourceId, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    content: text('content').notNull(),
    tokens: integer('tokens').default(0),
    // embedding vector(1536) — added by migration once pgvector is enabled
  },
  (t) => ({
    sourceIdx: index('chunks_source_idx').on(t.sourceId),
    uniqueOrdinal: uniqueIndex('chunks_source_ordinal_uq').on(t.sourceId, t.ordinal),
  }),
);

export const drugs = pgTable('drugs', {
  id: text('id').primaryKey(),
  genericName: text('generic_name').notNull(),
  genericKa: text('generic_ka').default(''),
  brandNames: jsonb('brand_names').$type<string[]>().default([]),
  atc: text('atc').default(''),
  class: text('class').default(''),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const interactions = pgTable('interactions', {
  id: text('id').primaryKey(),
  drugA: text('drug_a').notNull(),
  drugB: text('drug_b').notNull(),
  severity: text('severity').notNull(),
  mechanism: text('mechanism').notNull(),
  effect: text('effect').notNull(),
  management: text('management').notNull(),
  sources: jsonb('sources').$type<string[]>().default([]),
});

export const terms = pgTable('terms', {
  id: serial('id').primaryKey(),
  preferredKa: text('preferred_ka').notNull(),
  english: text('english').notNull(),
  synonymsKa: jsonb('synonyms_ka').$type<string[]>().default([]),
  deprecatedKa: jsonb('deprecated_ka').$type<string[]>().default([]),
  abbreviation: text('abbreviation').default(''),
  specialty: text('specialty').default(''),
  icd10: text('icd10'),
  atc: text('atc'),
  loinc: text('loinc'),
  definitionKa: text('definition_ka').default(''),
  version: text('version').default('1.0'),
  status: text('status').default('draft'),
});

export const defectClasses = pgTable('defect_classes', {
  code: text('code').primaryKey(),
  roman: text('roman').notNull(),
  nameKa: text('name_ka').notNull(),
  nameEn: text('name_en').notNull(),
  definitionKa: text('definition_ka').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
});

/** Audit trail — every orchestration is recorded without patient identifiers. */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: serial('id').primaryKey(),
    queryId: text('query_id').notNull(),
    at: timestamp('at').defaultNow(),
    mode: text('mode').notNull(),
    intent: text('intent').notNull(),
    riskClass: text('risk_class').notNull(),
    engine: text('engine').notNull(),
    agentsUsed: jsonb('agents_used').$type<string[]>().default([]),
    sourceIds: jsonb('source_ids').$type<string[]>().default([]),
    claimsTotal: integer('claims_total').default(0),
    claimsUnsupported: integer('claims_unsupported').default(0),
    humanReviewRequired: boolean('human_review_required').default(false),
    latencyMs: real('latency_ms').default(0),
  },
  (t) => ({
    queryIdx: index('audit_query_idx').on(t.queryId),
    riskIdx: index('audit_risk_idx').on(t.riskClass),
  }),
);

/**
 * Cases are NOT persisted in this version (no authentication, no patient
 * identifiers by default). The table exists so that enabling persistence later
 * is an additive migration rather than a refactor.
 */
export const cases = pgTable('cases', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id'),
  label: text('label').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
