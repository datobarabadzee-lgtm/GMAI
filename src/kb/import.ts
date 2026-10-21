import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { openDb } from './db';
import { AuditQuestionSchema, ClinicalRuleSchema, ClinicalTopicSchema, QualityRuleSchema, TaxonomyNodeSchema, RIGHTS_CLASSES, classRefName, type ClassRef } from './validate';
import { getEmbeddingProvider, normalizeForIndex, vectorToBlob } from './embeddings';

export const IMPORTER_VERSION = '1.0.0';

export type ImportReport = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  importerVersion: string;
  embedding: { provider: string; model: string; dim: number; semantic: boolean };
  files: { file: string; bytes: number; hash: string; sourceId: string; versionId: string; skipped: boolean; reason?: string }[];
  counts: Record<string, number>;
  quarantined: { sourceId: string; recordId: string; code: string; message: string }[];
  warnings: { sourceId: string; recordId: string; code: string; message: string }[];
};

const nowIso = () => new Date().toISOString();
const sha256 = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');
const jarr = (v: unknown) => JSON.stringify(Array.isArray(v) ? v : v === null || v === undefined ? [] : [v]);
const asArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x !== null ? classRefName(x as ClassRef) : String(x))).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return v.split(/[|;,>]/).map((s) => s.trim()).filter(Boolean);
  return [];
};
const bool = (v: unknown) => (v ? 1 : 0);

/** „A / B / C" → ["A","B","C"]; a slash inside a name („X/Y დეფექტი") is not a separator. */
export function splitParents(raw: string): string[] {
  return raw.split(/\s+\/\s+/).map((s) => s.trim()).filter(Boolean);
}

/** Candidate corpus files, resolved from KB_SOURCE_DIR. */
export function discoverFiles(dir: string): { clinical?: string; quality?: string } {
  const out: { clinical?: string; quality?: string } = {};
  if (!fs.existsSync(dir)) return out;
  const walk = (d: string, depth = 0): string[] => {
    if (depth > 3) return [];
    return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name);
      return e.isDirectory() ? walk(p, depth + 1) : [p];
    });
  };
  for (const f of walk(dir)) {
    const base = path.basename(f);
    if (/^GMAI_Clinical_Rules_Master_v\d+\.json$/i.test(base)) out.clinical = f;
    if (/^GMAI_Quality_Defect_Rules_Master_v\d+\.json$/i.test(base)) out.quality = f;
  }
  return out;
}

type Ctx = {
  db: Database.Database;
  runId: string;
  quarantined: ImportReport['quarantined'];
  warnings: ImportReport['warnings'];
};

function quarantine(ctx: Ctx, sourceId: string, recordId: string, code: string, message: string, raw: unknown) {
  ctx.quarantined.push({ sourceId, recordId, code, message });
  ctx.db
    .prepare('INSERT INTO knowledge_import_errors (run_id, source_id, record_id, severity, code, message, raw_payload) VALUES (?,?,?,?,?,?,?)')
    .run(ctx.runId, sourceId, recordId, 'QUARANTINE', code, message, JSON.stringify(raw).slice(0, 8000));
}

function warn(ctx: Ctx, sourceId: string, recordId: string, code: string, message: string) {
  ctx.warnings.push({ sourceId, recordId, code, message });
  ctx.db
    .prepare('INSERT INTO knowledge_import_errors (run_id, source_id, record_id, severity, code, message, raw_payload) VALUES (?,?,?,?,?,?,NULL)')
    .run(ctx.runId, sourceId, recordId, 'WARNING', code, message);
}

function registerVersion(ctx: Ctx, opts: { sourceId: string; name: string; sourceType: string; rightsClass: string; sourceFamily: string | null; vintage: string | null; file: string; hash: string; bytes: number; version: string }) {
  const { db } = ctx;
  db.prepare(
    `INSERT INTO knowledge_sources (source_id, name, source_type, rights_class, source_family, source_vintage, created_at, active)
     VALUES (?,?,?,?,?,?,?,1)
     ON CONFLICT(source_id) DO UPDATE SET name=excluded.name, rights_class=excluded.rights_class, source_family=excluded.source_family, source_vintage=excluded.source_vintage`,
  ).run(opts.sourceId, opts.name, opts.sourceType, opts.rightsClass, opts.sourceFamily, opts.vintage, nowIso());

  const existing = db.prepare('SELECT version_id FROM knowledge_source_versions WHERE source_id = ? AND file_hash = ?').get(opts.sourceId, opts.hash) as { version_id: string } | undefined;
  if (existing) return { versionId: existing.version_id, alreadyImported: true };

  // A new hash supersedes the previous active version of the same source.
  const versionId = `${opts.sourceId}@${opts.hash.slice(0, 12)}`;
  // The new version row must exist before older rows can point to it
  // (superseded_by is a foreign key): importing a changed master file failed
  // with FOREIGN KEY constraint failed when the order was reversed.
  db.prepare(
    `INSERT INTO knowledge_source_versions (version_id, source_id, version, file_name, file_hash, file_bytes, record_count, validation_status, imported_at, active)
     VALUES (?,?,?,?,?,?,0,'PARTIAL',?,0)`,
  ).run(versionId, opts.sourceId, opts.version, path.basename(opts.file), opts.hash, opts.bytes, nowIso());
  db.prepare('UPDATE knowledge_source_versions SET active = 0, superseded_by = ? WHERE source_id = ? AND active = 1 AND version_id <> ?').run(versionId, opts.sourceId, versionId);
  db.prepare('UPDATE knowledge_source_versions SET active = 1 WHERE version_id = ?').run(versionId);
  return { versionId, alreadyImported: false };
}

/* ── clinical corpus ─────────────────────────────────────────────────────── */

function importClinical(ctx: Ctx, file: string, report: ImportReport) {
  const buf = fs.readFileSync(file);
  const hash = sha256(buf);
  const parsed = JSON.parse(buf.toString('utf8')) as { metadata?: Record<string, unknown>; topic_index?: unknown[]; clinical_rules?: unknown[] };
  const meta = parsed.metadata ?? {};
  const sourceId = 'SRC-GMAI-CLINICAL';
  const rights = String(meta.rights_status ?? meta.rights_class ?? 'RESTRICTED_INTERNAL_REFERENCE');
  const rightsClass = (RIGHTS_CLASSES as readonly string[]).includes(rights) ? rights : 'RESTRICTED_INTERNAL_REFERENCE';

  const { versionId, alreadyImported } = registerVersion(ctx, {
    sourceId,
    name: String(meta.package_name ?? 'GMAI Clinical Rules Master'),
    sourceType: 'clinical_rules',
    rightsClass,
    sourceFamily: String(meta.source_family ?? 'INTERNAL_REFERENCE'),
    vintage: String(meta.literature_review_current_through ?? meta.source_vintage ?? '2022'),
    file,
    hash,
    bytes: buf.byteLength,
    version: String(meta.version ?? 'v1'),
  });
  report.files.push({ file: path.basename(file), bytes: buf.byteLength, hash, sourceId, versionId, skipped: alreadyImported, reason: alreadyImported ? 'identical file hash already imported' : undefined });
  if (alreadyImported) return { versionId, rightsClass, imported: 0 };

  const { db } = ctx;
  const topicIds = new Set<string>();
  const insTopic = db.prepare(
    `INSERT OR REPLACE INTO clinical_topics (topic_id, version_id, topic_order, source_topic_id, title, domains, source_start_page, source_end_page, l2_objects, clinical_rules, validation_status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  );
  (parsed.topic_index ?? []).forEach((raw, i) => {
    const r = ClinicalTopicSchema.safeParse(raw);
    if (!r.success) {
      quarantine(ctx, sourceId, `topic#${i}`, 'TOPIC_SCHEMA_INVALID', r.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; '), raw);
      return;
    }
    const t = r.data;
    if (topicIds.has(t.topic_id)) {
      quarantine(ctx, sourceId, t.topic_id, 'DUPLICATE_TOPIC_ID', 'topic_id already seen in this file', raw);
      return;
    }
    topicIds.add(t.topic_id);
    insTopic.run(t.topic_id, versionId, t.topic_order ?? null, t.source_topic_id ?? null, t.title, jarr(asArray(t.domains)), t.source_start_page ?? null, t.source_end_page ?? null, t.l2_objects ?? null, t.clinical_rules ?? null, t.validation_status ?? null);
  });

  const insRule = db.prepare(
    `INSERT OR REPLACE INTO clinical_rules (
      rule_id, version_id, topic_id, topic_title, clinical_domains, rule_type, maturity, validation_status,
      source_trigger, normalized_condition_text, executable_expression, expression_language, action,
      exceptions_or_exclusions, monitoring_or_follow_up, escalation, safety_flags,
      patient_specific_safety_check_required, numeric_verification_required, human_clinical_validation_required,
      current_evidence_refresh_required, eligible_for_rule_engine, eligible_for_production_cds, next_required_step,
      source_derived_statement_internal, raw_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insReq = db.prepare('INSERT INTO clinical_required_data (rule_id, field) VALUES (?,?)');
  const insFhir = db.prepare('INSERT INTO clinical_fhir_requirements (rule_id, field, resource, path, transform, concept) VALUES (?,?,?,?,?,?)');
  const insNum = db.prepare('INSERT INTO clinical_numeric_constraints (rule_id, raw, kind, value_text, unit) VALUES (?,?,?,?,?)');
  const insProv = db.prepare('INSERT OR REPLACE INTO clinical_provenance (rule_id, source_family, source_pages, source_section, literature_review_current_through, topic_last_updated, rights_status) VALUES (?,?,?,?,?,?,?)');

  const ruleIds = new Set<string>();
  let accepted = 0;
  (parsed.clinical_rules ?? []).forEach((raw, i) => {
    const r = ClinicalRuleSchema.safeParse(raw);
    if (!r.success) {
      quarantine(ctx, sourceId, (raw as { rule_id?: string })?.rule_id ?? `rule#${i}`, 'RULE_SCHEMA_INVALID', r.error.issues.slice(0, 4).map((x) => `${x.path.join('.')}: ${x.message}`).join('; '), raw);
      return;
    }
    const d = r.data;
    if (ruleIds.has(d.rule_id)) {
      quarantine(ctx, sourceId, d.rule_id, 'DUPLICATE_RULE_ID', 'rule_id already seen in this file', raw);
      return;
    }
    ruleIds.add(d.rule_id);
    if (!topicIds.has(d.topic_id)) warn(ctx, sourceId, d.rule_id, 'BROKEN_TOPIC_REFERENCE', `topic_id ${d.topic_id} is not present in topic_index`);
    if (d.implementation.eligible_for_production_cds) warn(ctx, sourceId, d.rule_id, 'UNEXPECTED_PRODUCTION_CDS_FLAG', 'record claims production CDS eligibility; flagged for human review');

    const lg = d.clinical_logic;
    insRule.run(
      d.rule_id, versionId, d.topic_id, d.topic_title ?? null, jarr(d.clinical_domains), d.rule_type ?? null, d.maturity, d.validation_status,
      lg.trigger.source_trigger ?? null, lg.trigger.normalized_condition_text ?? null, lg.trigger.executable_expression ?? null, lg.trigger.expression_language ?? null, lg.action ?? null,
      JSON.stringify(lg.exceptions_or_exclusions ?? []), JSON.stringify(lg.monitoring_or_follow_up ?? []), JSON.stringify(lg.escalation ?? []), JSON.stringify(d.safety.flags ?? []),
      bool(d.safety.patient_specific_safety_check_required), bool(d.safety.numeric_verification_required), bool(d.safety.human_clinical_validation_required),
      bool(d.safety.current_evidence_refresh_required), bool(d.implementation.eligible_for_rule_engine), bool(d.implementation.eligible_for_production_cds), d.implementation.next_required_step ?? null,
      d.source_derived_statement_internal ?? null, JSON.stringify(raw),
    );
    (lg.required_data ?? []).forEach((f) => insReq.run(d.rule_id, f));
    (lg.fhir_data_requirements ?? []).forEach((f) => insFhir.run(d.rule_id, f.field ?? null, f.resource ?? null, f.path ?? null, f.transform ?? null, f.concept ?? null));
    (lg.numeric_constraints ?? []).forEach((n) => {
      const rawText = typeof n === 'string' ? n : JSON.stringify(n);
      const obj = (typeof n === 'object' && n !== null ? (n as Record<string, unknown>) : {}) as Record<string, unknown>;
      insNum.run(d.rule_id, rawText, String(obj.type ?? obj.kind ?? ''), String(obj.value ?? obj.threshold ?? ''), String(obj.unit ?? ''));
    });
    insProv.run(d.rule_id, d.provenance.source_family ?? null, JSON.stringify(d.provenance.source_pages ?? []), d.provenance.source_section ?? null, d.provenance.literature_review_current_through ?? null, d.provenance.topic_last_updated ?? null, d.provenance.rights_status);
    accepted += 1;
  });

  db.prepare('UPDATE knowledge_source_versions SET record_count = ?, validation_status = ? WHERE version_id = ?').run(accepted, ctx.quarantined.length ? 'PARTIAL' : 'VALID', versionId);
  return { versionId, rightsClass, imported: accepted };
}

/* ── quality / defect corpus ─────────────────────────────────────────────── */

function importQuality(ctx: Ctx, file: string, report: ImportReport) {
  const buf = fs.readFileSync(file);
  const hash = sha256(buf);
  const parsed = JSON.parse(buf.toString('utf8')) as Record<string, unknown>;
  const meta = (parsed.metadata ?? {}) as Record<string, unknown>;
  const sourceId = 'SRC-GMAI-QUALITY';
  const rights = String(meta.rights_status ?? 'PROPRIETARY_INTERNAL');
  const rightsClass = (RIGHTS_CLASSES as readonly string[]).includes(rights) ? rights : 'PROPRIETARY_INTERNAL';

  const { versionId, alreadyImported } = registerVersion(ctx, {
    sourceId,
    name: String(meta.package_name ?? 'GMAI Quality & Defect Rules Master'),
    sourceType: 'quality_defect_rules',
    rightsClass,
    sourceFamily: 'ავტორის სახელმძღვანელო — სამედიცინო დახმარების ხარისხის კრიტერიუმები და დეფექტების კლასიფიკაცია',
    vintage: String(meta.source_status ?? 'AUTHOR_DRAFT'),
    file,
    hash,
    bytes: buf.byteLength,
    version: String(meta.version ?? 'v1'),
  });
  report.files.push({ file: path.basename(file), bytes: buf.byteLength, hash, sourceId, versionId, skipped: alreadyImported, reason: alreadyImported ? 'identical file hash already imported' : undefined });
  if (alreadyImported) return { versionId, rightsClass, imported: 0 };

  const { db } = ctx;

  const insTax = db.prepare('INSERT OR REPLACE INTO defect_taxonomy (taxonomy_id, version_id, taxonomy_type, code, name, parent, source_heading_path, source) VALUES (?,?,?,?,?,?,?,?)');
  const taxIds = new Set<string>();
  ((parsed.defect_taxonomy as unknown[]) ?? []).forEach((raw, i) => {
    const r = TaxonomyNodeSchema.safeParse(raw);
    if (!r.success) return quarantine(ctx, sourceId, `tax#${i}`, 'TAXONOMY_SCHEMA_INVALID', r.error.issues[0]?.message ?? 'invalid', raw);
    const t = r.data;
    if (taxIds.has(t.taxonomy_id)) return quarantine(ctx, sourceId, t.taxonomy_id, 'DUPLICATE_TAXONOMY_ID', 'taxonomy_id already seen', raw);
    taxIds.add(t.taxonomy_id);
    insTax.run(t.taxonomy_id, versionId, t.taxonomy_type ?? null, t.code ?? null, t.name, t.parent ?? null, Array.isArray(t.source_heading_path) ? t.source_heading_path.join(' > ') : (t.source_heading_path ?? null), t.source ?? null);
  });
  // Referential integrity (audit F21). The source writes a parent as a code
  // („D01"), as a defect-class NAME, or as several names joined by " / ".
  // Names can themselves contain "/" without spaces („ინფორმირების/კომუნიკაციის
  // დეფექტი"), so only " / " separates parents. Each part is resolved to a
  // stable node id only when it is unambiguous: an exact code, or the exact name
  // of exactly one defect class. Anything else stays unresolved and is reported.
  const nodes = db.prepare('SELECT taxonomy_id, taxonomy_type, code, name, parent FROM defect_taxonomy WHERE version_id = ?').all(versionId) as { taxonomy_id: string; taxonomy_type: string | null; code: string | null; name: string; parent: string | null }[];
  const byCode = new Map(nodes.filter((n) => n.code).map((n) => [n.code!, n.taxonomy_id]));
  const classByName = new Map<string, string[]>();
  for (const n of nodes) if (n.taxonomy_type === 'defect_class') classByName.set(n.name, [...(classByName.get(n.name) ?? []), n.taxonomy_id]);
  db.prepare('DELETE FROM defect_taxonomy_parents WHERE version_id = ?').run(versionId);
  const insParent = db.prepare('INSERT OR REPLACE INTO defect_taxonomy_parents (taxonomy_id, version_id, parent_raw, parent_id, resolution) VALUES (?,?,?,?,?)');
  for (const n of nodes) {
    if (!n.parent?.trim()) continue;
    for (const part of splitParents(n.parent)) {
      const viaCode = byCode.get(part);
      const viaName = classByName.get(part);
      if (viaCode) insParent.run(n.taxonomy_id, versionId, part, viaCode, 'code');
      else if (viaName?.length === 1) insParent.run(n.taxonomy_id, versionId, part, viaName[0], 'defect_class_name');
      else {
        insParent.run(n.taxonomy_id, versionId, part, null, 'unresolved');
        warn(ctx, sourceId, n.taxonomy_id, 'BROKEN_TAXONOMY_PARENT', viaName && viaName.length > 1 ? `parent „${part}" matches ${viaName.length} defect classes — ambiguous, not linked` : `parent „${part}" matches no code or defect-class name`);
      }
    }
  }

  const insQ = db.prepare('INSERT OR REPLACE INTO audit_questions (question_id, version_id, question, defect_classes, evidence_dimensions, heading_path) VALUES (?,?,?,?,?,?)');
  ((parsed.audit_question_bank as unknown[]) ?? []).forEach((raw, i) => {
    const r = AuditQuestionSchema.safeParse(raw);
    if (!r.success) return quarantine(ctx, sourceId, `q#${i}`, 'AUDIT_QUESTION_SCHEMA_INVALID', r.error.issues[0]?.message ?? 'invalid', raw);
    const q = r.data;
    insQ.run(q.question_id, versionId, q.question, jarr(asArray(q.defect_classes)), jarr(asArray(q.evidence_dimensions)), Array.isArray(q.heading_path) ? q.heading_path.join(' > ') : (q.heading_path ?? null));
  });

  const wf = parsed.core_evaluation_workflow as { workflow_id?: string; steps?: { step: number; name: string; outputs?: string[] }[] } | undefined;
  if (wf?.steps) {
    const insWf = db.prepare('INSERT INTO quality_workflow_steps (version_id, workflow_id, step, name, outputs) VALUES (?,?,?,?,?)');
    db.prepare('DELETE FROM quality_workflow_steps WHERE version_id = ?').run(versionId);
    wf.steps.forEach((s) => insWf.run(versionId, wf.workflow_id ?? 'QDEF-AUDIT-CORE-01', s.step, s.name, JSON.stringify(s.outputs ?? [])));
  }

  const coverage = new Map<string, { status: string; rules: number; l2: number }>();
  ((parsed.coverage_report as unknown[]) ?? []).forEach((raw) => {
    const c = raw as { section?: string; coverage_status?: string; rules?: number; l2_objects?: number };
    if (c.section) coverage.set(c.section, { status: c.coverage_status ?? '', rules: c.rules ?? 0, l2: c.l2_objects ?? 0 });
  });
  const insSec = db.prepare('INSERT INTO quality_sections (version_id, level, title, parent, block_no, coverage_status, rules, l2_objects) VALUES (?,?,?,?,?,?,?,?)');
  db.prepare('DELETE FROM quality_sections WHERE version_id = ?').run(versionId);
  ((parsed.section_index as unknown[]) ?? []).forEach((raw) => {
    const s = raw as { level?: number; title?: string; parent?: string; block_no?: number };
    if (!s.title) return;
    const cov = coverage.get(s.title);
    insSec.run(versionId, s.level ?? null, s.title, s.parent ?? null, s.block_no ?? null, cov?.status ?? null, cov?.rules ?? null, cov?.l2 ?? null);
  });

  const insRule = db.prepare(
    `INSERT OR REPLACE INTO quality_rules (
      rule_id, version_id, source_l2_object_id, rule_family, defect_classes, maturity,
      trigger_or_question, criterion_or_action, exceptions, positive_finding,
      causality_assessment_required, standard_comparison_required, documentation_assessment_required,
      automation_level, eligible_for_automatic_flagging, eligible_for_autonomous_legal_conclusion, human_review_required,
      block_no, sentence_no, heading_path, source_statement, source_status, validation_status, raw_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insEv = db.prepare('INSERT INTO quality_required_evidence (rule_id, field) VALUES (?,?)');
  const seen = new Set<string>();
  let accepted = 0;
  ((parsed.quality_defect_rules as unknown[]) ?? []).forEach((raw, i) => {
    const r = QualityRuleSchema.safeParse(raw);
    if (!r.success) {
      quarantine(ctx, sourceId, (raw as { rule_id?: string })?.rule_id ?? `qdr#${i}`, 'RULE_SCHEMA_INVALID', r.error.issues.slice(0, 4).map((x) => `${x.path.join('.')}: ${x.message}`).join('; '), raw);
      return;
    }
    const d = r.data;
    if (seen.has(d.rule_id)) {
      quarantine(ctx, sourceId, d.rule_id, 'DUPLICATE_RULE_ID', 'rule_id already seen in this file', raw);
      return;
    }
    seen.add(d.rule_id);
    if (d.implementation.eligible_for_autonomous_legal_conclusion) {
      quarantine(ctx, sourceId, d.rule_id, 'AUTONOMOUS_LEGAL_CONCLUSION_FORBIDDEN', 'record claims autonomous legal conclusion; rejected by policy', raw);
      return;
    }
    if (d.maturity === 'QUALITY_RULE_CANDIDATE' && d.implementation.eligible_for_automatic_flagging) {
      warn(ctx, sourceId, d.rule_id, 'CANDIDATE_AUTOFLAG_DOWNGRADED', 'candidate rule cannot auto-flag a defect; flagging disabled on import');
      d.implementation.eligible_for_automatic_flagging = false;
    }
    const lg = d.rule_logic;
    insRule.run(
      d.rule_id, versionId, d.source_l2_object_id ?? null, d.rule_family ?? null, JSON.stringify((d.defect_classes ?? []).map(classRefName).filter(Boolean)), d.maturity,
      lg.trigger_or_question ?? null, lg.criterion_or_action ?? null, JSON.stringify(lg.exceptions ?? []), JSON.stringify(lg.positive_finding ?? {}),
      bool(lg.causality_assessment_required), bool(lg.standard_comparison_required), bool(lg.documentation_assessment_required),
      d.implementation.automation_level ?? null, bool(d.implementation.eligible_for_automatic_flagging), 0, bool(d.implementation.human_review_required),
      d.source_locator?.block_no ?? null, d.source_locator?.sentence_no ?? null, JSON.stringify(d.source_locator?.heading_path ?? []),
      d.source_statement ?? null, d.source_status ?? null, d.validation_status, JSON.stringify(raw),
    );
    (lg.required_evidence ?? []).forEach((f) => insEv.run(d.rule_id, f));
    accepted += 1;
  });

  db.prepare('UPDATE knowledge_source_versions SET record_count = ?, validation_status = ? WHERE version_id = ?').run(accepted, 'VALID', versionId);
  return { versionId, rightsClass, imported: accepted };
}

/* ── search index ────────────────────────────────────────────────────────── */

const MATURITY_WEIGHT: Record<string, number> = {
  L3_STRUCTURED_RULE: 1,
  L3_HIGH_COMPUTABILITY_CANDIDATE: 0.72,
  L3_CANDIDATE: 0.42,
  COMPUTABLE_AUDIT_CHECK: 1,
  HIGH_COMPUTABILITY_RULE: 0.85,
  STRUCTURED_DECISION_RULE: 0.78,
  HUMAN_JUDGMENT_RULE: 0.55,
  QUALITY_RULE_CANDIDATE: 0.4,
};

export async function buildSearchIndex(db: Database.Database, onProgress?: (msg: string) => void) {
  db.exec('DELETE FROM search_vectors; DELETE FROM search_items; DELETE FROM search_fts;');

  const ins = db.prepare(
    'INSERT INTO search_items (item_id, kind, rule_id, version_id, title, body, domains, maturity, rights_class, refresh_required, safety_weight, maturity_weight) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  );

  const clinical = db
    .prepare(
      `SELECT r.rule_id, r.version_id, r.topic_title, r.clinical_domains, r.maturity, r.action, r.source_trigger, r.normalized_condition_text,
              r.safety_flags, r.current_evidence_refresh_required, r.patient_specific_safety_check_required, r.numeric_verification_required,
              s.rights_class,
              (SELECT group_concat(field, ' ') FROM clinical_required_data d WHERE d.rule_id = r.rule_id) AS required_data
       FROM clinical_rules r
       JOIN knowledge_source_versions v ON v.version_id = r.version_id
       JOIN knowledge_sources s ON s.source_id = v.source_id
       WHERE v.active = 1`,
    )
    .all() as Record<string, unknown>[];

  const quality = db
    .prepare(
      `SELECT r.rule_id, r.version_id, r.rule_family, r.defect_classes, r.maturity, r.trigger_or_question, r.criterion_or_action, r.heading_path,
              r.causality_assessment_required, r.standard_comparison_required, r.documentation_assessment_required,
              s.rights_class,
              (SELECT group_concat(field, ' ') FROM quality_required_evidence e WHERE e.rule_id = r.rule_id) AS required_evidence
       FROM quality_rules r
       JOIN knowledge_source_versions v ON v.version_id = r.version_id
       JOIN knowledge_sources s ON s.source_id = v.source_id
       WHERE v.active = 1`,
    )
    .all() as Record<string, unknown>[];

  const questions = db
    .prepare(
      `SELECT q.question_id, q.version_id, q.question, q.defect_classes, q.evidence_dimensions, q.heading_path, s.rights_class
       FROM audit_questions q
       JOIN knowledge_source_versions v ON v.version_id = q.version_id
       JOIN knowledge_sources s ON s.source_id = v.source_id
       WHERE v.active = 1`,
    )
    .all() as Record<string, unknown>[];

  const rows: { itemId: string; kind: string; ruleId: string; versionId: string; title: string; body: string; domains: string; maturity: string; rights: string; refresh: number; safety: number; mat: number }[] = [];

  const strip = (v: unknown) => {
    try {
      const a = JSON.parse(String(v ?? '[]'));
      return Array.isArray(a) ? a.join(' ') : String(v ?? '');
    } catch {
      return String(v ?? '');
    }
  };

  clinical.forEach((r) => {
    const safety = (r.patient_specific_safety_check_required ? 0.5 : 0) + (r.numeric_verification_required ? 0.5 : 0);
    rows.push({
      itemId: `CR:${r.rule_id}`,
      kind: 'clinical_rule',
      ruleId: String(r.rule_id),
      versionId: String(r.version_id),
      title: String(r.topic_title ?? ''),
      body: normalizeForIndex([r.action, r.normalized_condition_text, r.source_trigger, r.required_data, strip(r.safety_flags)].filter(Boolean).join(' ')),
      domains: strip(r.clinical_domains),
      maturity: String(r.maturity),
      rights: String(r.rights_class),
      refresh: Number(r.current_evidence_refresh_required ?? 0),
      safety,
      mat: MATURITY_WEIGHT[String(r.maturity)] ?? 0.4,
    });
  });

  quality.forEach((r) => {
    const safety = (r.causality_assessment_required ? 0.34 : 0) + (r.standard_comparison_required ? 0.33 : 0) + (r.documentation_assessment_required ? 0.33 : 0);
    rows.push({
      itemId: `QR:${r.rule_id}`,
      kind: 'quality_rule',
      ruleId: String(r.rule_id),
      versionId: String(r.version_id),
      title: strip(r.heading_path) || String(r.rule_family ?? ''),
      body: normalizeForIndex([r.trigger_or_question, r.criterion_or_action, r.required_evidence, strip(r.defect_classes), r.rule_family].filter(Boolean).join(' ')),
      domains: strip(r.defect_classes),
      maturity: String(r.maturity),
      rights: String(r.rights_class),
      refresh: 0,
      safety,
      mat: MATURITY_WEIGHT[String(r.maturity)] ?? 0.4,
    });
  });

  questions.forEach((q) => {
    rows.push({
      itemId: `AQ:${q.question_id}`,
      kind: 'audit_question',
      ruleId: String(q.question_id),
      versionId: String(q.version_id),
      title: strip(q.heading_path),
      body: normalizeForIndex([q.question, strip(q.defect_classes), strip(q.evidence_dimensions)].join(' ')),
      domains: strip(q.defect_classes),
      maturity: 'AUDIT_QUESTION',
      rights: String(q.rights_class),
      refresh: 0,
      safety: 0.2,
      mat: 0.8,
    });
  });

  const insertAll = db.transaction((items: typeof rows) => {
    items.forEach((r) => ins.run(r.itemId, r.kind, r.ruleId, r.versionId, r.title, r.body, r.domains, r.maturity, r.rights, r.refresh, r.safety, r.mat));
  });
  insertAll(rows);
  db.exec("INSERT INTO search_fts(search_fts) VALUES('rebuild')");
  onProgress?.(`FTS index built: ${rows.length} items`);

  const provider = getEmbeddingProvider();
  const insVec = db.prepare('INSERT OR REPLACE INTO search_vectors (item_id, model, dim, norm, vector) VALUES (?,?,?,?,?)');
  const BATCH = 256;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const vectors = await provider.embed(slice.map((r) => `${r.title} ${r.domains} ${r.body}`));
    const tx = db.transaction(() => {
      slice.forEach((r, j) => insVec.run(r.itemId, provider.model, provider.dim, 1, vectorToBlob(vectors[j])));
    });
    tx();
    if (i % (BATCH * 8) === 0) onProgress?.(`embedded ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  onProgress?.(`vector index built with ${provider.model} (${provider.dim}d)`);
  return { items: rows.length, provider: { provider: provider.id, model: provider.model, dim: provider.dim, semantic: provider.semantic } };
}

/* ── entry point ─────────────────────────────────────────────────────────── */

export async function runImport(sourceDir: string, onProgress?: (msg: string) => void): Promise<ImportReport> {
  const db = openDb({ create: true });
  const runId = `RUN-${Date.now().toString(36).toUpperCase()}`;
  const startedAt = nowIso();
  const ctx: Ctx = { db, runId, quarantined: [], warnings: [] };

  db.prepare('INSERT INTO knowledge_import_runs (run_id, started_at, importer_version, status) VALUES (?,?,?,?)').run(runId, startedAt, IMPORTER_VERSION, 'RUNNING');

  const report: ImportReport = {
    runId,
    startedAt,
    finishedAt: '',
    status: 'SUCCESS',
    importerVersion: IMPORTER_VERSION,
    embedding: { provider: '', model: '', dim: 0, semantic: false },
    files: [],
    counts: {},
    quarantined: [],
    warnings: [],
  };

  const files = discoverFiles(sourceDir);
  if (!files.clinical && !files.quality) {
    db.prepare('UPDATE knowledge_import_runs SET finished_at=?, status=?, report_json=? WHERE run_id=?').run(nowIso(), 'FAILED', JSON.stringify({ error: 'no source files found', sourceDir }), runId);
    report.status = 'FAILED';
    report.finishedAt = nowIso();
    return report;
  }

  if (files.clinical) {
    onProgress?.(`importing clinical corpus: ${path.basename(files.clinical)}`);
    const r = importClinical(ctx, files.clinical, report);
    report.counts.clinicalRulesImported = r.imported;
  }
  if (files.quality) {
    onProgress?.(`importing quality corpus: ${path.basename(files.quality)}`);
    const r = importQuality(ctx, files.quality, report);
    report.counts.qualityRulesImported = r.imported;
  }

  onProgress?.('building search index');
  const idx = await buildSearchIndex(db, onProgress);
  report.embedding = idx.provider;
  report.counts.searchItems = idx.items;

  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  report.counts.clinicalTopics = count('SELECT COUNT(*) n FROM clinical_topics');
  report.counts.clinicalRules = count('SELECT COUNT(*) n FROM clinical_rules');
  report.counts.qualityRules = count('SELECT COUNT(*) n FROM quality_rules');
  report.counts.taxonomyNodes = count('SELECT COUNT(*) n FROM defect_taxonomy');
  report.counts.taxonomyParentLinks = count("SELECT COUNT(*) n FROM defect_taxonomy_parents WHERE resolution <> 'unresolved'");
  report.counts.taxonomyParentsUnresolved = count("SELECT COUNT(*) n FROM defect_taxonomy_parents WHERE resolution = 'unresolved'");
  report.counts.auditQuestions = count('SELECT COUNT(*) n FROM audit_questions');
  report.counts.workflowSteps = count('SELECT COUNT(*) n FROM quality_workflow_steps');
  report.counts.sections = count('SELECT COUNT(*) n FROM quality_sections');
  report.counts.vectors = count('SELECT COUNT(*) n FROM search_vectors');
  report.counts.quarantined = ctx.quarantined.length;
  report.counts.warnings = ctx.warnings.length;

  report.quarantined = ctx.quarantined.slice(0, 200);
  report.warnings = ctx.warnings.slice(0, 200);
  report.finishedAt = nowIso();
  report.status = ctx.quarantined.length ? 'PARTIAL' : 'SUCCESS';

  db.prepare('UPDATE knowledge_import_runs SET finished_at=?, files_seen=?, records_seen=?, records_accepted=?, records_quarantined=?, status=?, report_json=? WHERE run_id=?').run(
    report.finishedAt,
    report.files.length,
    (report.counts.clinicalRules ?? 0) + (report.counts.qualityRules ?? 0) + ctx.quarantined.length,
    (report.counts.clinicalRules ?? 0) + (report.counts.qualityRules ?? 0),
    ctx.quarantined.length,
    report.status,
    JSON.stringify(report),
    runId,
  );

  return report;
}
