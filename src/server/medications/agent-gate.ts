import 'server-only';
import { findDrug, brandOnlyMatch } from '@/knowledge/drugs';
import { resolveDrugName } from '@/services/drug-naming';
import { confirmedContext, getStore, MSG, type ConfirmedContext, type SearchStatus } from './identity';
import { curatedFor } from './curation';
import { emaIndex, emaNormalize } from './ema';

/**
 * MEDICATION GATE FOR AGENTS
 *
 * Built once per request by the orchestrator, server-side, before any agent
 * runs. Agents never resolve a drug name themselves: they read this gate.
 *
 *   substance_exact — the user typed a substance (INN / Georgian INN) exactly;
 *                     curated substance-level rules may run, labelled as such.
 *   product_confirmed — a product the user confirmed on the server; its own
 *                     label may be used (receipt + re-verified source).
 *   brand / catalog / candidates / unknown — no dose, no indication, no label
 *                     text; the agent reports what is needed and links to the
 *                     product selection page.
 *
 * The confirmation comes from the request's httpOnly session cookie and a
 * server-issued token; anything a client or the model puts in the body as
 * "confirmed" is ignored.
 */

export type MentionKind = 'substance_exact' | 'brand_curated' | 'curator_approved' | 'catalog_only' | 'product_candidates' | 'ingredient_only' | 'unknown';

export type Mention = {
  input: string;
  kind: MentionKind;
  /** Substance for substance_exact; for brand_curated only an UNVERIFIED hint, never used for dosing. */
  substance: string | null;
  status: SearchStatus | null;
  catalog: { name_ka: string; name_en: string; source_url: string }[];
  selectableTotal: number;
  /** Exact matches in EMA's register (EU, centrally authorised); a separate source. */
  emaTotal: number;
  href: string;
  noteKa: string;
};

export type ConfirmedProduct = ConfirmedContext & { token: string };

export type MedicationGate = {
  mentions: Mention[];
  /** The first confirmed product (kept for callers that read one). */
  confirmed: ConfirmedProduct | null;
  /** Up to two confirmed products — at most one US (openFDA) and one EU (EMA). Never merged. */
  confirmedAll: ConfirmedProduct[];
  confirmError: string | null;
};

export const EMPTY_GATE: MedicationGate = { mentions: [], confirmed: null, confirmedAll: [], confirmError: null };

const region = (c: ConfirmedContext) => (c.source === 'ema' ? 'EU' : 'US');

async function emaHits(name: string): Promise<number> {
  const idx = await emaIndex().catch(() => null);
  return idx?.names.get(emaNormalize(name))?.length ?? 0;
}

const STOP = new Set(['პაციენტი', 'პაციენტს', 'დოზირება', 'დოზირების', 'დოზით', 'დოზა', 'დოზის', 'შეიძლება', 'მივიღო', 'ვიღებ', 'იღებს', 'წამალი', 'წამლის', 'პრეპარატი', 'ინსტრუქცია', 'ბავშვს', 'ბავშვი', 'წლის', 'თვის', 'დღეში', 'ორჯერ', 'ერთხელ', 'რამდენი', 'რამდენჯერ', 'როგორ', 'რატომ', 'რისთვის', 'ფორმა', 'ფორმის', 'tablet', 'tablets', 'dose', 'dosing', 'what', 'which', 'with', 'from']);
const WORD = /[\p{L}][\p{L}\p{N}-]{3,}/gu;

/** Georgian nominative from a case form: deterministic suffix rules, no similarity. */
function nominatives(w: string): string[] {
  const out = [w];
  if (!/[ა-ჿ]/.test(w)) return out;
  for (const suf of ['ისთვის', 'ისგან', 'იდან', 'ისა', 'ის', 'ით', 'ად', 'ზე', 'ში', 'მა', 'ს']) {
    if (w.length > suf.length + 3 && w.endsWith(suf)) {
      const stem = w.slice(0, -suf.length);
      out.push(stem.endsWith('ი') ? stem : `${stem}ი`, stem);
    }
  }
  return [...new Set(out)];
}

export async function buildMedicationGate(input: {
  text: string;
  explicit?: string;
  medicationNames?: string[];
  session: string | null;
  confirmation?: unknown;
}): Promise<MedicationGate> {
  const gate: MedicationGate = { mentions: [], confirmed: null, confirmedAll: [], confirmError: null };

  // 1. Confirmed products, if the client sent tokens (one, or a US + an EU
  // product). Each is verified here; at most one per region is kept.
  const confs = (Array.isArray(input.confirmation) ? input.confirmation : input.confirmation ? [input.confirmation] : []).slice(0, 2) as { token?: unknown; query?: unknown; recordId?: unknown }[];
  for (const conf of confs) {
    if (!conf || typeof conf.token !== 'string' || typeof conf.query !== 'string' || !Number.isSafeInteger(conf.recordId)) continue;
    try {
      const ctx = await confirmedContext(input.session, conf.token, conf.query, conf.recordId as number);
      if (!gate.confirmedAll.some((c) => region(c) === region(ctx))) gate.confirmedAll.push({ ...ctx, token: conf.token });
    } catch (e) {
      gate.confirmError = e instanceof Error ? e.message : 'PRODUCT_CONFIRMATION_REQUIRED';
    }
  }
  gate.confirmed = gate.confirmedAll[0] ?? null;

  // 2. Names in the request, each classified without any similarity matching.
  const names: string[] = [];
  const push = (n: string) => {
    const t = n.trim();
    if (t && !names.some((x) => x.toLowerCase() === t.toLowerCase())) names.push(t);
  };
  if (input.explicit) push(input.explicit);
  for (const m of input.medicationNames ?? []) push(m.split(/\d/)[0]);
  const words = (input.text.match(WORD) ?? []).filter((w) => !STOP.has(w.toLowerCase()));
  const store = await getStore().catch(() => null);
  for (const w of words.slice(0, 40)) {
    for (const form of nominatives(w.toLowerCase())) {
      const r = resolveDrugName(form);
      if (r.via === 'exact' || r.via === 'brand' || findDrug(form) || brandOnlyMatch(form)) {
        push(w);
        break;
      }
    }
  }
  // Catalog names not in the app's dictionaries (e.g. a Georgian trade name):
  // exact catalog lookup of the longer words, nominative forms included.
  if (store) {
    for (const w of words.filter((x) => x.length >= 6).slice(0, 14)) {
      if (names.some((n) => n.toLowerCase() === w.toLowerCase())) continue;
      for (const form of nominatives(w.toLowerCase())) {
        const m = await store.matches(form).catch(() => ({ f: [], m: [] }));
        if (m.f.length || m.m.length || (await emaHits(form))) {
          push(form);
          break;
        }
      }
    }
  }

  for (const name of names.slice(0, 6)) gate.mentions.push(await classify(name, store));
  return gate;
}

async function classify(name: string, store: Awaited<ReturnType<typeof getStore>> | null): Promise<Mention> {
  const href = `/medications?q=${encodeURIComponent(name)}`;
  const forms = nominatives(name.toLowerCase());
  let emaTotal = 0;
  for (const f of forms) if ((emaTotal = await emaHits(f))) break;
  const curated = forms.map((f) => findDrug(f)).find(Boolean);
  if (curated) {
    return { input: name, kind: 'substance_exact', substance: curated.generic_name.toLowerCase(), status: null, catalog: [], selectableTotal: 0, emaTotal, href, noteKa: `მოქმედი ნივთიერება ზუსტად დასახელებულია (${curated.generic_name}); კონკრეტული პროდუქტი — ფორმა, სიძლიერე, მწარმოებელი — დადასტურებული არ არის.` };
  }
  const resolved = forms.map((f) => resolveDrugName(f)).find((r) => r.via === 'exact' || r.via === 'brand');
  let status: SearchStatus | null = null;
  let catalog: Mention['catalog'] = [];
  let selectableTotal = 0;
  let curatorDecision: Awaited<ReturnType<typeof curatedFor>> = null;
  if (store) {
    for (const f of forms) {
      const lk = await store.lookup(f, { offset: 0, limit: 1 }).catch(() => null);
      if (!lk || lk.status === 'unknown_name') continue;
      const m = await store.matches(f);
      selectableTotal = m.f.filter(([, k]) => k === 'brand_name' || k === 'generic_name').length;
      status = lk.status === 'product_selection_required' && selectableTotal === 0 ? 'ingredient_name_only' : lk.status;
      catalog = lk.mis_catalog.filter(Boolean).map((e) => ({ name_ka: e.name_ka, name_en: e.name_en, source_url: e.source_url }));
      if (lk.status === 'catalog_name_only') curatorDecision = await curatedFor(lk.mis_catalog.filter(Boolean).map((e) => e.id)).catch(() => null);
      break;
    }
  }
  // A curator decision outranks the app's own brand hints for a catalog name.
  if (curatorDecision?.decision === 'approved' && curatorDecision.target_query) {
    return { input: name, kind: 'curator_approved', substance: curatorDecision.target_query.toLowerCase(), status: 'curated_mapping', catalog, selectableTotal, emaTotal, href, noteKa: `კურატორმა დაადასტურა კავშირი: „${curatorDecision.name_ka}“ → ${curatorDecision.target_query} (${curatorDecision.approved_by}). ინსტრუქციისა და დოზისთვის მაინც საჭიროა კონკრეტული პროდუქტის არჩევა და დადასტურება.` };
  }
  if (curatorDecision?.decision === 'rejected') {
    return { input: name, kind: 'catalog_only', substance: null, status: 'curator_rejected', catalog, selectableTotal: 0, emaTotal, href, noteKa: MSG.curatorRejected };
  }
  if (resolved?.via === 'exact' && resolved.inn) {
    return { input: name, kind: 'substance_exact', substance: resolved.inn, status, catalog, selectableTotal, emaTotal, href, noteKa: `მოქმედი ნივთიერება ზუსტად დასახელებულია (${resolved.inn}); კონკრეტული პროდუქტი არ არის დადასტურებული.` };
  }
  if (resolved?.via === 'brand' || brandOnlyMatch(name)) {
    const hint = resolved?.inn ?? brandOnlyMatch(name)?.generic_name.toLowerCase() ?? null;
    return { input: name, kind: 'brand_curated', substance: hint, status, catalog, selectableTotal, emaTotal, href, noteKa: 'სავაჭრო დასახელებაა. ინსტრუქციისა და დოზისთვის საჭიროა კონკრეტული პროდუქტის არჩევა და დადასტურება.' };
  }
  const euNote = emaTotal ? ` ევროპის (EMA) რეესტრში ზუსტი დასახელებით: ${emaTotal} — ევროპული ინსტრუქციისთვისაც საჭიროა პროდუქტის არჩევა და დადასტურება.` : '';
  if (status === 'catalog_name_only') return { input: name, kind: 'catalog_only', substance: null, status, catalog, selectableTotal, emaTotal, href, noteKa: MSG.catalogOnly + euNote };
  if (status === 'product_selection_required') return { input: name, kind: 'product_candidates', substance: null, status, catalog, selectableTotal, emaTotal, href, noteKa: MSG.choose + euNote };
  if (status === 'ingredient_name_only') return { input: name, kind: 'ingredient_only', substance: null, status, catalog, selectableTotal, emaTotal, href, noteKa: MSG.ingredientOnly + euNote };
  // Only in EMA's register: a real product name, but still not confirmed.
  if (emaTotal) return { input: name, kind: 'product_candidates', substance: null, status: 'product_selection_required', catalog: [], selectableTotal: 0, emaTotal, href, noteKa: `ევროპის (EMA) რეესტრში ზუსტი დასახელებით მოიძებნა (${emaTotal}). ინსტრუქციისა და დოზისთვის აირჩიეთ და დაადასტურეთ კონკრეტული პროდუქტი.` };
  return { input: name, kind: 'unknown', substance: null, status: 'unknown_name', catalog: [], selectableTotal: 0, emaTotal: 0, href, noteKa: MSG.unknown };
}

/** Text lines an agent may show for a mention that is not dose-eligible. */
export function mentionLine(m: Mention): string {
  const c = m.catalog[0];
  const cat = c ? ` კატალოგი: ${[c.name_ka, c.name_en].filter(Boolean).join(' / ')}.` : '';
  return `„${m.input}“ — ${m.noteKa}${cat}`;
}

/** Identity classification for a list of names (medication screen). */
export async function classifyNames(names: string[]): Promise<Mention[]> {
  const store = await getStore().catch(() => null);
  const out: Mention[] = [];
  for (const n of names.slice(0, 20)) out.push(await classify(n, store));
  return out;
}
