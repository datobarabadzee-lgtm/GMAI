#!/usr/bin/env node
/**
 * Ingests the author's own Quality & Defect corpus
 * (GMAI_Quality_Defect_Rules_Master_v1, derived from
 * „სამედიცინო დახმარების ხარისხის კრიტერიუმები და დეფექტების კლასიფიკაცია")
 * into compact server-side datasets under data/quality/.
 *
 * Activation policy: a rule is ACTIVE only if its maturity is one of the
 * four decided maturities. QUALITY_RULE_CANDIDATE rows are sentence-level
 * extractions and are kept for traceability only — never served as rules.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';

const SRC = process.argv[2];
const OUT = resolve(process.argv[3] ?? 'authored/quality');
if (!SRC) { console.error('usage: ingest-quality.mjs <corpus-dir> [outdir]'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const ACTIVE_MATURITIES = new Set([
  'STRUCTURED_DECISION_RULE',
  'COMPUTABLE_AUDIT_CHECK',
  'HIGH_COMPUTABILITY_RULE',
  'HUMAN_JUDGMENT_RULE',
]);

// ---------- CSV ----------
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}
const csv = (name) => parseCsv(readFileSync(resolve(SRC, name), 'utf8'));
const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const split = (s) => clean(s).split('|').map((x) => x.trim()).filter(Boolean);

// ---------- taxonomy ----------
const taxonomy = csv('GMAI_Defect_Taxonomy.csv')
  .filter((r) => r.name)
  .map((r) => ({
    id: r.taxonomy_id,
    type: r.taxonomy_type,
    code: r.code || null,
    nameKa: clean(r.name),
    parent: r.parent || null,
    headingPath: r.source_heading_path ? r.source_heading_path.split('>').map(clean) : [],
  }));

// ---------- audit questions ----------
const auditQuestions = csv('GMAI_Audit_Question_Bank.csv')
  .filter((r) => r.question)
  .map((r) => ({
    id: r.question_id,
    questionKa: clean(r.question),
    defectClasses: split(r.defect_classes),
    evidence: split(r.evidence_dimensions),
    headingPath: r.heading_path ? r.heading_path.split('>').map(clean) : [],
  }));

// ---------- rules ----------
const lines = readFileSync(resolve(SRC, 'GMAI_Quality_Defect_Rules_Master_v1.jsonl'), 'utf8').split('\n').filter(Boolean);
const all = lines.map((l) => JSON.parse(l));

const maturityCounts = {};
for (const r of all) maturityCounts[r.maturity] = (maturityCounts[r.maturity] ?? 0) + 1;

// A rule earns activation only with actual decidable content.
function activate(r) {
  if (!ACTIVE_MATURITIES.has(r.maturity)) return false;
  const l = r.rule_logic ?? {};
  const body = clean(l.criterion_or_action ?? '');
  const trigger = clean(l.trigger_or_question ?? '');
  if (body.length < 25 && trigger.length < 25) return false;
  return Boolean(
    trigger ||
    l.causality_assessment_required ||
    l.standard_comparison_required ||
    l.documentation_assessment_required ||
    (l.required_evidence ?? []).length,
  );
}

const rules = all.map((r) => {
  const l = r.rule_logic ?? {};
  const imp = r.implementation ?? {};
  const loc = r.source_locator ?? {};
  return {
    id: r.rule_id,
    family: r.rule_family,
    defectClasses: (r.defect_classes ?? []).map((d) =>
      typeof d === 'string' ? { code: null, nameKa: clean(d) } : { code: d.code ?? null, nameKa: clean(d.name ?? d.nameKa ?? '') },
    ).filter((d) => d.nameKa),
    maturity: r.maturity,
    active: activate(r),
    triggerKa: clean(l.trigger_or_question) || null,
    criterionKa: clean(l.criterion_or_action) || null,
    requiredEvidence: l.required_evidence ?? [],
    exceptions: (l.exceptions ?? []).map(clean).filter(Boolean),
    needsCausality: Boolean(l.causality_assessment_required),
    needsStandardComparison: Boolean(l.standard_comparison_required),
    needsDocumentationReview: Boolean(l.documentation_assessment_required),
    automation: imp.automation_level ?? 'human-in-the-loop',
    autoFlag: Boolean(imp.eligible_for_automatic_flagging),
    humanReviewRequired: imp.human_review_required !== false,
    // The author's manual is the source; the locator is what makes a finding citable.
    chapterPath: (loc.heading_path ?? []).map(clean).filter(Boolean),
    block: loc.block_no ?? null,
  };
});

const active = rules.filter((r) => r.active);
const families = [...new Set(active.map((r) => r.family))].sort();

// ---------- evidence dimensions (the vocabulary the engine asks for) ----------
const evidenceDims = {};
for (const r of active) for (const e of r.requiredEvidence) evidenceDims[e] = (evidenceDims[e] ?? 0) + 1;
for (const q of auditQuestions) for (const e of q.evidence) evidenceDims[e] = (evidenceDims[e] ?? 0) + 1;

const manifest = {
  source: 'დეფექტების_კლასიფიკატორი - DRAFT.docx',
  sourceStatus: 'AUTHOR_DRAFT',
  author: 'დავით ბარაბაძე',
  ingestedAt: new Date().toISOString().slice(0, 10),
  rulesExtracted: rules.length,
  rulesActive: active.length,
  maturityCounts,
  activeByMaturity: Object.fromEntries(
    [...ACTIVE_MATURITIES].map((m) => [m, active.filter((r) => r.maturity === m).length]),
  ),
  families: families.length,
  taxonomyNodes: taxonomy.length,
  auditQuestions: auditQuestions.length,
  evidenceDimensions: Object.keys(evidenceDims).length,
  checksum: createHash('sha256').update(JSON.stringify(rules)).digest('hex').slice(0, 16),
};

const w = (name, data) => {
  const p = resolve(OUT, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data));
  return (readFileSync(p).length / 1024).toFixed(0);
};

console.log('rules.json      ', w('rules.json', rules), 'KB');
console.log('taxonomy.json   ', w('taxonomy.json', taxonomy), 'KB');
console.log('audit.json      ', w('audit.json', auditQuestions), 'KB');
console.log('evidence.json   ', w('evidence.json', evidenceDims), 'KB');
console.log('manifest.json   ', w('manifest.json', manifest), 'KB');
console.log('');
console.log(JSON.stringify(manifest, null, 2));
