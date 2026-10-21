import { exactInn, knownDrugNames } from '@/services/drug-naming';

/**
 * NUMERIC FACTS WITH THEIR MEANING
 *
 * A number is never verified on its own. „Age 5 years" in a source does not
 * support „5 mg"; „5" somewhere in an engine's output does not support „5 mL";
 * apixaban 5 mg does not support metformin 5 mg (audit F01, 2026-10-21).
 *
 * Every number — in the answer and in each piece of evidence — is extracted as
 * a quantity (value or range, canonical unit, dimension, kind) together with
 * the context of its sentence: drug(s), route, frequency, population. A claim
 * is supported only by a fact with the same value, a compatible unit of the
 * same dimension and kind, and no conflicting drug / route / frequency /
 * population. The passage of the supporting fact is kept so the check can be
 * read by a person.
 */

export type Dimension = 'body_mass' | 'length' | 'mass' | 'volume' | 'iu' | 'mass_per_kg' | 'concentration_mass' | 'concentration_molar' | 'rate_volume' | 'pressure' | 'time' | 'age' | 'percent' | 'none';
export type QuantityKind = 'dose' | 'lab_threshold' | 'age_cutoff' | 'duration' | 'interval' | 'threshold' | 'other';

export type Quantity = {
  raw: string;
  /** One value, or [low, high] for a range („2.5–5 მგ"). */
  values: number[];
  unit: string | null;
  dim: Dimension;
  /** Factor to the dimension's base unit (mg, mL, IU, mg/kg, mg/dL, mmol/L, mL/min, mmHg, hour, year, %). */
  factor: number;
  kind: QuantityKind;
  comparator: string | null;
  index: number;
};

export type FactContext = {
  drugs: string[];
  route: string | null;
  frequencyPerDay: number | null;
  population: string | null;
};

export type FactOrigin = 'rule' | 'engine' | 'user' | 'computed';

export type NumericFact = Quantity & {
  context: FactContext;
  /** Drugs the whole document/agent output is about (a dose line rarely repeats the name). */
  scopeDrugs: string[];
  passage: string;
  origin: FactOrigin;
  sourceId: string;
};

/* ── units ─────────────────────────────────────────────────────────────── */

type UnitDef = { re: string; unit: string; dim: Dimension; factor: number };
// Longest forms first: „მგ/კგ" before „მგ", „მგ/დლ" before „მგ".
const UNITS: UnitDef[] = [
  { re: 'მგ\\/კგ|mg\\/kg', unit: 'mg/kg', dim: 'mass_per_kg', factor: 1 },
  { re: 'მკგ\\/კგ|mcg\\/kg|µg\\/kg|μg\\/kg', unit: 'µg/kg', dim: 'mass_per_kg', factor: 0.001 },
  { re: 'მგ\\/დლ|mg\\/dl', unit: 'mg/dL', dim: 'concentration_mass', factor: 1 },
  { re: 'გ\\/დლ|g\\/dl', unit: 'g/dL', dim: 'concentration_mass', factor: 1000 },
  { re: 'გ\\/ლ|g\\/l', unit: 'g/L', dim: 'concentration_mass', factor: 100 },
  { re: 'მგ\\/ლ|mg\\/l', unit: 'mg/L', dim: 'concentration_mass', factor: 0.1 },
  { re: 'მგ\\/მლ|mg\\/ml', unit: 'mg/mL', dim: 'concentration_mass', factor: 100 },
  { re: 'მმოლ\\/ლ|mmol\\/l', unit: 'mmol/L', dim: 'concentration_molar', factor: 1 },
  { re: 'მკმოლ\\/ლ|µmol\\/l|μmol\\/l|umol\\/l', unit: 'µmol/L', dim: 'concentration_molar', factor: 0.001 },
  { re: 'მლ\\/წთ(?:\\/1[.,]73\\s?მ²)?|ml\\/min(?:\\/1[.,]73\\s?m2)?', unit: 'mL/min', dim: 'rate_volume', factor: 1 },
  { re: 'მმ\\s?ვწყ\\.?\\s?სვ\\.?|mm\\s?hg', unit: 'mmHg', dim: 'pressure', factor: 1 },
  { re: 'კგ|kg', unit: 'kg', dim: 'body_mass', factor: 1 },
  { re: 'სმ|cm', unit: 'cm', dim: 'length', factor: 1 },
  { re: 'მკგ|mcg|µg|μg', unit: 'µg', dim: 'mass', factor: 0.001 },
  { re: 'მგ|mg', unit: 'mg', dim: 'mass', factor: 1 },
  { re: 'გრ|გ|g', unit: 'g', dim: 'mass', factor: 1000 },
  { re: 'მლ|ml', unit: 'mL', dim: 'volume', factor: 1 },
  { re: 'ლ|l', unit: 'L', dim: 'volume', factor: 1000 },
  { re: 'სე|იე|IU|ერთეული|ერთ\\.?|units?|u', unit: 'IU', dim: 'iu', factor: 1 },
  { re: '%', unit: '%', dim: 'percent', factor: 1 },
  { re: 'საათ[ა-ჰ]*|სთ|hours?|hrs?|h', unit: 'h', dim: 'time', factor: 1 },
  { re: 'წუთ[ა-ჰ]*|წთ|minutes?|min', unit: 'min', dim: 'time', factor: 1 / 60 },
  { re: 'დღ[ა-ჰ]*|days?', unit: 'day', dim: 'time', factor: 24 },
  { re: 'კვირ[ა-ჰ]*|weeks?', unit: 'week', dim: 'time', factor: 168 },
  { re: 'თვ[ა-ჰ]*|months?', unit: 'month', dim: 'time', factor: 730 },
  { re: 'წლ[ა-ჰ]*|წელ[ა-ჰ]*|years?|yrs?', unit: 'year', dim: 'time', factor: 8760 },
];

const NUM = '\\d+(?:[.,]\\d+)?';
const RANGE = `(${NUM})(?:\\s*(?:-|–|—|to|დან|-დან)\\s*(${NUM}))?`;
const LETTER_AFTER = '(?![a-zA-Zა-ჰ])';
const QTY_RE = new RegExp(`(≥|>=|≤|<=|>|<)?\\s*${RANGE}\\s*(${UNITS.map((u) => u.re).join('|')})?${LETTER_AFTER}`, 'giu');

function unitOf(token: string | undefined): UnitDef | null {
  if (!token) return null;
  for (const u of UNITS) if (new RegExp(`^(?:${u.re})$`, 'iu').test(token.trim())) return u;
  return null;
}

const num = (s: string) => Number(s.replace(',', '.'));

/** All quantities in a text, each with value(s), canonical unit and dimension. */
export function extractQuantities(text: string): Quantity[] {
  const out: Quantity[] = [];
  const re = new RegExp(QTY_RE.source, QTY_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!m[2]) continue;
    // Part of an identifier or a code (QDR-00101, A07, H2O): the digit run is glued to a letter or a hyphen.
    const at = m.index + m[0].indexOf(m[2]);
    const prev = text[at - 1] ?? ' ';
    if (/[A-Za-zა-ჰ\d]/.test(prev) || (prev === '-' && /[A-Za-zა-ჰ\d]/.test(text[at - 2] ?? ' '))) continue;
    const u = unitOf(m[4]);
    const values = [num(m[2]), ...(m[3] ? [num(m[3])] : [])];
    const ctxBefore = text.slice(Math.max(0, m.index + m[0].indexOf(m[2]) - 24), m.index + m[0].indexOf(m[2])).toLowerCase();
    let dim: Dimension = u?.dim ?? 'none';
    if (dim === 'time' && /(ასაკ|age|aged|წლის|years? old)/i.test(ctxBefore + text.slice(m.index, m.index + m[0].length + 6))) dim = 'age';
    if (dim === 'none' && /(ასაკ|age)\s*(?:≥|>=|>|<|≤|<=)?\s*$/i.test(ctxBefore)) dim = 'age';
    const kind: QuantityKind =
      dim === 'age'
        ? 'age_cutoff'
        : ['mass', 'volume', 'iu', 'mass_per_kg'].includes(dim)
          ? 'dose'
          : ['concentration_mass', 'concentration_molar', 'rate_volume', 'percent'].includes(dim)
            ? 'lab_threshold'
            : dim === 'time'
              ? /(ყოველ|every|\bq)\s*$/i.test(ctxBefore)
                ? 'interval'
                : 'duration'
              : m[1]
                ? 'threshold'
                : 'other';
    out.push({ raw: m[0].trim(), values, unit: u?.unit ?? null, dim, factor: u?.factor ?? 1, kind, comparator: m[1] ?? null, index: at });
    if (out.length > 120) break;
  }
  return out;
}

/* ── context ───────────────────────────────────────────────────────────── */

const ROUTES: [RegExp, string][] = [
  [/ინტრავენ|\bi\.?v\.?\b|intraven|ვენაში|ი\/ვ/i, 'iv'],
  [/კუნთ(?:ში|შიდა)|\bi\.?m\.?\b|intramusc|ი\/მ/i, 'im'],
  [/კანქვეშ|\bs\.?c\.?\b|subcut|კ\/ქ/i, 'sc'],
  [/პერორალ|შიგნით|ტაბლეტ|კაფსულ|\bp\.?o\.?\b|oral|per os|by mouth/i, 'oral'],
  [/ინჰალაც|inhal/i, 'inhaled'],
  [/რექტალ|rectal/i, 'rectal'],
  [/ტოპიკ|გარეგან|კანზე|topical|cutaneous/i, 'topical'],
];
const FREQ: [RegExp, number][] = [
  [/დღეში\s+ოთხჯერ|ოთხჯერ\s+დღეში|\bqid\b|four times (?:a|per) day|q6h/i, 4],
  [/დღეში\s+სამჯერ|სამჯერ\s+დღეში|\btid\b|three times (?:a|per) day|q8h/i, 3],
  [/დღეში\s+ორჯერ|ორჯერ\s+დღეში|\bbid\b|twice (?:a|per) day|twice daily|q12h/i, 2],
  [/დღეში\s+ერთხელ|ერთხელ\s+დღეში|\bonce daily\b|\bqd\b|once a day|q24h|დღე-ღამეში ერთხელ/i, 1],
  [/კვირაში\s+ერთხელ|once weekly|weekly/i, 1 / 7],
];
const POPULATIONS: [RegExp, string][] = [
  [/ახალშობილ|neonat|newborn/i, 'neonate'],
  [/ჩვილ|infant/i, 'infant'],
  [/ბავშვ|პედიატრ|pediatric|paediatric|child/i, 'child'],
  [/მოზარდ|adolesc/i, 'adolescent'],
  [/ხანდაზმ|მოხუც|elderly|older adult|geriatric/i, 'older_adult'],
  [/ორსულ|pregnan/i, 'pregnant'],
  [/მოზრდილ|ზრდასრულ|adult/i, 'adult'],
];
const COMPATIBLE_POP = new Map<string, string[]>([
  ['adult', ['adult', 'older_adult', 'pregnant']],
  ['older_adult', ['adult', 'older_adult']],
  ['pregnant', ['adult', 'pregnant']],
  ['child', ['child', 'adolescent', 'infant']],
  ['adolescent', ['child', 'adolescent']],
  ['infant', ['child', 'infant', 'neonate']],
  ['neonate', ['infant', 'neonate']],
]);

let knownLatin: Set<string> | null = null;
const latinDrugs = () => (knownLatin ??= new Set(knownDrugNames().filter((n) => /^[a-z][a-z -]+$/.test(n))));

/** Georgian case forms → nominative candidates („ვარფარინთან" → „ვარფარინი"). Deterministic suffix rules only. */
function kaForms(w: string): string[] {
  const out = [w];
  for (const suf of ['ისთვის', 'ისგან', 'იდან', 'ებით', 'ებს', 'ები', 'თან', 'ისა', 'ის', 'ით', 'ად', 'ზე', 'ში', 'მა', 'ს']) {
    if (w.length > suf.length + 3 && w.endsWith(suf)) {
      const stem = w.slice(0, -suf.length);
      out.push(stem.endsWith('ი') ? stem : `${stem}ი`, stem);
    }
  }
  return [...new Set(out)];
}

/** Drugs named in a text, as INN keys (exact dictionary and trade names only — never a look-alike). */
export function drugsIn(text: string, extraNames: string[] = []): string[] {
  const out = new Set<string>();
  const extra = new Map(extraNames.filter(Boolean).map((n) => [n.toLowerCase(), n.toLowerCase()]));
  for (const w of text.split(/[\s,.;:()/!?«»„“"[\]{}*·]+/)) {
    if (w.length < 4) continue;
    const lw = w.toLowerCase();
    if (extra.has(lw)) {
      out.add(extra.get(lw)!);
      continue;
    }
    if (/^[a-z][a-z-]+$/.test(lw)) {
      if (latinDrugs().has(lw)) out.add((exactInn(lw) ?? lw).toLowerCase());
      continue;
    }
    if (/[ა-ჰ]/.test(lw)) {
      for (const form of kaForms(lw)) {
        const inn = exactInn(form);
        if (inn) {
          out.add(inn.toLowerCase());
          break;
        }
      }
    }
  }
  return [...out];
}

function sentenceAround(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf('\n', index), text.lastIndexOf('. ', index), text.lastIndexOf('; ', index), text.lastIndexOf('|', index));
  const ends = ['\n', '. ', '; ', '|'].map((s) => text.indexOf(s, index)).filter((i) => i !== -1);
  const end = ends.length ? Math.min(...ends) : text.length;
  return text.slice(start === -1 ? 0 : start + 1, end).trim();
}

export function contextOf(sentence: string, extraNames: string[] = []): FactContext {
  return {
    drugs: drugsIn(sentence, extraNames),
    route: ROUTES.find(([re]) => re.test(sentence))?.[1] ?? null,
    frequencyPerDay: FREQ.find(([re]) => re.test(sentence))?.[1] ?? null,
    population: POPULATIONS.find(([re]) => re.test(sentence))?.[1] ?? null,
  };
}

/** Facts in one piece of evidence (a rule, an agent output, the user's input). */
export function factsFrom(text: string, origin: FactOrigin, sourceId: string, extraNames: string[] = []): NumericFact[] {
  if (!text) return [];
  const scopeDrugs = drugsIn(text, extraNames);
  return extractQuantities(text).map((q) => {
    const passage = sentenceAround(text, q.index);
    return { ...q, context: contextOf(passage, extraNames), scopeDrugs, passage: passage.slice(0, 400), origin, sourceId };
  });
}

/* ── matching ──────────────────────────────────────────────────────────── */

export type FactMatch = { ok: true; fact: NumericFact } | { ok: false; reason: string };

const sameValues = (a: Quantity, b: Quantity) =>
  a.values.length === b.values.length && a.values.every((v, i) => Math.abs(v * a.factor - b.values[i] * b.factor) <= 1e-9 * Math.max(1, Math.abs(v * a.factor)));

/**
 * Does `fact` support `claim`? Same dimension and kind, same value(s) after
 * unit conversion, and no conflicting drug / route / frequency / population.
 * A claim with a unit is never supported by a unitless number.
 */
export function supports(claim: NumericFact, fact: NumericFact): FactMatch {
  if (claim.dim !== fact.dim) return { ok: false, reason: `ერთეულის ტიპი განსხვავდება (${claim.unit ?? '—'} ≠ ${fact.unit ?? '—'})` };
  if (claim.dim === 'none' && claim.kind !== fact.kind) return { ok: false, reason: 'სიდიდის ტიპი განსხვავდება' };
  if (claim.comparator && fact.comparator && claim.comparator.replace('=', '') !== fact.comparator.replace('=', '')) return { ok: false, reason: 'შედარების ნიშანი განსხვავდება' };
  if (!sameValues(claim, fact)) return { ok: false, reason: 'მნიშვნელობა განსხვავდება' };
  // Drug: the claim's drug must be what the fact is about.
  const claimDrugs = claim.context.drugs.length ? claim.context.drugs : claim.scopeDrugs;
  const factDrugs = fact.context.drugs.length ? fact.context.drugs : fact.scopeDrugs;
  if (claim.kind === 'dose' || claimDrugs.length) {
    if (claimDrugs.length && factDrugs.length && !claimDrugs.some((d) => factDrugs.includes(d))) return { ok: false, reason: `სხვა პრეპარატის მნიშვნელობაა (${factDrugs.join(', ')})` };
    if (claim.kind === 'dose' && claimDrugs.length && !factDrugs.length) return { ok: false, reason: 'წყაროს ფრაგმენტში პრეპარატი არ არის დასახელებული' };
  }
  if (claim.context.route && fact.context.route && claim.context.route !== fact.context.route) return { ok: false, reason: `შეყვანის გზა განსხვავდება (${claim.context.route} ≠ ${fact.context.route})` };
  if (claim.context.frequencyPerDay && fact.context.frequencyPerDay && claim.context.frequencyPerDay !== fact.context.frequencyPerDay) return { ok: false, reason: 'სიხშირე განსხვავდება' };
  if (claim.context.population && fact.context.population && !(COMPATIBLE_POP.get(claim.context.population) ?? [claim.context.population]).includes(fact.context.population)) {
    return { ok: false, reason: `პაციენტის ჯგუფი განსხვავდება (${claim.context.population} ≠ ${fact.context.population})` };
  }
  return { ok: true, fact };
}
