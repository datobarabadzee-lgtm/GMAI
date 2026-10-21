import 'server-only';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MedicationStore, type FetchedCandidate, type MisEntry, type StoreRecord } from '../../../knowledge/medications/store.mjs';
import { fdaFetch, fdaJson, fdaKeyConfigured } from './fda-client';
import { issueReceipt, resolveReceipt, type Receipt } from './receipts';
import { fuzzyInn } from '@/services/drug-naming';
import { confirmEma, emaConfirmedContext, isEmaRecord } from './ema';

/**
 * MEDICATION IDENTITY SERVICE — the single gate between a typed drug name and
 * any drug instruction, dose or label text in this application.
 *
 *   name → exact catalog lookup (no fuzzy, no transliteration, no embeddings)
 *        → candidate products (paged)
 *        → product preview: identity fields fetched by the record's own source
 *          ID and checked (ID, group/set_id, name, ingredient/salt, strength,
 *          form, route; linked NDC↔label only through explicit spl_set_id)
 *        → confirmation by the user, stored server-side (receipts.ts)
 *        → context: the confirmed source, re-fetched and re-verified (ID,
 *          group, name, content hash) on every use.
 *
 * Similar-looking names are returned only as separately-labelled search
 * suggestions; selecting one runs a new exact search, nothing else.
 * Identity confirmation is not a clinical approval: allow_instruction_generation
 * stays false and no prescribing is automated from this service.
 */

export const MED_ROOT = path.join(process.cwd(), 'knowledge', 'medications');

let storePromise: Promise<MedicationStore> | null = null;
export function getStore(): Promise<MedicationStore> {
  if (!storePromise) {
    storePromise = new MedicationStore({ root: MED_ROOT, fetchImpl: (u, i) => fdaFetch(u, i) }).init().catch((e) => {
      storePromise = null;
      throw e;
    });
  }
  return storePromise;
}
/** Test seam. */
export function resetStore() {
  storePromise = null;
}

const SELECTABLE = new Set(['brand_name', 'generic_name']);
const KIND_RANK: Record<string, number> = { brand_name: 0, generic_name: 1, substance_name: 2 };

export type SearchStatus = 'product_selection_required' | 'ingredient_name_only' | 'catalog_name_only' | 'curated_mapping' | 'curator_rejected' | 'unknown_name';

export type CandidateCard = {
  record_id: number;
  source: 'label' | 'ndc';
  source_id: string;
  group_id: string;
  effective: string;
  matched_name: string;
  name_type: string;
  selectable: boolean;
};

export type SearchResult = {
  query: string;
  status: SearchStatus;
  messageKa: string;
  total: number;
  selectableTotal: number;
  offset: number;
  limit: number;
  candidates: CandidateCard[];
  catalog: Pick<MisEntry, 'id' | 'kind' | 'name_ka' | 'name_en' | 'source_url' | 'identity_status'>[];
  /** Unverified, clearly separate. Choosing one only starts a new exact search. */
  suggestions: { name: string; noteKa: string }[];
  /** The exact FDA name the candidates belong to (differs from query only for a curator-approved mapping). */
  effectiveQuery: string;
  curated: { mis_id: string; name_ka: string; target_query: string | null; decision: 'approved' | 'rejected'; approved_by: string; approved_at: string; note?: string } | null;
  fuzzy_matching_used: false;
  allow_instruction_generation: false;
};

export const MSG = {
  catalogOnly: 'დასახელება კატალოგში მოიძებნა; დადასტურებული ინსტრუქცია ჯერ არ არის დაკავშირებული.',
  unknown:
    'ეს დასახელება ზუსტად ვერ მოიძებნა. ჩაწერეთ ზუსტი ლათინური სახელი, მოქმედი ნივთიერება, ფორმა და სიძლიერე ან შეფუთვაზე მოცემული მონაცემები. სხვა წამლით არ ჩავანაცვლებთ.',
  ingredientOnly:
    'ეს არის მოქმედი ნივთიერების სახელი. ინსტრუქციის სანახავად მოძებნეთ პროდუქტის ზუსტი სავაჭრო ან გენერიკული დასახელება.',
  choose: 'იპოვა რამდენიმე პროდუქტი — აირჩიეთ ზუსტი პროდუქტი (ფორმა, სიძლიერე, გზა) და დაადასტურეთ.',
  curated: 'ქართული დასახელების კავშირი FDA-ს დასახელებასთან დაადასტურა კურატორმა. მაინც აირჩიეთ ზუსტი პროდუქტი (ფორმა, სიძლიერე, გზა) და დაადასტურეთ.',
  curatorRejected: 'კურატორმა შეამოწმა: FDA-ში ამ დასახელების ეკვივალენტური პროდუქტი არ არის დაკავშირებული. ინსტრუქცია და დოზა არ გამოჩნდება.',
  unavailable: 'ინსტრუქცია დროებით მიუწვდომელია (FDA-ს წყარო ვერ ჩაიტვირთა). სხვა წყაროთი ან მეხსიერებით არ შევავსებთ.',
};

export function validQuery(q: unknown): q is string {
  return typeof q === 'string' && q.trim().length >= 2 && q.length <= 200;
}

async function listCandidates(query: string, offset: number, limit: number) {
  const store = await getStore();
  const m = await store.matches(query);
  const byId = new Map<number, [number, string, string]>();
  for (const row of m.f) {
    const prev = byId.get(row[0]);
    if (!prev || (KIND_RANK[row[1]] ?? 9) < (KIND_RANK[prev[1]] ?? 9)) byId.set(row[0], row);
  }
  const rows = [...byId.values()].sort((a, b) => Number(SELECTABLE.has(b[1])) - Number(SELECTABLE.has(a[1])) || (KIND_RANK[a[1]] ?? 9) - (KIND_RANK[b[1]] ?? 9) || a[0] - b[0]);
  const selectableTotal = rows.filter((r) => SELECTABLE.has(r[1])).length;
  const candidates: CandidateCard[] = await Promise.all(
    rows.slice(offset, offset + limit).map(async ([id, kind, display]) => {
      const r = await store.record(id);
      return { record_id: id, source: r.source, source_id: r.external_id, group_id: r.group_id, effective: r.snapshot_effective_time, matched_name: display, name_type: kind, selectable: SELECTABLE.has(kind) };
    }),
  );
  return { total: rows.length, selectableTotal, candidates };
}

export async function searchMedication(query: string, { offset = 0, limit = 20 } = {}): Promise<SearchResult> {
  const store = await getStore();
  const base = await store.lookup(query, { offset: 0, limit: 1 });
  const catalog = base.mis_catalog.filter(Boolean).map((e) => ({ id: e.id, kind: e.kind, name_ka: e.name_ka, name_en: e.name_en, source_url: e.source_url, identity_status: e.identity_status }));
  let effectiveQuery = query;
  let curated: SearchResult['curated'] = null;
  let list = await listCandidates(query, offset, limit);
  let status: SearchStatus = base.status;
  if (status === 'product_selection_required' && list.selectableTotal === 0) status = 'ingredient_name_only';

  // A Georgian catalog name with no FDA match of its own: a curator decision,
  // if any, says which exact FDA name to search — or that there is none.
  if (status === 'catalog_name_only' && catalog.length) {
    const { curatedFor } = await import('./curation');
    const d = await curatedFor(catalog.map((c) => c.id));
    if (d) {
      curated = { mis_id: d.mis_id, name_ka: d.name_ka, target_query: d.target_query ?? null, decision: d.decision, approved_by: d.approved_by, approved_at: d.approved_at, note: d.note };
      if (d.decision === 'approved' && d.target_query) {
        effectiveQuery = d.target_query;
        list = await listCandidates(d.target_query, offset, limit);
        status = list.selectableTotal ? 'curated_mapping' : 'catalog_name_only';
      } else status = 'curator_rejected';
    }
  }

  const suggestions: SearchResult['suggestions'] = [];
  if (status === 'unknown_name') {
    const f = fuzzyInn(query);
    if (f) suggestions.push({ name: f.matched, noteKa: 'მსგავსი დასახელება — შეიძლება სხვა პრეპარატი იყოს. არჩევა მხოლოდ ახალ ზუსტ ძიებას დაიწყებს.' });
  }
  const messageKa = {
    unknown_name: MSG.unknown,
    catalog_name_only: MSG.catalogOnly,
    ingredient_name_only: MSG.ingredientOnly,
    product_selection_required: MSG.choose,
    curated_mapping: MSG.curated,
    curator_rejected: MSG.curatorRejected,
  }[status];
  return {
    query,
    status,
    messageKa,
    total: list.total,
    selectableTotal: list.selectableTotal,
    offset,
    limit,
    candidates: status === 'curator_rejected' || status === 'catalog_name_only' ? [] : list.candidates,
    catalog,
    suggestions,
    effectiveQuery,
    curated,
    fuzzy_matching_used: false,
    allow_instruction_generation: false,
  };
}

/* ── identity fields ─────────────────────────────────────────────────────── */

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : []);
const up = (s: string) => s.trim().toUpperCase();

export type ProductIdentity = {
  record_id: number;
  /** label / ndc: openFDA (US). ema: EU SmPC from EMA (see ema.ts). */
  source: 'label' | 'ndc' | 'ema';
  source_id: string;
  group_id: string;
  effective: string;
  brand_names: string[];
  generic_names: string[];
  /** Ingredient (with salt, as written by the source) and strength with unit. */
  ingredients: { name: string; strength: string }[];
  dosage_forms: string[];
  routes: string[];
  manufacturer: string | null;
  product_ndcs: string[];
  /** For a label: the NDC products linked by spl_set_id. For an NDC: the linked label. */
  linked: { kind: 'ndc' | 'label'; ids: string[]; verified: boolean; noteKa: string };
  clinical_text_available: boolean;
  complete: boolean;
  missingKa: string[];
  content_sha256_short: string;
};

type Preview = { identity: ProductIdentity; candidate: FetchedCandidate; label: Record<string, unknown> | null; linked_sha256: string | null };

const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

async function linkedNdcForLabel(setId: string) {
  const data = await fdaJson('ndc', `openfda.spl_set_id:"${setId}"`, 20);
  const results = (data.results ?? []).filter((r) => arr((r.openfda as Record<string, unknown> | undefined)?.spl_set_id).includes(setId));
  // Every returned product must carry this set_id; anything else is discarded.
  return results;
}

async function linkedLabelForNdc(setId: string) {
  const data = await fdaJson('label', `set_id:"${setId}"`, 3);
  const results = data.results ?? [];
  if (results.length !== 1 || results[0].set_id !== setId) return null;
  return results[0];
}

function ingredientsOf(ndc: Record<string, unknown>): { name: string; strength: string }[] {
  const ai = Array.isArray(ndc.active_ingredients) ? (ndc.active_ingredients as Record<string, unknown>[]) : [];
  return ai.map((a) => ({ name: typeof a.name === 'string' ? a.name : '', strength: typeof a.strength === 'string' ? a.strength : '' }));
}

export async function previewProduct(query: string, recordId: number): Promise<Preview> {
  const store = await getStore();
  const candidate = await store.fetchCandidate(query, recordId);
  const src = candidate.source;
  const meta = candidate.meta;
  const missing: string[] = [];
  let identity: ProductIdentity;
  let label: Record<string, unknown> | null = null;
  let linked_sha256: string | null = null;

  if (meta.source === 'label') {
    const of = (src.openfda ?? {}) as Record<string, unknown>;
    label = src;
    const ndcs = await linkedNdcForLabel(meta.group_id);
    linked_sha256 = sha(ndcs.map((n) => n.product_id).sort());
    const substances = arr(of.substance_name).map(up);
    // Linked NDC ingredients must be among the label's own substances.
    const consistent = ndcs.filter((n) => ingredientsOf(n).every((i) => i.name && (substances.length === 0 || substances.includes(up(i.name)))));
    const ingredients = dedupe(consistent.flatMap(ingredientsOf).filter((i) => i.name && i.strength), (i) => `${up(i.name)}|${i.strength}`);
    const forms = [...new Set(consistent.map((n) => String(n.dosage_form ?? '')).filter(Boolean))];
    const routes = [...new Set([...arr(of.route), ...consistent.flatMap((n) => arr(n.route))].map(up))];
    identity = {
      record_id: recordId,
      source: 'label',
      source_id: meta.external_id,
      group_id: meta.group_id,
      effective: String(src.effective_time ?? meta.snapshot_effective_time),
      brand_names: arr(of.brand_name),
      generic_names: arr(of.generic_name),
      ingredients,
      dosage_forms: forms,
      routes,
      manufacturer: arr(of.manufacturer_name)[0] ?? null,
      product_ndcs: consistent.map((n) => String(n.product_ndc ?? '')).filter(Boolean),
      linked: {
        kind: 'ndc',
        ids: consistent.map((n) => String(n.product_id ?? '')),
        verified: consistent.length > 0 && consistent.length === ndcs.length,
        noteKa: !ndcs.length
          ? 'ამ ინსტრუქციის პროდუქტის (NDC) ჩანაწერი spl_set_id-ით ვერ მოიძებნა — ფორმა და სიძლიერე ვერ დადასტურდა.'
          : consistent.length !== ndcs.length
            ? 'დაკავშირებული პროდუქტის ზოგი ინგრედიენტი ინსტრუქციის ნივთიერებას არ ემთხვევა — ეს პროდუქტები გამოტოვებულია.'
            : `${consistent.length} პროდუქტი დაკავშირებულია spl_set_id-ით და შემოწმებულია.`,
      },
      clinical_text_available: true,
      complete: false,
      missingKa: [],
      content_sha256_short: candidate.content_sha256.slice(0, 12),
    };
  } else {
    const ofn = (src.openfda ?? {}) as Record<string, unknown>;
    const setId = arr(ofn.spl_set_id)[0] ?? null;
    let linkOk = false;
    let note = 'NDC ჩანაწერი სრული ინსტრუქცია არ არის.';
    if (setId) {
      const l = await linkedLabelForNdc(setId);
      if (l) {
        const lof = (l.openfda ?? {}) as Record<string, unknown>;
        const subs = arr(lof.substance_name).map(up);
        const ingOk = ingredientsOf(src).every((i) => subs.includes(up(i.name)));
        const routeOk = arr(src.route).some((r) => arr(lof.route).map(up).includes(up(r)));
        if (ingOk && routeOk) {
          label = l;
          linked_sha256 = sha(l);
          linkOk = true;
          note = 'ინსტრუქცია დაკავშირებულია წყაროს spl_set_id-ით; ინგრედიენტი და გზა ემთხვევა.';
        } else note = 'spl_set_id-ით ნაპოვნი ინსტრუქციის ინგრედიენტი ან გზა ამ პროდუქტს არ ემთხვევა — ინსტრუქცია არ გამოიყენება.';
      } else note = 'spl_set_id-ით ცალსახა ინსტრუქცია ვერ მოიძებნა — ინსტრუქცია არ გამოიყენება.';
    } else note = 'NDC ჩანაწერს spl_set_id არ აქვს — ინსტრუქცია ვერ დაკავშირდება.';
    identity = {
      record_id: recordId,
      source: 'ndc',
      source_id: meta.external_id,
      group_id: meta.group_id,
      effective: meta.snapshot_effective_time,
      brand_names: arr(src.brand_name),
      generic_names: arr(src.generic_name),
      ingredients: ingredientsOf(src).filter((i) => i.name),
      dosage_forms: arr(src.dosage_form),
      routes: arr(src.route).map(up),
      manufacturer: typeof src.labeler_name === 'string' ? src.labeler_name : null,
      product_ndcs: arr(src.product_ndc),
      linked: { kind: 'label', ids: label ? [String(label.id ?? '')] : [], verified: linkOk, noteKa: note },
      clinical_text_available: linkOk,
      complete: false,
      missingKa: [],
      content_sha256_short: candidate.content_sha256.slice(0, 12),
    };
  }

  if (!identity.brand_names.length && !identity.generic_names.length) missing.push('დასახელება');
  if (!identity.ingredients.length) missing.push('მოქმედი ნივთიერება / მარილი');
  if (!identity.ingredients.length || identity.ingredients.some((i) => !/\d/.test(i.strength))) missing.push('სიძლიერე და ერთეული');
  if (!identity.dosage_forms.length) missing.push('სამკურნალწამლო ფორმა');
  if (!identity.routes.length) missing.push('შეყვანის გზა');
  identity.missingKa = [...new Set(missing)];
  identity.complete = identity.missingKa.length === 0;
  return { identity, candidate, label, linked_sha256 };
}

function dedupe<T>(xs: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(key(x)) ? false : (seen.add(key(x)), true)));
}

/* ── confirmation and confirmed context ──────────────────────────────────── */

export class IdentityError extends Error {
  constructor(public code: string, public messageKa: string) {
    super(code);
  }
}

export async function confirmProduct(session: string, query: string, recordId: number) {
  if (isEmaRecord(recordId)) return confirmEma(session, query, recordId);
  const store = await getStore();
  const p = await previewProduct(query, recordId);
  if (!p.identity.complete) throw new IdentityError('IDENTITY_INCOMPLETE', `პროდუქტი ვერ დადასტურდება — წყაროში აკლია: ${p.identity.missingKa.join(', ')}.`);
  const { token, expires_at } = issueReceipt({
    record_id: recordId,
    query_normalized: store.normalize(query),
    content_sha256: p.candidate.content_sha256,
    session,
    identity: { ...p.identity, linked_sha256: p.linked_sha256 },
  });
  return { token, expires_at, identity: p.identity };
}

export type ConfirmedContext = {
  identity: ProductIdentity;
  record_id: number;
  query: string;
  source: 'label' | 'ndc' | 'ema';
  retrieved_at: string;
  label: Record<string, unknown> | null;
  content_sha256: string;
  identity_confirmed: true;
  clinical_validation_performed: false;
  executable_prescription: false;
  allow_instruction_generation: false;
};

/**
 * The only function that hands label text to anything else in the app.
 * The package runtime re-checks the receipt (record, query, expiry), re-fetches
 * the source by its ID and compares the content hash; the linked record is
 * re-fetched and compared as well.
 */
export async function confirmedContext(session: string | null, token: unknown, query: string, recordId: number): Promise<ConfirmedContext> {
  if (isEmaRecord(recordId)) return emaConfirmedContext(session, token, query, recordId);
  const store = await getStore();
  let receipt: Receipt | null = null;
  const scoped = Object.create(store) as MedicationStore;
  scoped.resolveConfirmation = async (t: unknown) => {
    receipt = resolveReceipt(t, session);
    return receipt;
  };
  const ctx = await scoped.context(query, recordId, token);
  const p = await previewProduct(query, recordId);
  const r = receipt as Receipt | null;
  if (!r || (r.identity as { linked_sha256?: string | null }).linked_sha256 !== p.linked_sha256) throw new Error('SOURCE_CHANGED_RECONFIRM');
  if (!p.identity.complete) throw new Error('IDENTITY_INCOMPLETE');
  return {
    identity: p.identity,
    record_id: recordId,
    query,
    source: ctx.meta.source,
    retrieved_at: ctx.retrieved_at,
    label: p.label,
    content_sha256: ctx.content_sha256,
    identity_confirmed: true,
    clinical_validation_performed: false,
    executable_prescription: false,
    allow_instruction_generation: false,
  };
}

/* ── label sections, paged ───────────────────────────────────────────────── */

export const SECTION_KA: Record<string, string> = {
  boxed_warning: 'ჩარჩოში ჩასმული გაფრთხილება',
  indications_and_usage: 'ჩვენებები',
  dosage_and_administration: 'დოზირება და მიღება',
  dosage_forms_and_strengths: 'ფორმები და სიძლიერე',
  contraindications: 'უკუჩვენებები',
  warnings_and_cautions: 'გაფრთხილებები და სიფრთხილე',
  warnings: 'გაფრთხილებები',
  precautions: 'სიფრთხილის ზომები',
  drug_interactions: 'წამალთაშორისი ურთიერთქმედება',
  use_in_specific_populations: 'განსაკუთრებული ჯგუფები',
  pregnancy: 'ორსულობა',
  effects_on_driving: 'გავლენა მართვის უნარზე',
  pediatric_use: 'ბავშვები',
  geriatric_use: 'ხანდაზმულები',
  renal_impairment: 'თირკმლის უკმარისობა',
  hepatic_impairment: 'ღვიძლის უკმარისობა',
  adverse_reactions: 'არასასურველი რეაქციები',
  overdosage: 'ჭარბი დოზა',
  mechanism_of_action: 'მოქმედების მექანიზმი',
  clinical_pharmacology: 'კლინიკური ფარმაკოლოგია',
  description: 'აღწერა',
  how_supplied: 'როგორ მიეწოდება',
  information_for_patients: 'ინფორმაცია პაციენტისთვის',
};
const ORDER = Object.keys(SECTION_KA);
export const MAX_RESPONSE_BYTES = 250_000;

export function labelSections(label: Record<string, unknown> | null, only?: string, start = 0) {
  if (!label) return { index: [] as { key: string; titleKa: string; chars: number }[], sections: [] as { key: string; titleKa: string; text: string; truncated: boolean }[] };
  const text = (k: string) => {
    const v = label[k];
    return Array.isArray(v) && typeof v[0] === 'string' ? v.map(String).join('\n\n').replace(/[ \t]+/g, ' ').trim() : '';
  };
  const index = ORDER.filter((k) => text(k)).map((k) => ({ key: k, titleKa: SECTION_KA[k], chars: text(k).length }));
  const sections: { key: string; titleKa: string; text: string; truncated: boolean }[] = [];
  let used = 0;
  for (const s of index) {
    if (only && s.key !== only) continue;
    const t = only ? text(s.key).slice(Math.max(0, start)) : text(s.key);
    const room = MAX_RESPONSE_BYTES - used - 2000;
    if (room <= 0) break;
    // Byte budget: Latin text is ~1 byte per char; cap per section as well.
    const slice = t.length > Math.min(room, 60_000) ? t.slice(0, Math.min(room, 60_000)) : t;
    sections.push({ key: s.key, titleKa: s.titleKa, text: slice, truncated: slice.length < t.length });
    used += slice.length;
  }
  return { index, sections };
}

export const fdaKeyStatus = () => (fdaKeyConfigured() ? 'configured' : 'missing');

export type { StoreRecord };

/* ── card enrichment: identity fields for one page of candidates ─────────── */

export type CardIdentity = {
  record_id: number;
  verified: boolean;
  noteKa?: string;
  brand_names: string[];
  generic_names: string[];
  manufacturer: string | null;
  routes: string[];
  dosage_form: string | null;
  ingredients: { name: string; strength: string }[];
  product_summary: string | null;
};

/**
 * One batched request per source type for up to 6 records. Every returned
 * document must carry a requested ID, the record's own group (set_id for
 * labels) and the searched name — otherwise the card stays unverified.
 * Only identity fields leave the server; no label text, no dose.
 */
export async function enrichCards(query: string, ids: number[]): Promise<CardIdentity[]> {
  const store = await getStore();
  const q = store.normalize(query);
  const metas = await Promise.all(ids.slice(0, 6).map((id) => store.record(id)));
  const sel = await store.matches(query);
  const allowed = new Set(sel.f.filter(([, k]) => SELECTABLE.has(k)).map(([id]) => id));
  const labels = metas.filter((m) => m.source === 'label' && allowed.has(m.record_id));
  const ndcs = metas.filter((m) => m.source === 'ndc' && allowed.has(m.record_id));
  const idOk = (s: string) => /^[A-Za-z0-9_-]+$/.test(s);
  const [lres, nres] = await Promise.all([
    labels.length ? fdaJson('label', labels.filter((m) => idOk(m.external_id)).map((m) => `id:"${m.external_id}"`).join(' '), labels.length) : Promise.resolve({ results: [] }),
    ndcs.length ? fdaJson('ndc', ndcs.filter((m) => idOk(m.external_id)).map((m) => `product_id:"${m.external_id}"`).join(' '), ndcs.length) : Promise.resolve({ results: [] }),
  ]);
  const names = (o: Record<string, unknown> | undefined) => [...arr(o?.brand_name), ...arr(o?.generic_name)].map((n) => store.normalize(n));
  return metas.map((m) => {
    const base: CardIdentity = { record_id: m.record_id, verified: false, brand_names: [], generic_names: [], manufacturer: null, routes: [], dosage_form: null, ingredients: [], product_summary: null };
    if (!allowed.has(m.record_id)) return { ...base, noteKa: 'მხოლოდ ნივთიერების სახელით ემთხვევა — პროდუქტად ვერ აირჩევა.' };
    if (m.source === 'label') {
      const doc = (lres.results ?? []).find((r) => r.id === m.external_id);
      if (!doc) return { ...base, noteKa: 'წყარომ ეს ჩანაწერი არ დააბრუნა.' };
      const of = (doc.openfda ?? {}) as Record<string, unknown>;
      if (doc.set_id !== m.group_id || !names(of).includes(q)) return { ...base, noteKa: 'წყაროს ჯგუფი ან დასახელება შეიცვალა — გადამოწმება საჭიროა.' };
      const pde = arr(doc.spl_product_data_elements)[0] ?? '';
      return { ...base, verified: true, brand_names: arr(of.brand_name), generic_names: arr(of.generic_name), manufacturer: arr(of.manufacturer_name)[0] ?? null, routes: arr(of.route), product_summary: pde ? pde.slice(0, 180) : null };
    }
    const doc = (nres.results ?? []).find((r) => r.product_id === m.external_id);
    if (!doc) return { ...base, noteKa: 'წყარომ ეს ჩანაწერი არ დააბრუნა.' };
    if (!names(doc).includes(q)) return { ...base, noteKa: 'წყაროში დასახელება შეიცვალა — გადამოწმება საჭიროა.' };
    return { ...base, verified: true, brand_names: arr(doc.brand_name), generic_names: arr(doc.generic_name), manufacturer: typeof doc.labeler_name === 'string' ? doc.labeler_name : null, routes: arr(doc.route), dosage_form: typeof doc.dosage_form === 'string' ? doc.dosage_form : null, ingredients: ingredientsOf(doc) };
  });
}
