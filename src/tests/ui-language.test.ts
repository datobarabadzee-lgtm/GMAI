import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * GEORGIAN UI QA.
 *
 * Production UI strings must be Georgian. Accepted international medical and
 * technical abbreviations stay Latin; brand names stay as they are. Any other
 * Latin-only user-facing string fails this check.
 */

const ALLOWED = new Set([
  // brand — the clinic's own name, descriptor and published contact details
  'Georgian Expert Medical AI', 'AI Hospital', 'AI HOSPITAL', 'AI', 'GMAI',
  'LeaderMed', 'Medical AI', 'leadermed.net', 'www.leadermed.net', 'info@leadermed.ge',
  // accepted abbreviations and standards
  'FHIR', 'CQL', 'ICD-10', 'SNOMED CT', 'LOINC', 'ATC', 'RxNorm', 'MeSH', 'RCA', 'CAPA', 'ICU', 'ECG', 'EKG', 'CT', 'MRI', 'PICO',
  'DOAC', 'VKA', 'INR', 'eGFR', 'CrCl', 'BMI', 'BSA', 'QTc', 'GCS', 'NIHSS', 'SOFA', 'MELD', 'CURB-65', 'HAS-BLED', 'PERC',
  'CHA2DS2-VASc', 'CHA₂DS₂-VASc', 'WHO', 'ESC', 'NICE', 'AHA', 'ASA', 'ACC', 'STOPP', 'START', 'Beers', 'OSCE', 'PPI', 'NSAID',
  'SSRI', 'SNRI', 'OHSS', 'IVF', 'ART', 'TIA', 'AF', 'PE', 'DVT', 'VTE', 'CKD', 'AKI', 'COPD', 'HIV', 'SOP', 'KPI', 'QMS', 'IPC',
  'OPEN', 'PUBLIC_DOMAIN', 'LICENSED', 'INTERNAL_REFERENCE', 'RESTRICTED', 'UNKNOWN', 'PROPRIETARY_INTERNAL', 'RESTRICTED_INTERNAL_REFERENCE', 'PUBLIC_REGULATORY',
  'Demo', 'Live', 'Markdown', 'JSON', 'PDF', 'DOCX', 'TXT', 'CSV', 'URL', 'API', 'FTS', 'BM25', 'SQLite', 'PostgreSQL', 'pgvector',
  'npm run kb:import', 'GAUSHVI.bat', 'ENABLE_DEV_TOOLS=1', 'MODEL_PRICING_JSON', 'localhost',
  // keyboard keys
  'Enter', 'Ctrl', 'Cmd', 'Shift', 'Esc',
  // verbatim iOS menu item the install instructions tell the user to tap
  '„Add to Home Screen"', 'Add to Home Screen', 'Safari',
]);

const ALLOWED_RE = [
  /^[A-Z][A-Z0-9_\-.]*$/,            // SCREAMING_CASE identifiers / status codes
  /^[a-z_]+$/,                        // lowercase identifiers (rule fields)
  /^[A-Za-z0-9_\-./: ]{0,4}$/,        // punctuation, units, tiny fragments
  /^\d/,                              // starts with a digit
  /^(L3|QDR|QAQ|UTD2022|SRC|RUN|TAX)[-_]/,
  /^(clinical_rule|quality_rule|audit_question)$/,
  /^(PASS|PASS_WITH_WARNING|HUMAN_REVIEW|BLOCK|COVERED|PARTIAL|NOT_COVERED|KB_UNAVAILABLE)$/,
];

const PRODUCTION_DIRS = ['src/app', 'src/features', 'src/components'];
const EXCLUDE = [/\/admin\//, /\/dev\//, /retrieval-debugger/, /knowledge-health/, /usage-dashboard/, /ingest-workspace/];

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

/** JSX text nodes and the props that render user-visible strings. */
function userFacingStrings(source: string): string[] {
  // TypeScript declarations are not UI text. Dropping them first stops generics
  // such as `Promise<void>` from being read as a JSX text node.
  const src = source
    .split('\n')
    .filter((line) => !/^\s*(export\s+)?(type|interface)\s/.test(line))
    .join('\n');
  const out: string[] = [];
  const propRe = /\b(title|subtitle|labelKa|placeholder|aria-label|description)=(?:"([^"]*)"|\{'([^']*)'\}|\{`([^`]*)`\})/g;
  let m: RegExpExecArray | null;
  while ((m = propRe.exec(src)) !== null) out.push(m[2] ?? m[3] ?? m[4] ?? '');
  const textRe = />([^<>{}\n]{3,})</g;
  while ((m = textRe.exec(src)) !== null) out.push(m[1]);
  return out.map((s) => s.trim()).filter(Boolean);
}

const hasGeorgian = (s: string) => /[\u10A0-\u10FF]/.test(s);
const hasLatinWord = (s: string) => /[A-Za-z]{3,}/.test(s);
/** Template interpolations and code fragments are not user-facing literals. */
const isCode = (s: string) =>
  /\$\{|Math\.|=>|&&|\|\||\.\.\.|\(\)|;$/.test(s) ||
  // A lone PascalCase identifier is a type annotation caught by the JSX text
  // regex (": Record<string, string>" looks like ">Record<"), not UI copy.
  // Genuine one-word labels such as Markdown or JSON are listed in ALLOWED.
  /^[A-Z][A-Za-z0-9]*$/.test(s);

describe('Georgian UI audit', () => {
  const files = PRODUCTION_DIRS.flatMap(walk).filter((f) => !EXCLUDE.some((re) => re.test(f)));

  it('scans the production UI', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it('contains no untranslated Latin-only user-facing strings', () => {
    const offenders: string[] = [];
    files.forEach((f) => {
      userFacingStrings(fs.readFileSync(f, 'utf8')).forEach((s) => {
        if (hasGeorgian(s)) return;
        if (!hasLatinWord(s)) return;
        if (isCode(s)) return;
        if (ALLOWED.has(s)) return;
        if (ALLOWED_RE.some((re) => re.test(s))) return;
        // A string built only from allowed tokens is acceptable.
        const words = s.split(/[\s·/|,()\-–—:]+/).filter(Boolean);
        if (words.length && words.every((w) => ALLOWED.has(w) || ALLOWED_RE.some((re) => re.test(w)))) return;
        offenders.push(`${path.relative(process.cwd(), f)} :: ${s}`);
      });
    });
    if (offenders.length) console.log('UNTRANSLATED UI STRINGS:\n' + offenders.join('\n'));
    expect(offenders).toEqual([]);
  });

  it('keeps every sidebar label Georgian', async () => {
    const { NAV } = await import('@/components/layout/nav');
    NAV.forEach((n) => {
      if (n.labelKa === 'AI ჰოსპიტალი') return;
      expect(hasGeorgian(n.labelKa)).toBe(true);
    });
  });
});
