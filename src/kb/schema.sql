-- ─────────────────────────────────────────────────────────────────────────────
-- GMAI KNOWLEDGE ENGINE — SQLite schema (FTS5 + vector index)
-- Zero-trust ingestion: every record carries its import run, source and status.
-- ─────────────────────────────────────────────────────────────────────────────
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Source registry ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_sources (
  source_id      TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  source_type    TEXT NOT NULL,              -- clinical_rules | quality_defect_rules
  rights_class   TEXT NOT NULL,              -- OPEN | LICENSED | PROPRIETARY_INTERNAL | RESTRICTED_INTERNAL_REFERENCE | PUBLIC_REGULATORY
  source_family  TEXT,
  source_vintage TEXT,
  created_at     TEXT NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS knowledge_source_versions (
  version_id        TEXT PRIMARY KEY,
  source_id         TEXT NOT NULL REFERENCES knowledge_sources(source_id) ON DELETE CASCADE,
  version           TEXT NOT NULL,
  file_name         TEXT NOT NULL,
  file_hash         TEXT NOT NULL,
  file_bytes        INTEGER NOT NULL,
  record_count      INTEGER NOT NULL DEFAULT 0,
  validation_status TEXT NOT NULL,           -- VALID | PARTIAL | INVALID
  imported_at       TEXT NOT NULL,
  superseded_by     TEXT REFERENCES knowledge_source_versions(version_id),
  active            INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS ksv_hash_uq ON knowledge_source_versions (source_id, file_hash);

CREATE TABLE IF NOT EXISTS knowledge_import_runs (
  run_id            TEXT PRIMARY KEY,
  started_at        TEXT NOT NULL,
  finished_at       TEXT,
  importer_version  TEXT NOT NULL,
  files_seen        INTEGER DEFAULT 0,
  records_seen      INTEGER DEFAULT 0,
  records_accepted  INTEGER DEFAULT 0,
  records_quarantined INTEGER DEFAULT 0,
  status            TEXT NOT NULL,           -- RUNNING | SUCCESS | PARTIAL | FAILED
  report_json       TEXT
);

CREATE TABLE IF NOT EXISTS knowledge_import_errors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL REFERENCES knowledge_import_runs(run_id) ON DELETE CASCADE,
  source_id   TEXT,
  record_id   TEXT,
  severity    TEXT NOT NULL,                 -- QUARANTINE | WARNING
  code        TEXT NOT NULL,
  message     TEXT NOT NULL,
  raw_payload TEXT
);
CREATE INDEX IF NOT EXISTS kie_run_idx ON knowledge_import_errors (run_id, severity);

-- ── Clinical layer ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_topics (
  topic_id          TEXT PRIMARY KEY,
  version_id        TEXT NOT NULL REFERENCES knowledge_source_versions(version_id) ON DELETE CASCADE,
  topic_order       INTEGER,
  source_topic_id   TEXT,
  title             TEXT NOT NULL,
  domains           TEXT,                    -- JSON array
  source_start_page INTEGER,
  source_end_page   INTEGER,
  l2_objects        INTEGER,
  clinical_rules    INTEGER,
  validation_status TEXT
);

CREATE TABLE IF NOT EXISTS clinical_rules (
  rule_id                          TEXT PRIMARY KEY,
  version_id                       TEXT NOT NULL REFERENCES knowledge_source_versions(version_id) ON DELETE CASCADE,
  topic_id                         TEXT REFERENCES clinical_topics(topic_id),
  topic_title                      TEXT,
  clinical_domains                 TEXT,     -- JSON array
  rule_type                        TEXT,
  maturity                         TEXT NOT NULL,
  validation_status                TEXT NOT NULL,
  source_trigger                   TEXT,
  normalized_condition_text        TEXT,
  executable_expression            TEXT,
  expression_language              TEXT,
  action                           TEXT,
  exceptions_or_exclusions         TEXT,     -- JSON array
  monitoring_or_follow_up          TEXT,     -- JSON array
  escalation                       TEXT,     -- JSON array
  safety_flags                     TEXT,     -- JSON array
  patient_specific_safety_check_required INTEGER DEFAULT 0,
  numeric_verification_required    INTEGER DEFAULT 0,
  human_clinical_validation_required INTEGER DEFAULT 1,
  current_evidence_refresh_required INTEGER DEFAULT 1,
  eligible_for_rule_engine         INTEGER DEFAULT 0,
  eligible_for_production_cds      INTEGER DEFAULT 0,
  next_required_step               TEXT,
  source_derived_statement_internal TEXT,    -- RESTRICTED: never served to a public client
  raw_json                         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cr_topic_idx    ON clinical_rules (topic_id);
CREATE INDEX IF NOT EXISTS cr_maturity_idx ON clinical_rules (maturity);
CREATE INDEX IF NOT EXISTS cr_refresh_idx  ON clinical_rules (current_evidence_refresh_required);

CREATE TABLE IF NOT EXISTS clinical_required_data (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL REFERENCES clinical_rules(rule_id) ON DELETE CASCADE,
  field   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS crd_rule_idx  ON clinical_required_data (rule_id);
CREATE INDEX IF NOT EXISTS crd_field_idx ON clinical_required_data (field);

CREATE TABLE IF NOT EXISTS clinical_fhir_requirements (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id   TEXT NOT NULL REFERENCES clinical_rules(rule_id) ON DELETE CASCADE,
  field     TEXT,
  resource  TEXT,
  path      TEXT,
  transform TEXT,
  concept   TEXT
);
CREATE INDEX IF NOT EXISTS cfr_rule_idx ON clinical_fhir_requirements (rule_id);

CREATE TABLE IF NOT EXISTS clinical_numeric_constraints (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id    TEXT NOT NULL REFERENCES clinical_rules(rule_id) ON DELETE CASCADE,
  raw        TEXT NOT NULL,
  kind       TEXT,
  value_text TEXT,
  unit       TEXT
);
CREATE INDEX IF NOT EXISTS cnc_rule_idx ON clinical_numeric_constraints (rule_id);

CREATE TABLE IF NOT EXISTS clinical_provenance (
  rule_id                           TEXT PRIMARY KEY REFERENCES clinical_rules(rule_id) ON DELETE CASCADE,
  source_family                     TEXT,
  source_pages                      TEXT,    -- JSON array
  source_section                    TEXT,
  literature_review_current_through TEXT,
  topic_last_updated                TEXT,
  rights_status                     TEXT NOT NULL
);

-- ── Quality / defect layer ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quality_rules (
  rule_id                              TEXT PRIMARY KEY,
  version_id                           TEXT NOT NULL REFERENCES knowledge_source_versions(version_id) ON DELETE CASCADE,
  source_l2_object_id                  TEXT,
  rule_family                          TEXT,
  defect_classes                       TEXT, -- JSON array
  maturity                             TEXT NOT NULL,
  trigger_or_question                  TEXT,
  criterion_or_action                  TEXT,
  exceptions                           TEXT, -- JSON array
  positive_finding                     TEXT, -- JSON object
  causality_assessment_required        INTEGER DEFAULT 0,
  standard_comparison_required         INTEGER DEFAULT 0,
  documentation_assessment_required    INTEGER DEFAULT 0,
  automation_level                     TEXT,
  eligible_for_automatic_flagging      INTEGER DEFAULT 0,
  eligible_for_autonomous_legal_conclusion INTEGER DEFAULT 0,
  human_review_required                INTEGER DEFAULT 1,
  block_no                             INTEGER,
  sentence_no                          INTEGER,
  heading_path                         TEXT, -- JSON array
  source_statement                     TEXT, -- author draft, internal
  source_status                        TEXT,
  validation_status                    TEXT NOT NULL,
  raw_json                             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS qr_family_idx   ON quality_rules (rule_family);
CREATE INDEX IF NOT EXISTS qr_maturity_idx ON quality_rules (maturity);

CREATE TABLE IF NOT EXISTS quality_required_evidence (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL REFERENCES quality_rules(rule_id) ON DELETE CASCADE,
  field   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS qre_rule_idx ON quality_required_evidence (rule_id);

CREATE TABLE IF NOT EXISTS defect_taxonomy (
  taxonomy_id         TEXT PRIMARY KEY,
  version_id          TEXT NOT NULL REFERENCES knowledge_source_versions(version_id) ON DELETE CASCADE,
  taxonomy_type       TEXT,
  code                TEXT,
  name                TEXT NOT NULL,
  parent              TEXT,
  source_heading_path TEXT,
  source              TEXT
);

-- A taxonomy node may have several parents ("დიაგნოსტიკური დეფექტი / თერაპიული დეფექტი").
-- The raw parent text stays in defect_taxonomy.parent; each resolved parent is one row here.
CREATE TABLE IF NOT EXISTS defect_taxonomy_parents (
  taxonomy_id   TEXT NOT NULL REFERENCES defect_taxonomy(taxonomy_id) ON DELETE CASCADE,
  version_id    TEXT NOT NULL REFERENCES knowledge_source_versions(version_id) ON DELETE CASCADE,
  parent_raw    TEXT NOT NULL,
  parent_id     TEXT REFERENCES defect_taxonomy(taxonomy_id) ON DELETE CASCADE,
  resolution    TEXT NOT NULL,          -- code | defect_class_name | unresolved
  PRIMARY KEY (taxonomy_id, parent_raw)
);

CREATE TABLE IF NOT EXISTS audit_questions (
  question_id        TEXT PRIMARY KEY,
  version_id         TEXT NOT NULL REFERENCES knowledge_source_versions(version_id) ON DELETE CASCADE,
  question           TEXT NOT NULL,
  defect_classes     TEXT,                   -- JSON array
  evidence_dimensions TEXT,                  -- JSON array
  heading_path       TEXT
);

CREATE TABLE IF NOT EXISTS quality_workflow_steps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id  TEXT NOT NULL REFERENCES knowledge_source_versions(version_id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL,
  step        INTEGER NOT NULL,
  name        TEXT NOT NULL,
  outputs     TEXT                           -- JSON array
);

CREATE TABLE IF NOT EXISTS quality_sections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id      TEXT NOT NULL REFERENCES knowledge_source_versions(version_id) ON DELETE CASCADE,
  level           INTEGER,
  title           TEXT NOT NULL,
  parent          TEXT,
  block_no        INTEGER,
  coverage_status TEXT,
  rules           INTEGER,
  l2_objects      INTEGER
);

-- ── Unified retrieval index ──────────────────────────────────────────────────
-- One searchable row per rule. `body` holds only the fields that may be indexed;
-- restricted verbatim passages stay in the layer tables and are never emitted to
-- a public response.
CREATE TABLE IF NOT EXISTS search_items (
  item_id       TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,               -- clinical_rule | quality_rule | audit_question
  rule_id       TEXT NOT NULL,
  version_id    TEXT NOT NULL,
  title         TEXT,
  body          TEXT NOT NULL,
  domains       TEXT,
  maturity      TEXT,
  rights_class  TEXT NOT NULL,
  refresh_required INTEGER DEFAULT 0,
  safety_weight REAL DEFAULT 0,
  maturity_weight REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS si_kind_idx ON search_items (kind);

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  title, body, domains,
  content='search_items', content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 0'
);

CREATE TABLE IF NOT EXISTS search_vectors (
  item_id         TEXT PRIMARY KEY REFERENCES search_items(item_id) ON DELETE CASCADE,
  model           TEXT NOT NULL,
  dim             INTEGER NOT NULL,
  norm            REAL NOT NULL,
  vector          BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS sv_model_idx ON search_vectors (model);

-- ── Usage metering and traceability ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_runs (
  run_id              TEXT PRIMARY KEY,
  session_id          TEXT,
  created_at          TEXT NOT NULL,
  request_type        TEXT,
  agent               TEXT,
  model               TEXT,
  intent              TEXT,
  risk_level          TEXT,
  retrieval_query     TEXT,
  retrieved_rule_ids  TEXT,                  -- JSON array
  agents_called       TEXT,
  tools_called        TEXT,
  verifier_status     TEXT,
  release_status      TEXT,
  input_tokens        INTEGER DEFAULT 0,
  cached_input_tokens INTEGER DEFAULT 0,
  output_tokens       INTEGER DEFAULT 0,
  tool_calls          INTEGER DEFAULT 0,
  latency_ms          REAL DEFAULT 0,
  estimated_cost_usd  REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ai_runs_created_idx ON ai_runs (created_at);
CREATE INDEX IF NOT EXISTS ai_runs_agent_idx   ON ai_runs (agent);
