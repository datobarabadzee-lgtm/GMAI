#!/usr/bin/env node
/**
 * IMPORTER — GMAI clinical knowledge package (schema 2.0) → collection `gmai_clinical_v2`.
 *
 *   node scripts/import-clinical-v2.mjs <package-dir> [--out <repo-root>] [--dry-run]
 *
 * Safe to run again and again:
 *   - every record is keyed by its stable package ID (topic_id / unit_id /
 *     section_id / item_id) and upserted: unchanged → left as is, changed →
 *     updated, new → inserted. A second run with the same package changes no
 *     record and creates no duplicate;
 *   - a unit that disappears from a later package is not deleted: it is marked
 *     `retired`, kept in the collection, excluded from search and the UI, and
 *     listed in the report;
 *   - the existing knowledge (src/knowledge, authored/quality, the internal
 *     SQLite base) is never touched — this collection lives in its own folders.
 *
 * Outputs (all under the repo root):
 *   authored/gmai_clinical_v2/units.json         server-side corpus for agents
 *   authored/gmai_clinical_v2/import-report.json result of the last run
 *   authored/gmai_clinical_v2/import-log.jsonl    one line per run
 *   public/clinical-v2/catalog.json              light catalog, loaded first
 *   public/clinical-v2/topics/<topic_id>.json    one topic, loaded on demand
 *   public/clinical-v2/media/*                   images and attachments
 *
 * Nothing is hidden: validation errors, skipped records, text normalisations
 * and checksum mismatches are all written to the report. The package text is
 * treated as data, never as instructions.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const COLLECTION = 'gmai_clinical_v2';
const SCHEMA_VERSION = '2.0';
const MEDIA_URL = '/clinical-v2/media/';
const ITEM_KINDS = new Set(['statement', 'heading', 'table']);
const CLINICAL_TYPES = new Set(['safety', 'dosing', 'assessment', 'criteria', 'management', 'clinical_context']);
const SETTINGS = new Set(['emergency', 'intensive_care']);

/**
 * Text repairs that restore the source wording and change no clinical meaning.
 * „ძ₾" is an extraction artefact of the ligature „ძლ" (შეიძ₾ება → შეიძლება).
 */
const TEXT_REPAIRS = [{ from: /ძ₾/g, to: 'ძლ', noteKa: '„ძ₾" → „ძლ" (ამოღების არტეფაქტი, მაგ. „შეიძ₾ება")' }];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const readJsonl = (p) =>
  fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch (e) {
        throw new Error(`${path.basename(p)}: line ${i + 1} is not valid JSON (${e.message})`);
      }
    });
const writeJson = (p, data, pretty = false) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const text = JSON.stringify(data, null, pretty ? 2 : 0) + '\n';
  if (fs.existsSync(p) && fs.readFileSync(p, 'utf8') === text) return false;
  fs.writeFileSync(p, text);
  return true;
};

function parseArgs(argv) {
  const args = { pkg: null, out: process.cwd(), dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = path.resolve(argv[++i]);
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (!args.pkg) args.pkg = path.resolve(argv[i]);
  }
  if (!args.pkg) {
    console.error('usage: node scripts/import-clinical-v2.mjs <package-dir> [--out <repo-root>] [--dry-run]');
    process.exit(2);
  }
  return args;
}

/* ── validation against integration/clinical-unit.schema.json (2.0) ───────── */

function validateUnit(u, errors) {
  const where = `unit ${u?.id ?? '?'}`;
  const req = ['id', 'topic_id', 'title', 'section_id', 'order', 'clinical_types', 'items', 'context', 'execution'];
  for (const k of req) if (u?.[k] === undefined) errors.push(`${where}: missing "${k}"`);
  if (typeof u.order !== 'number' || u.order < 1 || !Number.isInteger(u.order)) errors.push(`${where}: order must be an integer ≥ 1`);
  if (!Array.isArray(u.items) || u.items.length < 1) errors.push(`${where}: items must have at least one item`);
  for (const t of u.clinical_types ?? []) if (!CLINICAL_TYPES.has(t)) errors.push(`${where}: unknown clinical_type "${t}"`);
  const c = u.context ?? {};
  if (!SETTINGS.has(c.setting)) errors.push(`${where}: setting must be emergency | intensive_care`);
  if (c.must_retrieve_whole_section !== true) errors.push(`${where}: context.must_retrieve_whole_section must be true`);
  if (c.topic_context_required_for_clinical_answer !== true) errors.push(`${where}: context.topic_context_required_for_clinical_answer must be true`);
  for (const k of ['topic_title', 'section_title']) if (typeof c[k] !== 'string') errors.push(`${where}: context.${k} missing`);
  const x = u.execution ?? {};
  if (x.mode !== 'reference_knowledge' || x.executable !== false || x.clinical_review !== 'not_performed')
    errors.push(`${where}: execution must be reference_knowledge / executable=false / clinical_review=not_performed`);
  for (const it of u.items ?? []) {
    const w = `${where} item ${it?.id ?? '?'}`;
    for (const k of ['id', 'kind', 'text', 'clinical_type', 'media', 'numeric_mentions']) if (it?.[k] === undefined) errors.push(`${w}: missing "${k}"`);
    if (!ITEM_KINDS.has(it.kind)) errors.push(`${w}: unknown kind "${it.kind}"`);
    if (!CLINICAL_TYPES.has(it.clinical_type)) errors.push(`${w}: unknown clinical_type "${it.clinical_type}"`);
    for (const m of it.media ?? []) if (!m?.path || !['image', 'attachment'].includes(m.kind)) errors.push(`${w}: invalid media entry`);
    for (const n of it.numeric_mentions ?? []) if (typeof n?.literal !== 'string' || typeof n?.context !== 'string') errors.push(`${w}: invalid numeric_mention`);
    if (it.rows !== undefined && !(Array.isArray(it.rows) && it.rows.every((r) => Array.isArray(r) && r.every((cell) => typeof cell === 'string'))))
      errors.push(`${w}: rows must be string[][]`);
  }
}

/* ── main ─────────────────────────────────────────────────────────────────── */

function main() {
  const args = parseArgs(process.argv.slice(2));
  const P = (rel) => path.join(args.pkg, rel);
  const O = (rel) => path.join(args.out, rel);
  const startedAt = new Date().toISOString();

  const report = {
    collection: COLLECTION,
    package_id: null,
    schema_version: null,
    started_at: startedAt,
    finished_at: null,
    dry_run: args.dryRun,
    ok: false,
    counts: { topics: 0, sections: 0, units: 0, items: 0, tables: 0, media_files: 0, numeric_mentions: 0 },
    manifest_counts: null,
    units: { inserted: 0, updated: 0, unchanged: 0, retired: 0, skipped_invalid: 0 },
    media: { copied: 0, unchanged: 0, missing: [] },
    checksums: { checked: 0, mismatched: [], missing: [] },
    text_repairs: [],
    errors: [],
    warnings: [],
    not_imported: [],
  };

  const fail = (msg) => {
    report.errors.push(msg);
    finish();
    console.error(`IMPORT FAILED: ${msg}`);
    process.exit(1);
  };
  const finish = () => {
    report.finished_at = new Date().toISOString();
    if (args.dryRun) return;
    writeJson(O(`authored/${COLLECTION}/import-report.json`), report, true);
    fs.appendFileSync(
      O(`authored/${COLLECTION}/import-log.jsonl`),
      JSON.stringify({ at: report.finished_at, package_id: report.package_id, ok: report.ok, counts: report.counts, units: report.units, media: { copied: report.media.copied, unchanged: report.media.unchanged }, errors: report.errors.length, warnings: report.warnings.length }) + '\n',
    );
  };
  fs.mkdirSync(O(`authored/${COLLECTION}`), { recursive: true });

  /* 1. manifest + integrity */
  if (!fs.existsSync(P('manifest.json'))) fail('manifest.json not found in package');
  const manifest = readJson(P('manifest.json'));
  report.package_id = manifest.package_id ?? null;
  report.schema_version = manifest.schema_version ?? null;
  report.manifest_counts = manifest.counts ?? null;
  if (manifest.schema_version !== SCHEMA_VERSION) fail(`unsupported schema_version ${manifest.schema_version} (expected ${SCHEMA_VERSION})`);

  if (fs.existsSync(P('qa/checksums.json'))) {
    const sums = readJson(P('qa/checksums.json'));
    for (const [rel, expected] of Object.entries(sums)) {
      const f = P(rel);
      if (!fs.existsSync(f)) {
        report.checksums.missing.push(rel);
        continue;
      }
      report.checksums.checked++;
      if (sha256(fs.readFileSync(f)) !== expected) report.checksums.mismatched.push(rel);
    }
    const critical = report.checksums.mismatched.filter((r) => r.startsWith('knowledge/') || r.startsWith('agents/retrieval'));
    if (critical.length) fail(`checksum mismatch in knowledge files: ${critical.join(', ')}`);
    if (report.checksums.mismatched.length) report.warnings.push(`checksum mismatch (non-knowledge files): ${report.checksums.mismatched.join(', ')}`);
  } else report.warnings.push('qa/checksums.json not present — integrity not verified');

  /* 2. read package */
  const catalog = readJson(P('knowledge/catalog.json'));
  const pkgUnits = readJsonl(P('knowledge/clinical_units.jsonl'));
  const retrieval = fs.existsSync(P('agents/retrieval.jsonl')) ? readJsonl(P('agents/retrieval.jsonl')) : [];
  const retrievalById = new Map(retrieval.map((r) => [r.id, r]));

  // Training material is recorded, never used here (no fine-tuning without a separate agreement).
  for (const f of ['agents/train.jsonl', 'agents/validation.jsonl']) {
    if (fs.existsSync(P(f))) report.not_imported.push({ file: f, records: readJsonl(P(f)).length, reasonKa: 'სასწავლო დემონსტრაციები — მოდელის სწავლება ამ ეტაპზე არ ტარდება; validation ნაკრები ტრენინგში არ გამოიყენება.' });
  }
  if (fs.existsSync(P('agents/knowledge.sqlite')))
    report.not_imported.push({ file: 'agents/knowledge.sqlite', records: null, reasonKa: 'იგივე მონაცემი clinical_units.jsonl-დან იტვირთება; ძიება აპლიკაციის საკუთარ ძრავშია (SQLite-ის ბინარი production-ში არ ტვირთავს).' });
  if (fs.existsSync(P('app'))) report.not_imported.push({ file: 'app/', records: null, reasonKa: 'ვიზუალური ნიმუში — ინტერფეისი აპლიკაციაში ნატიურადაა აწყობილი; data.js არ გამოიყენება.' });

  /* 3. validate + normalise units */
  const topicMeta = new Map(catalog.topics.map((t) => [t.id, t]));
  const repairsSeen = new Map();
  const repair = (s, where) => {
    let out = s;
    for (const r of TEXT_REPAIRS) {
      const n = (out.match(r.from) ?? []).length;
      if (n) {
        out = out.replace(r.from, r.to);
        repairsSeen.set(r.noteKa, (repairsSeen.get(r.noteKa) ?? 0) + n);
        if (!report.text_repairs.some((x) => x.where === where)) report.text_repairs.push({ where, noteKa: r.noteKa, count: n });
      }
    }
    return out;
  };

  const valid = [];
  const seenUnit = new Set();
  const seenItem = new Set();
  for (const u of pkgUnits) {
    const errs = [];
    validateUnit(u, errs);
    if (seenUnit.has(u.id)) errs.push(`unit ${u.id}: duplicate unit id in package`);
    if (!topicMeta.has(u.topic_id)) errs.push(`unit ${u.id}: topic ${u.topic_id} not in catalog`);
    for (const it of u.items ?? []) {
      if (seenItem.has(it.id)) errs.push(`unit ${u.id}: duplicate item id ${it.id}`);
      for (const m of it.media ?? []) if (!fs.existsSync(P(path.join('app', m.path)))) errs.push(`unit ${u.id} item ${it.id}: media file missing ${m.path}`);
    }
    if (errs.length) {
      report.errors.push(...errs);
      report.units.skipped_invalid++;
      continue;
    }
    seenUnit.add(u.id);
    u.items.forEach((it) => seenItem.add(it.id));

    const r = retrievalById.get(u.id);
    const unit = {
      id: u.id,
      topic_id: u.topic_id,
      section_id: u.section_id,
      order: u.order,
      title: repair(u.title, `${u.id}.title`),
      setting: u.context.setting,
      topic_title: repair(u.context.topic_title, `${u.id}.topic_title`),
      section_title: repair(u.context.section_title, `${u.id}.section_title`),
      clinical_types: [...u.clinical_types],
      context_unit_ids: r?.context_unit_ids ?? [u.id],
      items: u.items.map((it) => ({
        id: it.id,
        kind: it.kind,
        clinical_type: it.clinical_type,
        text: repair(it.text, `${u.id}/${it.id}`),
        ...(it.rows ? { rows: it.rows.map((row) => row.map((cell) => repair(cell, `${u.id}/${it.id}.rows`))) } : {}),
        media: it.media.map((m) => ({ kind: m.kind, path: MEDIA_URL + path.basename(m.path), file: path.basename(m.path) })),
        numeric_mentions: it.numeric_mentions.map((n) => ({ literal: n.literal, context: repair(n.context, `${u.id}/${it.id}.numeric`) })),
      })),
      execution: { mode: 'reference_knowledge', executable: false, clinical_review: 'not_performed' },
    };
    if (!r) report.warnings.push(`unit ${u.id}: no retrieval record — whole-section context falls back to section_id`);
    valid.push(unit);
  }

  /* 4. relational checks: sections, catalog, manifest */
  const bySection = new Map();
  for (const u of valid) bySection.set(u.section_id, [...(bySection.get(u.section_id) ?? []), u]);
  for (const [sid, list] of bySection) {
    const ids = list.map((u) => u.id).sort();
    for (const u of list) {
      const ctx = [...u.context_unit_ids].sort();
      if (ctx.join() !== ids.join()) report.warnings.push(`section ${sid}: context_unit_ids of ${u.id} (${ctx.length}) differ from units sharing section_id (${ids.length}) — section_id used`);
      u.context_unit_ids = ids;
    }
    if (new Set(list.map((u) => u.topic_id)).size > 1) report.errors.push(`section ${sid}: spans more than one topic`);
  }
  for (const t of catalog.topics) {
    for (const uid of t.unit_ids) if (!seenUnit.has(uid)) report.errors.push(`catalog topic ${t.id}: unit ${uid} not imported`);
  }

  /* 5. upsert into the collection */
  const corpusPath = O(`authored/${COLLECTION}/units.json`);
  const existing = fs.existsSync(corpusPath) ? readJson(corpusPath) : { units: [] };
  const prev = new Map((existing.units ?? []).map((u) => [u.id, u]));
  const hashOf = (u) => sha256(JSON.stringify({ ...u, content_hash: undefined, status: undefined }));
  const merged = new Map();
  for (const u of valid) {
    const h = hashOf(u);
    const old = prev.get(u.id);
    if (!old) report.units.inserted++;
    else if (old.content_hash !== h || old.status !== 'active') report.units.updated++;
    else report.units.unchanged++;
    merged.set(u.id, { ...u, status: 'active', content_hash: h });
  }
  for (const [id, old] of prev) {
    if (merged.has(id)) continue;
    if (old.status !== 'retired') report.units.retired++;
    merged.set(id, { ...old, status: 'retired' });
  }
  const units = [...merged.values()].sort((a, b) => a.topic_id.localeCompare(b.topic_id) || a.order - b.order || a.id.localeCompare(b.id));
  const active = units.filter((u) => u.status === 'active');

  /* 6. counts */
  const activeTopics = [...new Set(active.map((u) => u.topic_id))];
  report.counts.topics = activeTopics.length;
  report.counts.sections = new Set(active.map((u) => u.section_id)).size;
  report.counts.units = active.length;
  report.counts.items = active.reduce((a, u) => a + u.items.length, 0);
  report.counts.tables = active.reduce((a, u) => a + u.items.filter((i) => i.kind === 'table').length, 0);
  report.counts.numeric_mentions = active.reduce((a, u) => a + u.items.reduce((b, i) => b + i.numeric_mentions.length, 0), 0);
  const mc = manifest.counts ?? {};
  if (mc.topics !== undefined && mc.topics !== report.counts.topics) report.errors.push(`topics: manifest ${mc.topics}, imported ${report.counts.topics}`);
  if (mc.units !== undefined && mc.units !== report.counts.units) report.errors.push(`units: manifest ${mc.units}, imported ${report.counts.units}`);
  if (mc.clinical_items !== undefined && mc.clinical_items !== report.counts.items) report.errors.push(`items: manifest ${mc.clinical_items}, imported ${report.counts.items}`);

  /* 7. media */
  const mediaFiles = [...new Set(active.flatMap((u) => u.items.flatMap((i) => i.media.map((m) => m.file))))];
  report.counts.media_files = mediaFiles.length;
  if (!args.dryRun) {
    const mediaDir = O('public/clinical-v2/media');
    fs.mkdirSync(mediaDir, { recursive: true });
    for (const f of mediaFiles) {
      const src = P(path.join('app/media', f));
      const dst = path.join(mediaDir, f);
      if (!fs.existsSync(src)) {
        report.media.missing.push(f);
        continue;
      }
      const buf = fs.readFileSync(src);
      if (fs.existsSync(dst) && sha256(fs.readFileSync(dst)) === sha256(buf)) report.media.unchanged++;
      else {
        fs.writeFileSync(dst, buf);
        report.media.copied++;
      }
    }
  }
  if (report.media.missing.length) report.errors.push(`media missing: ${report.media.missing.join(', ')}`);

  /* 8. write collection, catalog and topic files */
  report.text_repairs_summary = [...repairsSeen].map(([noteKa, count]) => ({ noteKa, count }));
  if (!args.dryRun) {
    writeJson(corpusPath, { collection: COLLECTION, package_id: manifest.package_id, schema_version: SCHEMA_VERSION, units });

    const sectionsOf = (topicId) => {
      const list = active.filter((u) => u.topic_id === topicId);
      const order = [];
      const map = new Map();
      for (const u of list) {
        if (!map.has(u.section_id)) {
          map.set(u.section_id, { id: u.section_id, title: u.section_title, units: [] });
          order.push(u.section_id);
        }
        map.get(u.section_id).units.push(u.id);
      }
      return order.map((id) => map.get(id));
    };

    const topicsOut = catalog.topics
      .filter((t) => activeTopics.includes(t.id))
      .map((t) => {
        const list = active.filter((u) => u.topic_id === t.id);
        return {
          id: t.id,
          title: list[0]?.topic_title ?? t.title,
          category: t.category,
          setting: t.setting,
          sectionCount: new Set(list.map((u) => u.section_id)).size,
          unitCount: list.length,
          facets: [...new Set(list.flatMap((u) => u.clinical_types))],
          hasMedia: list.some((u) => u.items.some((i) => i.media.length)),
        };
      });
    writeJson(O('public/clinical-v2/catalog.json'), {
      collection: COLLECTION,
      package_id: manifest.package_id,
      schema_version: SCHEMA_VERSION,
      categories: catalog.categories,
      topics: topicsOut,
    });

    const topicDir = O('public/clinical-v2/topics');
    fs.mkdirSync(topicDir, { recursive: true });
    for (const t of topicsOut) {
      const list = active.filter((u) => u.topic_id === t.id);
      writeJson(path.join(topicDir, `${t.id}.json`), {
        topic: t,
        sections: sectionsOf(t.id).map((s) => ({
          id: s.id,
          title: s.title,
          units: s.units.map((id) => {
            const u = list.find((x) => x.id === id);
            return { id: u.id, title: u.title, order: u.order, clinical_types: u.clinical_types, items: u.items.map(({ numeric_mentions: _n, ...it }) => it) };
          }),
        })),
      });
    }
  }

  report.ok = report.errors.length === 0;
  finish();
  const s = report.counts;
  console.log(
    `${report.ok ? 'OK' : 'COMPLETED WITH ERRORS'} — ${COLLECTION} ${report.package_id}: ${s.topics} topics, ${s.sections} sections, ${s.units} units, ${s.items} items, ${s.tables} tables, ${s.media_files} media files` +
      ` | units +${report.units.inserted} ~${report.units.updated} =${report.units.unchanged} retired ${report.units.retired} skipped ${report.units.skipped_invalid}` +
      ` | media copied ${report.media.copied}, unchanged ${report.media.unchanged} | checksums ${report.checksums.checked} checked, ${report.checksums.mismatched.length} mismatched` +
      ` | ${report.errors.length} errors, ${report.warnings.length} warnings`,
  );
  if (!report.ok) process.exit(1);
}

main();
