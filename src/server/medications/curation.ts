import 'server-only';
import { appTier } from '@/lib/tier';
import { operatorConfigured } from '@/server/operator-auth';
import { appendFile, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { MisEntry } from '../../../knowledge/medications/store.mjs';
import { getStore, MED_ROOT } from './identity';

/**
 * CURATOR MAPPINGS — Georgian catalog name (MIS) → exact FDA name.
 *
 * The package's crosswalk links names only by identical English spelling and
 * is explicitly NOT product equivalence. A mapping becomes usable only after a
 * named curator approves it. An approval only changes which exact FDA name is
 * searched for a Georgian name; the user must still pick and confirm a
 * specific product before any label text or dose is shown.
 *
 * Storage: knowledge/medications/curated-map.json, shipped with the
 * deployment. In local mode (not the public tier, request from localhost) the
 * /curation page writes it directly; on the public site decisions stay in the
 * curator's browser and are exported as a file for the operator to merge.
 * Every entry is re-validated when loaded: the MIS id and Georgian name must
 * match the catalog and an approved target must exist in the FDA index with
 * selectable products — otherwise the entry is ignored and reported.
 */

/** Test seam: MED_CURATED_MAP points the loader at another file. */
export const mapPath = () => process.env.MED_CURATED_MAP ?? path.join(MED_ROOT, 'curated-map.json');

export type CurationDecision = {
  mis_id: string;
  name_ka: string;
  name_en: string;
  kind: string;
  decision: 'approved' | 'rejected';
  /** Exact FDA brand/generic name searched instead of the Georgian name. */
  target_query?: string;
  approved_by: string;
  approved_at: string;
  note?: string;
  /** Required for an approval (audit F10): what the identity decision rests on. */
  substance?: string;
  salt?: string;
  form?: string;
  strength?: string;
  route?: string;
  /** Georgian registration reference (number or registry URL), when known. */
  registration_ref?: string;
  evidence?: { source_url: string; checked: string };
};

/**
 * The map file is versioned (audit F10): every write increments `revision`,
 * records `updated_at` and the SHA-256 of the entries, and appends one line to
 * curated-map.changelog.jsonl with the hashes before/after and the ids
 * added, changed and removed. `npm run med:curation-diff -- old new` compares
 * two files.
 */
type MapFile = { version: number; revision?: number; updated_at?: string; entries_sha256?: string; description?: string; entries: CurationDecision[] };

export const entriesHash = (entries: CurationDecision[]) => createHash('sha256').update(JSON.stringify([...entries].sort((a, b) => a.mis_id.localeCompare(b.mis_id)))).digest('hex');
export const changelogPath = () => mapPath().replace(/\.json$/, '.changelog.jsonl');

let cache: { at: number; valid: Map<string, CurationDecision>; invalid: { entry: CurationDecision; reasonKa: string }[] } | null = null;

async function misTable(): Promise<Record<string, MisEntry>> {
  const store = await getStore();
  return (await store.load('data/mis.json.gz')) as Record<string, MisEntry>;
}

async function crosswalk(): Promise<Record<string, [number, string][]>> {
  const store = await getStore();
  return (await store.load('data/unapproved-crosswalk.json.gz')) as Record<string, [number, string][]>;
}

export async function targetCheck(target: string): Promise<{ ok: boolean; selectableTotal: number; total: number; sample: string[] }> {
  const store = await getStore();
  if (typeof target !== 'string' || target.trim().length < 2 || target.length > 200) return { ok: false, selectableTotal: 0, total: 0, sample: [] };
  const m = await store.matches(target);
  const sel = m.f.filter(([, k]) => k === 'brand_name' || k === 'generic_name');
  const ids = new Set(m.f.map(([id]) => id));
  const sample = [...new Set(sel.map(([, , d]) => d))].slice(0, 5);
  return { ok: sel.length > 0, selectableTotal: new Set(sel.map(([id]) => id)).size, total: ids.size, sample };
}

async function validate(entries: CurationDecision[]) {
  const mis = await misTable();
  const valid = new Map<string, CurationDecision>();
  const invalid: { entry: CurationDecision; reasonKa: string }[] = [];
  for (const e of entries) {
    const row = mis[e.mis_id];
    if (!row) invalid.push({ entry: e, reasonKa: 'MIS ჩანაწერი ვერ მოიძებნა' });
    else if (row.name_ka !== e.name_ka) invalid.push({ entry: e, reasonKa: 'ქართული დასახელება კატალოგს არ ემთხვევა' });
    else if (!e.approved_by?.trim() || !e.approved_at) invalid.push({ entry: e, reasonKa: 'კურატორი ან თარიღი არ არის მითითებული' });
    else if (e.decision === 'approved' && !e.substance?.trim()) invalid.push({ entry: e, reasonKa: 'დადასტურებისთვის მოქმედი ნივთიერება (და მარილი, თუ აქვს) სავალდებულოა' })
    else if (e.decision === 'approved' && !(/^https?:\/\//.test(e.evidence?.source_url ?? '') && (e.evidence?.checked ?? '').trim().length >= 10)) invalid.push({ entry: e, reasonKa: 'დადასტურებისთვის მტკიცებულება სავალდებულოა: წყაროს ბმული და რა შემოწმდა' })
    else if (e.decision === 'approved' && !(await targetCheck(e.target_query ?? '')).ok) invalid.push({ entry: e, reasonKa: `სამიზნე „${e.target_query ?? ''}“ FDA-ს ინდექსში შესარჩევ პროდუქტს არ შეესაბამება` });
    else if (e.decision !== 'approved' && e.decision !== 'rejected') invalid.push({ entry: e, reasonKa: 'უცნობი გადაწყვეტილება' });
    else valid.set(e.mis_id, e);
  }
  return { valid, invalid };
}

export async function loadCuratedMap(force = false) {
  if (cache && !force && Date.now() - cache.at < 60_000) return cache;
  let file: MapFile = { version: 1, entries: [] };
  try {
    file = JSON.parse(await readFile(/*turbopackIgnore: true*/ mapPath(), 'utf8')) as MapFile;
  } catch {
    /* no file → no mappings */
  }
  const { valid, invalid } = await validate(Array.isArray(file.entries) ? file.entries : []);
  cache = { at: Date.now(), valid, invalid };
  return cache;
}

/** Curator decision for one of the catalog entries of a search, approved first. */
export async function curatedFor(misIds: string[]): Promise<CurationDecision | null> {
  const { valid } = await loadCuratedMap();
  const hits = misIds.map((id) => valid.get(id)).filter((x): x is CurationDecision => Boolean(x));
  return hits.find((h) => h.decision === 'approved') ?? hits[0] ?? null;
}

/* ── queue and item views for the curator page ───────────────────────────── */

export type QueueItem = { mis_id: string; kind: string; name_ka: string; name_en: string; source_url: string; crosswalk: number; decision: CurationDecision['decision'] | null };

export async function curationQueue(opts: { q?: string; filter?: 'crosswalk' | 'no_crosswalk' | 'decided' | 'all'; offset?: number; limit?: number }) {
  const [mis, cw, map] = await Promise.all([misTable(), crosswalk(), loadCuratedMap()]);
  const q = (opts.q ?? '').trim().toLowerCase();
  const filter = opts.filter ?? 'crosswalk';
  const rows: QueueItem[] = [];
  for (const [id, e] of Object.entries(mis)) {
    if (e.is_placeholder) continue;
    if (q && !e.name_ka.toLowerCase().includes(q) && !e.name_en.toLowerCase().includes(q)) continue;
    const n = cw[id]?.length ?? 0;
    const d = map.valid.get(id)?.decision ?? null;
    if (filter === 'crosswalk' && (!n || d)) continue;
    if (filter === 'no_crosswalk' && (n || d)) continue;
    if (filter === 'decided' && !d) continue;
    rows.push({ mis_id: id, kind: e.kind, name_ka: e.name_ka, name_en: e.name_en, source_url: e.source_url, crosswalk: n, decision: d });
  }
  // Exact-name matches first when searching, then trade names, then alphabetic.
  rows.sort((a, b) => Number(b.name_ka.toLowerCase() === q || b.name_en.toLowerCase() === q) - Number(a.name_ka.toLowerCase() === q || a.name_en.toLowerCase() === q) || (a.kind === b.kind ? 0 : a.kind === 'trade_name' ? -1 : 1) || a.name_ka.localeCompare(b.name_ka, 'ka'));
  const offset = opts.offset ?? 0;
  const limit = Math.min(50, opts.limit ?? 25);
  return { total: rows.length, offset, limit, items: rows.slice(offset, offset + limit) };
}

export async function curationItem(misId: string) {
  const [mis, cw, map] = await Promise.all([misTable(), crosswalk(), loadCuratedMap()]);
  const e = mis[misId];
  if (!e) return null;
  const store = await getStore();
  const cand = cw[misId] ?? [];
  // The crosswalk links by identical English name; show what that name finds.
  const exact = e.name_en ? await targetCheck(e.name_en) : { ok: false, selectableTotal: 0, total: 0, sample: [] };
  const siblings = Object.values(mis).filter((x) => x.id !== e.id && !x.is_placeholder && x.name_en && e.name_en && x.name_en.toLowerCase() === e.name_en.toLowerCase()).slice(0, 10).map((x) => ({ mis_id: x.id, kind: x.kind, name_ka: x.name_ka }));
  const sample = await Promise.all(cand.slice(0, 8).map(async ([rid]) => store.record(rid).then((r) => ({ record_id: rid, source: r.source, source_id: r.external_id })).catch(() => null)));
  return {
    entry: { mis_id: e.id, kind: e.kind, name_ka: e.name_ka, name_en: e.name_en, source_url: e.source_url },
    crosswalk: { count: cand.length, reasonKa: 'მხოლოდ ზუსტად იგივე ინგლისური სახელი — პროდუქტის ეკვივალენტობას არ ადასტურებს', sample: sample.filter(Boolean) },
    exactEnglish: exact,
    siblings,
    decision: map.valid.get(misId) ?? null,
  };
}

/** Local mode only: write decisions into curated-map.json (merge by mis_id). */
export async function saveDecisions(decisions: CurationDecision[]) {
  const { valid, invalid } = await validate(decisions);
  let file: MapFile = { version: 1, entries: [] };
  try {
    file = JSON.parse(await readFile(/*turbopackIgnore: true*/ mapPath(), 'utf8')) as MapFile;
  } catch {
    /* new file */
  }
  const before = entriesHash(file.entries);
  const byId = new Map(file.entries.map((x) => [x.mis_id, x]));
  const added: string[] = [];
  const changed: string[] = [];
  for (const d of valid.values()) {
    const prev = byId.get(d.mis_id);
    if (!prev) added.push(d.mis_id);
    else if (JSON.stringify(prev) !== JSON.stringify(d)) changed.push(d.mis_id);
    byId.set(d.mis_id, d);
  }
  if (!added.length && !changed.length) return { saved: 0, rejected: invalid, revision: file.revision ?? 0, entries_sha256: before };
  file.entries = [...byId.values()].sort((a, b) => a.name_ka.localeCompare(b.name_ka, 'ka'));
  file.revision = (file.revision ?? 0) + 1;
  file.updated_at = new Date().toISOString();
  file.entries_sha256 = entriesHash(file.entries);
  const tmp = `${mapPath()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  await rename(tmp, mapPath());
  await appendFile(changelogPath(), `${JSON.stringify({ revision: file.revision, at: file.updated_at, by: [...new Set([...valid.values()].map((d) => d.approved_by))], sha256_before: before, sha256_after: file.entries_sha256, added, changed, removed: [] })}\n`, 'utf8');
  cache = null;
  return { saved: added.length + changed.length, rejected: invalid, revision: file.revision, entries_sha256: file.entries_sha256 };
}

/**
 * Whether this deployment can accept curator writes at all (internal tier with
 * an operator token configured). This is a capability flag for the UI — every
 * write is still authorised per request by checkOperator (operator-auth.ts).
 * A localhost hostname or a missing VERCEL variable is not authorisation
 * (audit F18).
 */
export function curatorWritesEnabled(): boolean {
  return appTier() === 'internal' && operatorConfigured();
}
