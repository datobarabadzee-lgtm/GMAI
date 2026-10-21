import 'server-only';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { issueReceipt, resolveReceipt } from './receipts';
import { cleanText, hasStrength, nameMatches, parseSmpcs, substancesMatch, type Smpc, type SmpcSectionKey } from './smpc';
import type { ConfirmedContext, ProductIdentity } from './identity';

/**
 * EUROPEAN PRODUCT INFORMATION (EMA) — a second, separate source next to openFDA.
 *
 *   name → exact lookup in a compact index of EMA's own medicines file
 *          (medicine name, previous name, active substance, INN — whole
 *          string, case-insensitive; nothing similar, nothing transliterated)
 *        → EMA medicines (each has its own EMA product number)
 *        → its "EPAR – Product Information" PDF, linked by that product number
 *          in EMA's documents file and fetched live from www.ema.europa.eu
 *        → the SmPCs in Annex I, each checked: medicine name in section 1,
 *          every active substance in section 2, a strength with a unit, a
 *          pharmaceutical form, all of 4.1–4.9 present
 *        → the user picks one SmPC and confirms; the receipt is bound to the
 *          session, the query, the product number + SmPC and the hash of its
 *          text, and every later use re-fetches and compares.
 *
 * An EMA product is never linked to an FDA label automatically: they are two
 * products from two regulators and are shown side by side, each labelled.
 * Only centrally authorised medicines are in EMA's database; nationally
 * authorised products (most older generics) are not.
 */

export const EMA_BASE = 1_000_000_000;
export const isEmaRecord = (id: number) => Number.isSafeInteger(id) && id >= EMA_BASE && id < EMA_BASE + 100_000_000;
export const emaRecordId = (num: number, smpc: number) => EMA_BASE + num * 100 + smpc;
export const decodeEmaRecord = (id: number) => ({ num: Math.floor((id - EMA_BASE) / 100), smpc: (id - EMA_BASE) % 100 });
export const emaNumber = (num: number) => `EMEA/H/C/${String(num).padStart(6, '0')}`;

const ROOT = path.join(process.cwd(), 'knowledge', 'medications', 'ema');
const SELECTABLE_STATUS = new Set(['Authorised']);

type Row = [number, string, string, string, string, string, string, string, string, string, 0 | 1, 0 | 1];
export type EmaRow = {
  num: number;
  name: string;
  active_substance: string;
  inn: string;
  status: string;
  mah: string;
  atc: string;
  pi_url: string;
  pi_updated: string;
  medicine_url: string;
  generic: boolean;
  biosimilar: boolean;
};
type MatchKind = 'name' | 'previous_name' | 'active_substance' | 'inn';
type Index = { manifest: { generated_at: string; counts: Record<string, number> }; byNum: Map<number, EmaRow>; names: Map<string, { num: number; kind: MatchKind }[]> };

export const emaNormalize = (s: string) => s.normalize('NFKC').replace(/[®™]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

let indexPromise: Promise<Index> | null = null;
export function emaIndex(): Promise<Index> {
  if (!indexPromise) {
    indexPromise = (async () => {
      const manifest = JSON.parse(await readFile(path.join(ROOT, 'manifest.json'), 'utf8'));
      const bytes = await readFile(path.join(ROOT, manifest.file));
      if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw new Error('DATA_INTEGRITY_FAILURE');
      const data = JSON.parse(gunzipSync(bytes).toString('utf8')) as { rows: Row[] };
      const byNum = new Map<number, EmaRow>();
      const names = new Map<string, { num: number; kind: MatchKind }[]>();
      const add = (k: string, num: number, kind: MatchKind) => {
        const n = emaNormalize(k);
        if (n.length < 2) return;
        const list = names.get(n) ?? [];
        if (!list.some((x) => x.num === num)) list.push({ num, kind });
        names.set(n, list);
      };
      for (const r of data.rows) {
        const row: EmaRow = { num: r[0], name: r[1], active_substance: r[2], inn: r[3], status: r[4], mah: r[5], atc: r[6], pi_url: r[7], pi_updated: r[8], medicine_url: r[9], generic: r[10] === 1, biosimilar: r[11] === 1 };
        byNum.set(row.num, row);
        const prev = /\(previously\s+([^)]+)\)/i.exec(row.name);
        add(row.name.replace(/\s*\(previously[^)]*\)\s*/gi, ' '), row.num, 'name');
        if (prev) add(prev[1], row.num, 'previous_name');
        add(row.name, row.num, 'name');
        if (row.active_substance) add(row.active_substance, row.num, 'active_substance');
        if (row.inn) add(row.inn, row.num, 'inn');
      }
      return { manifest, byNum, names };
    })().catch((e) => {
      indexPromise = null;
      throw e;
    });
  }
  return indexPromise;
}

export type EmaCandidate = {
  record_id: number;
  ema_number: string;
  name: string;
  active_substance: string;
  inn: string;
  status: string;
  mah: string;
  atc: string;
  generic: boolean;
  biosimilar: boolean;
  match_kind: MatchKind;
  pi_available: boolean;
  pi_updated: string;
  medicine_url: string;
  selectable: boolean;
  noteKa: string | null;
};

export type EmaSearch = {
  query: string;
  total: number;
  candidates: EmaCandidate[];
  messageKa: string;
  index_generated_at: string;
  fuzzy_matching_used: false;
};

const STATUS_KA: Record<string, string> = {
  Withdrawn: 'რეგისტრაცია გაუქმებულია (withdrawn)',
  Refused: 'რეგისტრაციაზე უარი ეთქვა',
  'Application withdrawn': 'განაცხადი გამოთხოვილია',
  Suspended: 'რეგისტრაცია შეჩერებულია',
  Lapsed: 'რეგისტრაციას ვადა გაუვიდა',
  Expired: 'რეგისტრაციას ვადა გაუვიდა',
  Revoked: 'რეგისტრაცია გაუქმებულია',
  Opinion: 'მხოლოდ CHMP-ის დასკვნა, ჯერ არ არის რეგისტრირებული',
};

export const EMA_MSG = {
  found: 'ევროპის წამლების სააგენტოს (EMA) რეესტრში ზუსტი დასახელებით მოიძებნა. აირჩიეთ პროდუქტი და დაადასტურეთ — ევროპული ინსტრუქცია (SmPC) ცალკე გამოჩნდება.',
  notFound: 'EMA-ს ცენტრალიზებულ რეესტრში ზუსტი დასახელებით ვერ მოიძებნა. EMA მოიცავს მხოლოდ ცენტრალიზებულად რეგისტრირებულ პრეპარატებს — ეროვნულად რეგისტრირებული (ხშირად ძველი ან გენერიკული) პრეპარატები აქ არ არის.',
  unavailable: 'ევროპული ინსტრუქცია დროებით ვერ ჩაიტვირთა EMA-ს საიტიდან. სხვა წყაროთი ან მეხსიერებით არ შევავსებთ.',
};

export async function searchEma(query: string, limit = 30): Promise<EmaSearch> {
  const idx = await emaIndex();
  const q = emaNormalize(query);
  const hits = idx.names.get(q) ?? [];
  const rank: Record<MatchKind, number> = { name: 0, previous_name: 1, active_substance: 2, inn: 3 };
  const cands = hits
    .map((h) => ({ h, r: idx.byNum.get(h.num)! }))
    .filter((x) => x.r)
    .map(({ h, r }): EmaCandidate => {
      const selectable = Boolean(r.pi_url) && SELECTABLE_STATUS.has(r.status);
      return {
        record_id: emaRecordId(r.num, 0),
        ema_number: emaNumber(r.num),
        name: r.name,
        active_substance: r.active_substance,
        inn: r.inn,
        status: r.status,
        mah: r.mah,
        atc: r.atc,
        generic: r.generic,
        biosimilar: r.biosimilar,
        match_kind: h.kind,
        pi_available: Boolean(r.pi_url),
        pi_updated: r.pi_updated,
        medicine_url: r.medicine_url,
        selectable,
        noteKa: selectable ? null : r.status !== 'Authorised' ? `${STATUS_KA[r.status] ?? r.status} — ინსტრუქცია არ გამოიყენება.` : 'პროდუქტის ინფორმაციის დოკუმენტი EMA-ს ფაილში არ არის — ინსტრუქცია არ გამოიყენება.',
      };
    })
    .sort((a, b) => Number(b.selectable) - Number(a.selectable) || rank[a.match_kind] - rank[b.match_kind] || a.name.localeCompare(b.name));
  return {
    query,
    total: cands.length,
    candidates: cands.slice(0, limit),
    messageKa: cands.length ? EMA_MSG.found : EMA_MSG.notFound,
    index_generated_at: idx.manifest.generated_at,
    fuzzy_matching_used: false,
  };
}

/* ── transport: fixed host, PDF only, capped, rate-limited, coalesced, cached ── */

const HOST = 'www.ema.europa.eu';
const PI_PATH = /^\/en\/documents\/product-information\/[a-z0-9-]+_en\.pdf$/;
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 25_000_000;
const TTL_MS = 30 * 60 * 1000;
const PER_MINUTE = 20;
const PER_DAY = 1500;

type Parsed = { at: number; smpcs: Smpc[]; text_sha256: string };
const parsedCache = new Map<number, Parsed>();
const inflight = new Map<number, Promise<Parsed>>();
let minute = { at: 0, n: 0 };
let day = { key: '', n: 0 };

let transport: (url: URL, init: RequestInit) => Promise<Response> = (url, init) => fetch(url, init);
let pdfText: (bytes: Uint8Array) => Promise<string> = async (bytes) => {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const doc = await getDocumentProxy(bytes, { verbosity: 0 } as Parameters<typeof getDocumentProxy>[1]);
  const { text } = await extractText(doc, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : text;
};
/** Test seams. */
export function setEmaTransport(t: typeof transport | null, textOf?: typeof pdfText) {
  transport = t ?? ((url, init) => fetch(url, init));
  if (textOf) pdfText = textOf;
  resetEmaClient();
}
export function resetEmaClient() {
  parsedCache.clear();
  inflight.clear();
  minute = { at: 0, n: 0 };
  day = { key: '', n: 0 };
}

function take() {
  const now = Date.now();
  if (now - minute.at > 60_000) minute = { at: now, n: 0 };
  const d = new Date().toISOString().slice(0, 10);
  if (day.key !== d) day = { key: d, n: 0 };
  if (minute.n >= PER_MINUTE || day.n >= PER_DAY) throw new Error('EMA_RATE_LIMITED');
  minute.n += 1;
  day.n += 1;
}

async function readPdf(res: Response): Promise<Uint8Array> {
  if (!res.body) throw new Error('EMA_UNAVAILABLE');
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error('EMA_UNAVAILABLE');
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  // EMA's site answers some automated bursts with an HTML "Sorry" page and a
  // 200 status: only a real PDF is accepted.
  if (out.byteLength < 1000 || String.fromCharCode(...out.slice(0, 5)) !== '%PDF-') throw new Error('EMA_UNAVAILABLE');
  return out;
}

async function loadPi(row: EmaRow): Promise<Parsed> {
  const hit = parsedCache.get(row.num);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  let p = inflight.get(row.num);
  if (!p) {
    p = (async () => {
      const url = new URL(row.pi_url);
      if (url.protocol !== 'https:' || url.hostname !== HOST || !PI_PATH.test(url.pathname) || url.search) throw new Error('EMA_HOST_REJECTED');
      if (process.env.DISABLE_LIVE_SOURCES === '1' && transport === defaultTransport) throw new Error('EMA_UNAVAILABLE');
      take();
      let res: Response;
      try {
        res = await transport(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error', headers: { 'user-agent': 'GMAI-LeaderMed/1.0 (medication identity)', accept: 'application/pdf' } });
      } catch {
        throw new Error('EMA_UNAVAILABLE');
      }
      if (res.status === 429) throw new Error('EMA_RATE_LIMITED');
      if (!res.ok) throw new Error('EMA_UNAVAILABLE');
      const bytes = await readPdf(res);
      let text: string;
      try {
        text = cleanText(await pdfText(bytes));
      } catch {
        throw new Error('EMA_PARSE_FAILED');
      }
      if (!/SUMMARY\s+OF\s+PRODUCT\s+CHARACTERISTICS/i.test(text)) throw new Error('EMA_PARSE_FAILED');
      const smpcs = parseSmpcs(text);
      if (!smpcs.length) throw new Error('EMA_PARSE_FAILED');
      const parsed: Parsed = { at: Date.now(), smpcs, text_sha256: sha(text) };
      parsedCache.set(row.num, parsed);
      while (parsedCache.size > 25) parsedCache.delete(parsedCache.keys().next().value as number);
      return parsed;
    })().finally(() => inflight.delete(row.num));
    inflight.set(row.num, p);
  }
  return p;
}
const defaultTransport = transport;

const sha = (v: unknown) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');

/* ── identity ─────────────────────────────────────────────────────────────── */

export type EmaIdentity = ProductIdentity & {
  region: 'EU';
  ema_number: string;
  smpc_index: number;
  smpc_count: number;
  smpc_name: string;
  status: string;
  medicine_url: string;
  pi_url: string;
};

/** The query must still name this medicine exactly (index re-checked on every call). */
async function rowFor(query: string, num: number): Promise<EmaRow> {
  const idx = await emaIndex();
  const row = idx.byNum.get(num);
  const hit = (idx.names.get(emaNormalize(query)) ?? []).some((h) => h.num === num);
  if (!row || !hit) throw new Error('IDENTITY_MISMATCH');
  if (!row.pi_url || !SELECTABLE_STATUS.has(row.status)) throw new Error('EMA_NOT_SELECTABLE');
  return row;
}

function strengthLine(composition: string): string {
  const lines = composition.split('\n').map((s) => s.trim()).filter(Boolean);
  const withUnit = lines.filter((l) => hasStrength(l) && !/excipient|sodium|lactose|sorbitol|alcohol|polysorbate|benzoate|aspartame/i.test(l));
  return (withUnit.length ? withUnit : lines).slice(0, 3).join(' ').slice(0, 300);
}

export function emaIdentity(row: EmaRow, s: Smpc, count: number): EmaIdentity {
  const missing: string[] = [];
  if (!nameMatches(s.name, row.name)) missing.push('დასახელება (SmPC-ის 1-ლ ნაწილში არ ემთხვევა)');
  if (!substancesMatch(s.composition, row.active_substance, row.inn)) missing.push('მოქმედი ნივთიერება (მე-2 ნაწილში ვერ დადასტურდა)');
  if (!hasStrength(s.composition)) missing.push('სიძლიერე და ერთეული');
  if (!s.form) missing.push('სამკურნალწამლო ფორმა');
  if (s.missing.length) missing.push(`ნაწილები ${s.missing.join(', ')}`);
  return {
    record_id: emaRecordId(row.num, s.index),
    source: 'ema',
    source_id: emaNumber(row.num),
    group_id: `${emaNumber(row.num)}#${s.index + 1}`,
    effective: row.pi_updated,
    brand_names: [row.name],
    generic_names: [row.inn || row.active_substance].filter(Boolean),
    ingredients: [{ name: row.active_substance || row.inn, strength: strengthLine(s.composition) }],
    dosage_forms: s.form ? [s.form] : [],
    routes: [],
    manufacturer: row.mah || null,
    product_ndcs: [],
    linked: {
      kind: 'label',
      ids: [row.pi_url],
      verified: missing.length === 0,
      noteKa: `ევროპული ინსტრუქცია (SmPC ${s.index + 1}/${count}) — EMA-ს პროდუქტის ნომრით ${emaNumber(row.num)}; დასახელება, მოქმედი ნივთიერება, სიძლიერე და ფორმა შემოწმებულია ტექსტში.`,
    },
    clinical_text_available: missing.length === 0,
    complete: missing.length === 0,
    missingKa: missing,
    content_sha256_short: sha(s).slice(0, 12),
    region: 'EU',
    ema_number: emaNumber(row.num),
    smpc_index: s.index,
    smpc_count: count,
    smpc_name: s.name,
    status: row.status,
    medicine_url: row.medicine_url,
    pi_url: row.pi_url,
  };
}

/** All SmPCs of one EMA medicine, each with its own checked identity. No clinical text. */
export async function previewEma(query: string, recordId: number): Promise<{ identities: EmaIdentity[]; retrieved_at: string }> {
  if (!isEmaRecord(recordId)) throw new Error('INVALID_RECORD_ID');
  const { num } = decodeEmaRecord(recordId);
  const row = await rowFor(query, num);
  const p = await loadPi(row);
  return { identities: p.smpcs.map((s) => emaIdentity(row, s, p.smpcs.length)), retrieved_at: new Date(p.at).toISOString() };
}

async function smpcFor(query: string, recordId: number) {
  if (!isEmaRecord(recordId)) throw new Error('INVALID_RECORD_ID');
  const { num, smpc } = decodeEmaRecord(recordId);
  const row = await rowFor(query, num);
  const p = await loadPi(row);
  const s = p.smpcs[smpc];
  if (!s) throw new Error('UNKNOWN_RECORD');
  return { row, s, p, identity: emaIdentity(row, s, p.smpcs.length), content_sha256: sha(s) };
}

const qKey = (q: string) => `ema:${emaNormalize(q)}`;

export async function confirmEma(session: string, query: string, recordId: number) {
  const x = await smpcFor(query, recordId);
  if (!x.identity.complete) {
    const { IdentityError } = await import('./identity');
    throw new IdentityError('IDENTITY_INCOMPLETE', `პროდუქტი ვერ დადასტურდება — ევროპულ ინსტრუქციაში ვერ შემოწმდა: ${x.identity.missingKa.join(', ')}.`);
  }
  const { token, expires_at } = issueReceipt({ record_id: recordId, query_normalized: qKey(query), content_sha256: x.content_sha256, session, identity: { linked_sha256: sha(x.row.pi_url) } });
  return { token, expires_at, identity: x.identity };
}

/** SmPC section → the label keys the rest of the app already reads. */
const KEYMAP: [SmpcSectionKey, string][] = [
  ['4.1', 'indications_and_usage'],
  ['4.2', 'dosage_and_administration'],
  ['4.3', 'contraindications'],
  ['4.4', 'warnings_and_cautions'],
  ['4.5', 'drug_interactions'],
  ['4.6', 'pregnancy'],
  ['4.7', 'effects_on_driving'],
  ['4.8', 'adverse_reactions'],
  ['4.9', 'overdosage'],
];

export function smpcAsLabel(s: Smpc, row: Pick<EmaRow, 'name' | 'inn' | 'active_substance' | 'mah'>): Record<string, unknown> {
  const label: Record<string, unknown> = {
    _region: 'EU',
    openfda: { brand_name: [row.name], generic_name: [row.inn || row.active_substance].filter(Boolean), manufacturer_name: row.mah ? [row.mah] : [] },
    dosage_forms_and_strengths: [`${s.name}\n\n${s.composition}\n\n${s.form}`],
  };
  for (const [k, key] of KEYMAP) if (s.sections[k]) label[key] = [s.sections[k]!];
  return label;
}

export async function emaConfirmedContext(session: string | null, token: unknown, query: string, recordId: number): Promise<ConfirmedContext> {
  const r = resolveReceipt(token, session);
  if (!r || r.record_id !== recordId || r.query_normalized !== qKey(query) || !(r.expires_at > Date.now())) throw new Error('PRODUCT_CONFIRMATION_REQUIRED');
  const x = await smpcFor(query, recordId);
  if ((r.identity as { linked_sha256?: string }).linked_sha256 !== sha(x.row.pi_url) || r.content_sha256 !== x.content_sha256) throw new Error('SOURCE_CHANGED_RECONFIRM');
  if (!x.identity.complete) throw new Error('IDENTITY_INCOMPLETE');
  return {
    identity: x.identity,
    record_id: recordId,
    query,
    source: 'ema',
    retrieved_at: new Date(x.p.at).toISOString(),
    label: smpcAsLabel(x.s, x.row),
    content_sha256: x.content_sha256,
    identity_confirmed: true,
    clinical_validation_performed: false,
    executable_prescription: false,
    allow_instruction_generation: false,
  };
}

export async function emaCounts() {
  const idx = await emaIndex();
  return idx.manifest.counts;
}
