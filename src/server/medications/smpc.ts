/**
 * EU Summary of Product Characteristics (SmPC) — text → sections.
 *
 * Input is the text layer of an EMA "EPAR – Product Information" PDF. Annex I
 * holds one or more SmPCs (one per presentation group, e.g. tablets and an
 * injection). Each SmPC follows the fixed QRD template, so sections are found
 * by their numbered headings in order — nothing is guessed or summarised:
 *
 *   1. NAME · 2. COMPOSITION · 3. PHARMACEUTICAL FORM · 4.1 … 4.9
 *
 * Text that does not match the template is reported as unparsed; it is never
 * filled in from anywhere else.
 */

export type SmpcSectionKey = '4.1' | '4.2' | '4.3' | '4.4' | '4.5' | '4.6' | '4.7' | '4.8' | '4.9';

export type Smpc = {
  index: number;
  /** Section 1, as written (e.g. "Avastin 25 mg/ml concentrate for solution for infusion"). */
  name: string;
  /** Section 2, first part (strength statements). */
  composition: string;
  /** Section 3, first line (pharmaceutical form). */
  form: string;
  sections: Partial<Record<SmpcSectionKey, string>>;
  /** Headings that were expected but not found in order. */
  missing: SmpcSectionKey[];
};

const HEADS: [SmpcSectionKey, RegExp][] = [
  ['4.1', /\n\s*4\.1\.?\s+Therapeutic\s+indications?\b/i],
  ['4.2', /\n\s*4\.2\.?\s+Posology\b/i],
  ['4.3', /\n\s*4\.3\.?\s+Contra-?\s?indications?\b/i],
  ['4.4', /\n\s*4\.4\.?\s+Special\s+warnings?\b/i],
  ['4.5', /\n\s*4\.5\.?\s+Interactions?\b/i],
  ['4.6', /\n\s*4\.6\.?\s+(Fertility|Pregnancy|Use\s+during)\b/i],
  ['4.7', /\n\s*4\.7\.?\s+Effects?\s+on\s+(the\s+)?ability\b/i],
  ['4.8', /\n\s*4\.8\.?\s+Undesirable\s+effects\b/i],
  ['4.9', /\n\s*4\.9\.?\s+Overdos(e|age)\b/i],
];
const END_4 = /\n\s*5\.?\s+PHARMACOLOGICAL\s+PROPERTIES\b|\n\s*5\.1\.?\s+Pharmacodynamic/i;
const H1 = /\n\s*1\.?\s+NAME\s+OF\s+THE\s+MEDICINAL\s+PRODUCTS?\s*\n/gi;
const H2 = /\n\s*2\.?\s+QUALITATIVE\s+AND\s+QUANTITATIVE\s+COMPOSITION\s*\n/i;
const H3 = /\n\s*3\.?\s+PHARMACEUTICAL\s+FORMS?\s*\n/i;
const H4 = /\n\s*4\.?\s+CLINICAL\s+PARTICULARS\s*\n/i;
const ANNEX_II = /\n\s*ANNEX\s+II\s*\n/;

/** Removes page numbers and normalises whitespace, keeping paragraph breaks. */
export function cleanText(raw: string): string {
  return ('\n' + raw)
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/\n[ \t]*\d{1,3}[ \t]*(?=\n)/g, '\n') // bare page numbers
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

function between(t: string, from: RegExp, to: RegExp): string | null {
  const a = from.exec(t);
  if (!a) return null;
  const rest = t.slice(a.index + a[0].length);
  const b = to.exec(rest);
  return (b ? rest.slice(0, b.index) : rest).trim();
}

function parseOne(t: string, index: number): Smpc {
  const body = '\n' + t;
  const name = (between(body, /^\n/, H2) ?? '').split('\n').filter(Boolean).slice(0, 3).join(' ').trim();
  const comp = between(body, H2, H3) ?? '';
  const form = (between(body, H3, H4) ?? '').split('\n').map((s) => s.trim()).filter(Boolean)[0] ?? '';
  const sections: Smpc['sections'] = {};
  const missing: SmpcSectionKey[] = [];
  const h4 = H4.exec(body);
  const clinical = h4 ? body.slice(h4.index) : '';
  const endM = END_4.exec(clinical);
  const part = endM ? clinical.slice(0, endM.index) : clinical;
  // Locate every heading in order; a section runs to the next found heading.
  const found: { key: SmpcSectionKey; start: number; bodyStart: number }[] = [];
  let cursor = 0;
  for (const [key, re] of HEADS) {
    const m = re.exec(part.slice(cursor));
    if (!m) {
      missing.push(key);
      continue;
    }
    const start = cursor + m.index;
    const lineEnd = part.indexOf('\n', start + 1);
    found.push({ key, start, bodyStart: lineEnd === -1 ? part.length : lineEnd });
    cursor = start + m[0].length;
  }
  for (let i = 0; i < found.length; i++) {
    const end = i + 1 < found.length ? found[i + 1].start : part.length;
    sections[found[i].key] = part.slice(found[i].bodyStart, end).trim();
  }
  return { index, name, composition: comp.split('\n').slice(0, 12).join('\n').trim(), form, sections, missing };
}

/** All SmPCs in Annex I of a product-information text. */
export function parseSmpcs(raw: string): Smpc[] {
  const t = cleanText(raw);
  const annex2 = ANNEX_II.exec(t);
  const annex1 = annex2 ? t.slice(0, annex2.index) : t;
  const starts: number[] = [];
  H1.lastIndex = 0;
  for (let m = H1.exec(annex1); m; m = H1.exec(annex1)) starts.push(m.index + m[0].length);
  return starts.map((s, i) => parseOne(annex1.slice(s, i + 1 < starts.length ? starts[i + 1] : annex1.length), i)).filter((s) => s.name);
}

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[®™]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Medicine name appears in section 1 as a whole word sequence. */
export function nameMatches(sectionName: string, medicineName: string): boolean {
  const a = norm(sectionName);
  // EMA keeps a renamed medicine as „New name (previously Old name)“.
  const b = norm(medicineName.replace(/\s*\(previously[^)]*\)\s*/gi, ' '));
  if (!b) return false;
  const i = a.indexOf(b);
  if (i === -1) return false;
  const before = i === 0 ? ' ' : a[i - 1];
  const after = a[i + b.length] ?? ' ';
  return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
}

/**
 * Each listed active substance (EMA's own field, ';'-separated) must appear in
 * section 2 — by its first significant word, so salts and descriptors written
 * differently still count, but a different molecule does not.
 */
/** British/American spelling only (aminolaevulinic ≈ aminolevulinic, sulphate ≈ sulfate). */
const spelling = (s: string) => s.replace(/ae/g, 'e').replace(/oe/g, 'e').replace(/sulph/g, 'sulf');

export function substancesMatch(composition: string, activeSubstance: string, inn: string): boolean {
  const c = spelling(norm(composition));
  const parts = (activeSubstance || inn)
    .split(';')
    .map((p) => spelling(norm(p)))
    .filter(Boolean);
  if (!parts.length) return false;
  const key = (p: string) => p.split(/[\s(),/-]+/).find((w) => w.length >= 4 && !/^(human|recombinant|dry|extract|from)$/.test(w)) ?? p;
  return parts.every((p) => c.includes(key(p))) || (inn ? spelling(norm(inn)).split(/[;,/]/).every((p) => c.includes(key(p.trim()))) : false);
}

/** Section 2 states at least one strength with a unit. */
export function hasStrength(composition: string): boolean {
  return /\d\s*(?:[.,]\d+)?\s*(mg|g|µg|mcg|microgram|micrograms|nanogram|ng|ml|mL|IU|units?|U|%|mmol|kBq|MBq|GBq|copies|CCID50|TCID50|PFU|vp|cells|Lf|ppm|mol\/mol)(?![a-z])/i.test(composition);
}
