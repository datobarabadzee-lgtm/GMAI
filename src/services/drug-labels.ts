import 'server-only';
import { latinCandidates } from '@/services/drug-naming';

/**
 * OPEN DRUG LABEL LOOKUP — openFDA
 *
 * Replaces a fixed hand-curated drug list with open coverage: any drug with a
 * US label can be looked up at request time. openFDA is a public API, no key.
 *
 * What this is NOT: a substitute for the Georgian SmPC. Labels are US ones, so
 * the response always says so; a clinician must not be shown a US label as if
 * it were the local one.
 */

const BASE = 'https://api.fda.gov/drug/label.json';
const UA = 'GMAI-LeaderMed/1.0 (clinical decision support)';

export type LabelSection =
  | 'indications_and_usage'
  | 'dosage_and_administration'
  | 'contraindications'
  | 'warnings_and_cautions'
  | 'warnings'
  | 'boxed_warning'
  | 'drug_interactions'
  | 'geriatric_use'
  | 'pregnancy'
  | 'renal_impairment'
  | 'hepatic_impairment'
  | 'adverse_reactions';

export const SECTION_KA: Record<string, string> = {
  boxed_warning: 'ჩარჩოში ჩასმული გაფრთხილება',
  indications_and_usage: 'ჩვენებები',
  dosage_and_administration: 'დოზირება',
  contraindications: 'უკუჩვენებები',
  warnings_and_cautions: 'გაფრთხილებები და სიფრთხილე',
  warnings: 'გაფრთხილებები',
  drug_interactions: 'წამალთაშორისი ურთიერთქმედება',
  geriatric_use: 'გამოყენება ხანდაზმულებში',
  pregnancy: 'ორსულობა',
  renal_impairment: 'თირკმლის უკმარისობა',
  hepatic_impairment: 'ღვიძლის უკმარისობა',
  adverse_reactions: 'არასასურველი რეაქციები',
  pediatric_use: 'გამოყენება ბავშვებში',
};

/** Read for the Georgian summary only (how it works, children) — not shown raw. */
const SUMMARY_ONLY = ['mechanism_of_action', 'pediatric_use', 'clinical_pharmacology', 'dosage_forms_and_strengths', 'information_for_patients'];

const ORDER: LabelSection[] = [
  'boxed_warning',
  'contraindications',
  'drug_interactions',
  'geriatric_use',
  'warnings_and_cautions',
  'warnings',
  'renal_impairment',
  'hepatic_impairment',
  'pregnancy',
  'dosage_and_administration',
  'indications_and_usage',
  'adverse_reactions',
];

export type DrugLabel = {
  query: string;
  brandNames: string[];
  genericNames: string[];
  manufacturer: string | null;
  route: string[];
  pharmClass: string[];
  sections: { key: string; labelKa: string; text: string }[];
  /** Untruncated section text, used for interaction matching, not for display. */
  raw: Record<string, string>;
  hasBoxedWarning: boolean;
  sourceNoteKa: string;
  /** US: openFDA label. EU: EMA SmPC (src/server/medications/ema.ts). */
  region?: 'US' | 'EU';
};

export class DrugLabelError extends Error {}

function trim(text: string, max = 2400): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** A DrugLabel view of one openFDA label document that the identity service already verified. */
export function labelFromSource(r: Record<string, unknown>, query: string): DrugLabel {
  const of = (r.openfda ?? {}) as Record<string, string[]>;
  const rawSections: Record<string, string> = {};
  const sections = ORDER.flatMap((key) => {
    const val = r[key];
    if (!Array.isArray(val) || !val.length) return [];
    const full = String(val[0]).replace(/\s+/g, ' ').trim();
    if (!full) return [];
    rawSections[key] = full;
    return [{ key, labelKa: SECTION_KA[key] ?? key, text: trim(full) }];
  });
  for (const key of SUMMARY_ONLY) {
    const val = r[key];
    if (Array.isArray(val) && val.length) rawSections[key] = String(val[0]).replace(/\s+/g, ' ').trim();
  }
  return {
    query,
    brandNames: (of.brand_name ?? []).slice(0, 6),
    genericNames: (of.generic_name ?? []).slice(0, 6),
    manufacturer: (of.manufacturer_name ?? [])[0] ?? null,
    route: (of.route ?? []).slice(0, 4),
    pharmClass: [...(of.pharm_class_epc ?? []), ...(of.pharm_class_moa ?? [])].slice(0, 4),
    sections,
    raw: rawSections,
    hasBoxedWarning: sections.some((s) => s.key === 'boxed_warning'),
    sourceNoteKa:
      r._region === 'EU'
        ? 'წყარო: EMA — ევროპული ინსტრუქცია (SmPC), არჩეული და დადასტურებული პროდუქტის EMA-ს ნომრით. ეს არ არის საქართველოში რეგისტრირებული პრეპარატის ინსტრუქცია.'
        : 'წყარო: openFDA — აშშ-ის პრეპარატის ეტიკეტი, არჩეული და დადასტურებული პროდუქტის ID-ით. ეს არ არის საქართველოში რეგისტრირებული პრეპარატის ინსტრუქცია.',
    region: r._region === 'EU' ? 'EU' : 'US',
  };
}

/**
 * @deprecated Name-based lookup returns the first label that carries a name —
 * exactly the pattern that mislabelled Colomycin. Not used by any route or
 * agent any more; product identity goes through src/server/medications.
 */
export async function lookupDrugLabel(name: string): Promise<DrugLabel | null> {
  if (process.env.DISABLE_LIVE_SOURCES === '1') return null;

  const raw = name.trim();
  if (raw.length < 2) return null;

  // Georgian input resolves to Latin INN candidates before any lookup.
  const candidates = latinCandidates(raw).map((c) => c.replace(/["\\]/g, ''));
  if (!candidates.length) return null;

  // Generic name first, then brand, then substance — the order a clinician expects.
  const attempts = candidates.flatMap((q) => [
    `openfda.generic_name:"${q}"`,
    `openfda.brand_name:"${q}"`,
    `openfda.substance_name:"${q}"`,
  ]);

  for (const search of attempts) {
    const url = `${BASE}?search=${encodeURIComponent(search)}&limit=1`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new DrugLabelError('openFDA unreachable');
    }
    if (res.status === 404) continue;
    if (!res.ok) throw new DrugLabelError(`openFDA ${res.status}`);

    const json = (await res.json()) as { results?: Record<string, unknown>[] };
    const r = json.results?.[0];
    if (!r) continue;

    const of = (r.openfda ?? {}) as Record<string, string[]>;
    // Identity check: the label returned must actually carry the name that was
    // searched for. A label for another molecule is never shown under this name.
    const q = search.slice(search.indexOf('"') + 1, -1).toLowerCase();
    const names = [...(of.generic_name ?? []), ...(of.brand_name ?? []), ...(of.substance_name ?? [])].map((n) => n.toLowerCase());
    const qWords = q.split(/[\s/,+-]+/).filter((w) => w.length > 2);
    if (!names.some((n) => qWords.every((w) => n.split(/[^a-z0-9]+/).includes(w)))) continue;
    const rawSections: Record<string, string> = {};
    const sections = ORDER.flatMap((key) => {
      const val = r[key];
      if (!Array.isArray(val) || !val.length) return [];
      const full = String(val[0]).replace(/\s+/g, ' ').trim();
      if (!full) return [];
      rawSections[key] = full;
      return [{ key, labelKa: SECTION_KA[key] ?? key, text: trim(full) }];
    });
    for (const key of SUMMARY_ONLY) {
      const val = r[key];
      if (Array.isArray(val) && val.length) rawSections[key] = String(val[0]).replace(/\s+/g, ' ').trim();
    }

    return {
      query: raw,
      brandNames: (of.brand_name ?? []).slice(0, 6),
      genericNames: (of.generic_name ?? []).slice(0, 6),
      manufacturer: (of.manufacturer_name ?? [])[0] ?? null,
      route: (of.route ?? []).slice(0, 4),
      pharmClass: [...(of.pharm_class_epc ?? []), ...(of.pharm_class_moa ?? [])].slice(0, 4),
      sections,
      raw: rawSections,
      hasBoxedWarning: sections.some((s) => s.key === 'boxed_warning'),
      sourceNoteKa:
        'წყარო: openFDA — აშშ-ის პრეპარატის ეტიკეტი. ეს არ არის საქართველოში რეგისტრირებული პრეპარატის ინსტრუქცია; დოზირება და ჩვენებები გადაამოწმეთ ადგილობრივ SmPC-ში.',
    };
  }

  return null;
}

/** Looks up several drugs, reporting per-drug failures rather than failing the batch. */
export async function lookupMany(names: string[]): Promise<{ found: DrugLabel[]; notFound: string[]; errors: string[] }> {
  const found: DrugLabel[] = [];
  const notFound: string[] = [];
  const errors: string[] = [];

  const results = await Promise.allSettled(names.slice(0, 20).map((n) => lookupDrugLabel(n)));
  results.forEach((res, i) => {
    if (res.status === 'rejected') errors.push(names[i]);
    else if (res.value) found.push(res.value);
    else notFound.push(names[i]);
  });

  return { found, notFound, errors };
}

/**
 * Class synonyms a label may use instead of naming a drug. Warfarin's label
 * warns about "NSAIDs", not about "ibuprofen" — matching only on drug names
 * misses the single most common dangerous combination in outpatient practice.
 */
const CLASS_SYNONYMS: { test: RegExp; terms: string[] }[] = [
  { test: /nonsteroidal|cyclooxygenase|propionic acid|acetic acid deriv/i, terms: ['nsaid', 'non-steroidal', 'nonsteroidal anti-inflammatory'] },
  { test: /serotonin reuptake|ssri/i, terms: ['serotonin reuptake inhibitor', 'ssri', 'antidepressant'] },
  { test: /proton pump/i, terms: ['proton pump inhibitor'] },
  { test: /benzodiazepine/i, terms: ['benzodiazepine', 'cns depressant'] },
  { test: /opioid/i, terms: ['opioid', 'cns depressant'] },
  { test: /platelet aggregation|antiplatelet/i, terms: ['antiplatelet', 'platelet aggregation inhibitor'] },
  { test: /vitamin k antagonist|anticoagulant/i, terms: ['anticoagulant', 'warfarin'] },
  { test: /corticosteroid|glucocorticoid/i, terms: ['corticosteroid'] },
  { test: /macrolide/i, terms: ['macrolide'] },
  { test: /fluoroquinolone|quinolone/i, terms: ['fluoroquinolone', 'quinolone'] },
  { test: /diuretic/i, terms: ['diuretic'] },
  { test: /angiotensin.convert|ace inhibitor/i, terms: ['ace inhibitor', 'angiotensin'] },
  { test: /hmg.coa|statin/i, terms: ['statin', 'hmg-coa reductase inhibitor'] },
  { test: /tricyclic/i, terms: ['tricyclic', 'anticholinergic'] },
];

function classTermsFor(label: DrugLabel): string[] {
  const hay = [...label.pharmClass, ...label.genericNames].join(' ');
  return CLASS_SYNONYMS.filter((c) => c.test.test(hay)).flatMap((c) => c.terms);
}

export type LabelInteraction = {
  a: string;
  b: string;
  via: 'name' | 'class';
  evidenceKa: string;
  matchedTerm: string;
  excerpt: string;
  severityHint: 'boxed' | 'interaction';
};

/**
 * Pairwise interaction screen over the retrieved labels. Reports which label
 * names the other drug, or the other drug's pharmacologic class.
 * This is a screen, not a graded interaction database: it surfaces the label's
 * own words so the clinician judges severity.
 */
export function crossInteractions(labels: DrugLabel[]): LabelInteraction[] {
  const out: LabelInteraction[] = [];
  const seen = new Set<string>();

  for (const label of labels) {
    const sources: { key: string; text: string; hint: 'boxed' | 'interaction' }[] = [];
    if (label.raw.drug_interactions) sources.push({ key: 'drug_interactions', text: label.raw.drug_interactions, hint: 'interaction' });
    if (label.raw.boxed_warning) sources.push({ key: 'boxed_warning', text: label.raw.boxed_warning, hint: 'boxed' });
    if (!sources.length) continue;

    for (const other of labels) {
      if (other === label) continue;
      const aName = label.genericNames[0] ?? label.query;
      const bName = other.genericNames[0] ?? other.query;

      const names = [...other.genericNames, ...other.brandNames].map((n) => n.toLowerCase()).filter((n) => n.length > 3);
      const classes = classTermsFor(other);

      for (const src of sources) {
        const hay = src.text.toLowerCase();
        const nameHit = names.find((n) => hay.includes(n));
        const classHit = nameHit ? null : classes.find((c) => hay.includes(c));
        const hit = nameHit ?? classHit;
        if (!hit) continue;

        const dedupe = `${aName}|${bName}|${src.key}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);

        const idx = hay.indexOf(hit);
        out.push({
          a: aName,
          b: bName,
          via: nameHit ? 'name' : 'class',
          matchedTerm: hit,
          evidenceKa: nameHit
            ? `${aName}-ის ეტიკეტი პირდაპირ ასახელებს ${bName}-ს`
            : `${aName}-ის ეტიკეტი ასახელებს ჯგუფს „${hit}“, რომელსაც ${bName} ეკუთვნის`,
          excerpt: trim(src.text.slice(Math.max(0, idx - 200), idx + 380), 560),
          severityHint: src.hint,
        });
      }
    }
  }

  // Boxed-warning matches first — they are the label's own highest alarm.
  return out.sort((a, b) => (a.severityHint === b.severityHint ? 0 : a.severityHint === 'boxed' ? -1 : 1));
}
