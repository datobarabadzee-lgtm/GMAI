// Server-side only. Not imported from client components; also used by the CLI importer.
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/**
 * better-sqlite3 is a native addon. It is loaded lazily so that a deployment which
 * never touches the knowledge base — the public tier, or a serverless host without
 * a writable filesystem — does not need the binary present at all.
 */
function loadDriver(): typeof Database {
  const require_ = createRequire(import.meta.url);
  return require_('better-sqlite3') as typeof Database;
}

/**
 * SQLite knowledge store.
 *
 * The database file is produced by `npm run kb:import` from the internal corpus.
 * It is never bundled with the application and never served as a file.
 */

export const DB_PATH = process.env.KB_DB_PATH ?? path.join(process.cwd(), 'data', 'gmai-kb.sqlite');
export const SCHEMA_PATH = path.join(process.cwd(), 'src', 'kb', 'schema.sql');

let cached: Database.Database | null = null;

/**
 * Whether the knowledge base may be used in this process.
 *
 * The public tier answers `false` unconditionally. The licensed clinical corpus and
 * the proprietary quality corpus are not shipped to a public deployment at all, but
 * this second check means that even if a database file were ever placed there by
 * mistake, no request path would read from it.
 */
export function kbExists(): boolean {
  if (process.env.APP_TIER === 'public') return false;
  return fs.existsSync(/*turbopackIgnore: true*/ DB_PATH);
}

/**
 * A single process-wide handle. `readonly` is a caller hint only: the same
 * connection also serves the audit/metering writes, so the handle is opened
 * read-write and the hint is not used to downgrade an existing connection.
 */
export function openDb(opts: { create?: boolean; readonly?: boolean } = {}): Database.Database {
  const { create = false } = opts;
  if (process.env.APP_TIER === 'public') throw new KbUnavailableError();
  if (cached) return cached;
  if (!fs.existsSync(/*turbopackIgnore: true*/ DB_PATH)) {
    if (!create) throw new KbUnavailableError();
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  const Driver = loadDriver();
  const db = new Driver(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  if (create) db.exec(fs.readFileSync(/*turbopackIgnore: true*/ SCHEMA_PATH, 'utf8'));
  cached = db;
  return db;
}

export function closeDb() {
  cached?.close();
  cached = null;
}

/** Thrown when a request needs the knowledge base and it has not been imported. */
export class KbUnavailableError extends Error {
  readonly code = 'KB_NOT_IMPORTED';
  readonly messageKa =
    'ცოდნის ბაზა ჯერ არ არის იმპორტირებული. გაუშვით `npm run kb:import` (ან GAUSHVI.bat) — მანამდე შიდა წესებზე დაფუძნებული პასუხი არ გაიცემა.';
  constructor() {
    super('knowledge base not imported');
  }
}

/** Public-safe counts for dashboards. */
export function kbStats() {
  const db = openDb({ readonly: true });
  const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    sources: one('SELECT COUNT(*) n FROM knowledge_sources'),
    versions: one('SELECT COUNT(*) n FROM knowledge_source_versions'),
    clinicalTopics: one('SELECT COUNT(*) n FROM clinical_topics'),
    clinicalRules: one('SELECT COUNT(*) n FROM clinical_rules'),
    qualityRules: one('SELECT COUNT(*) n FROM quality_rules'),
    taxonomyNodes: one('SELECT COUNT(*) n FROM defect_taxonomy'),
    taxonomyParentLinks: one("SELECT COUNT(*) n FROM defect_taxonomy_parents WHERE resolution <> 'unresolved'"),
    /** Readiness: parents that could not be linked to a stable id (audit F21). Must be 0. */
    taxonomyParentsUnresolved: one("SELECT COUNT(*) n FROM defect_taxonomy_parents WHERE resolution = 'unresolved'"),
    auditQuestions: one('SELECT COUNT(*) n FROM audit_questions'),
    searchItems: one('SELECT COUNT(*) n FROM search_items'),
    vectors: one('SELECT COUNT(*) n FROM search_vectors'),
    quarantined: one('SELECT COUNT(*) n FROM knowledge_import_errors WHERE severity = \'QUARANTINE\''),
    warnings: one('SELECT COUNT(*) n FROM knowledge_import_errors WHERE severity = \'WARNING\''),
    refreshRequired: one('SELECT COUNT(*) n FROM clinical_rules WHERE current_evidence_refresh_required = 1'),
    numericSensitive: one('SELECT COUNT(*) n FROM clinical_rules WHERE numeric_verification_required = 1'),
    humanReview: one('SELECT COUNT(*) n FROM quality_rules WHERE human_review_required = 1'),
    productionCds: one('SELECT COUNT(*) n FROM clinical_rules WHERE eligible_for_production_cds = 1'),
    autonomousLegal: one('SELECT COUNT(*) n FROM quality_rules WHERE eligible_for_autonomous_legal_conclusion = 1'),
  };
}
