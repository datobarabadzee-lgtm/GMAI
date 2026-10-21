-- Georgian Expert Medical AI + AI Hospital — initial schema
-- Requires PostgreSQL 14+. pgvector is optional but recommended.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS sources (
  source_id        text PRIMARY KEY,
  title            text NOT NULL,
  publisher        text NOT NULL,
  year             integer NOT NULL,
  publication_date text DEFAULT '',
  source_type      text NOT NULL,
  specialty        jsonb DEFAULT '[]'::jsonb,
  jurisdiction     text NOT NULL DEFAULT 'international',
  rights_status    text NOT NULL DEFAULT 'UNKNOWN',
  version          text NOT NULL DEFAULT '1',
  last_checked     text NOT NULL,
  url              text DEFAULT '',
  citation_text    text NOT NULL,
  evidence_rank    integer NOT NULL,
  freshness        text NOT NULL DEFAULT 'current',
  is_current       boolean NOT NULL DEFAULT true,
  superseded_by    text,
  population       text DEFAULT '',
  key_finding      text DEFAULT '',
  applicability    text DEFAULT '',
  keywords         jsonb DEFAULT '[]'::jsonb,
  fulltext_public  boolean NOT NULL DEFAULT false,
  excerpt          text DEFAULT '',
  created_at       timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sources_type_idx ON sources (source_type);
CREATE INDEX IF NOT EXISTS sources_jurisdiction_idx ON sources (jurisdiction);
CREATE INDEX IF NOT EXISTS sources_freshness_idx ON sources (freshness);

CREATE TABLE IF NOT EXISTS source_chunks (
  id        serial PRIMARY KEY,
  source_id text NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
  ordinal   integer NOT NULL,
  content   text NOT NULL,
  tokens    integer DEFAULT 0,
  embedding vector(1536)
);
CREATE INDEX IF NOT EXISTS chunks_source_idx ON source_chunks (source_id);
CREATE UNIQUE INDEX IF NOT EXISTS chunks_source_ordinal_uq ON source_chunks (source_id, ordinal);
-- Hybrid search support
CREATE INDEX IF NOT EXISTS chunks_content_fts ON source_chunks USING gin (to_tsvector('simple', content));
-- CREATE INDEX chunks_embedding_idx ON source_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS drugs (
  id           text PRIMARY KEY,
  generic_name text NOT NULL,
  generic_ka   text DEFAULT '',
  brand_names  jsonb DEFAULT '[]'::jsonb,
  atc          text DEFAULT '',
  class        text DEFAULT '',
  payload      jsonb NOT NULL,
  updated_at   timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interactions (
  id         text PRIMARY KEY,
  drug_a     text NOT NULL,
  drug_b     text NOT NULL,
  severity   text NOT NULL,
  mechanism  text NOT NULL,
  effect     text NOT NULL,
  management text NOT NULL,
  sources    jsonb DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS terms (
  id            serial PRIMARY KEY,
  preferred_ka  text NOT NULL,
  english       text NOT NULL,
  synonyms_ka   jsonb DEFAULT '[]'::jsonb,
  deprecated_ka jsonb DEFAULT '[]'::jsonb,
  abbreviation  text DEFAULT '',
  specialty     text DEFAULT '',
  icd10         text,
  atc           text,
  loinc         text,
  definition_ka text DEFAULT '',
  version       text DEFAULT '1.0',
  status        text DEFAULT 'draft'
);

CREATE TABLE IF NOT EXISTS defect_classes (
  code          text PRIMARY KEY,
  roman         text NOT NULL,
  name_ka       text NOT NULL,
  name_en       text NOT NULL,
  definition_ka text NOT NULL,
  payload       jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id                    serial PRIMARY KEY,
  query_id              text NOT NULL,
  at                    timestamp DEFAULT now(),
  mode                  text NOT NULL,
  intent                text NOT NULL,
  risk_class            text NOT NULL,
  engine                text NOT NULL,
  agents_used           jsonb DEFAULT '[]'::jsonb,
  source_ids            jsonb DEFAULT '[]'::jsonb,
  claims_total          integer DEFAULT 0,
  claims_unsupported    integer DEFAULT 0,
  human_review_required boolean DEFAULT false,
  latency_ms            real DEFAULT 0
);
CREATE INDEX IF NOT EXISTS audit_query_idx ON audit_events (query_id);
CREATE INDEX IF NOT EXISTS audit_risk_idx ON audit_events (risk_class);

-- Cases are not persisted in this version (no authentication, no patient
-- identifiers by default). The table exists so enabling persistence later is an
-- additive migration rather than a refactor.
CREATE TABLE IF NOT EXISTS cases (
  id         text PRIMARY KEY,
  owner_id   text,
  label      text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
