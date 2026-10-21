import { knownDrugNames } from '@/services/drug-naming';

/**
 * Programmatic guard on model-written text: every drug name the model writes
 * must already occur in what the user wrote or what the agents produced.
 * A model that "recognises" a trade name from memory and names a substance
 * (Colomycin → colchicine) introduces a name that is in neither — the text is
 * then not published and the deterministic bottom line is shown instead.
 * Matching is literal (stem of a known name), never by similarity.
 */
let NAMES: { name: string; stem: string; ka: boolean }[] | null = null;
function names() {
  if (!NAMES) {
    NAMES = knownDrugNames().map((n) => {
      const ka = /[ა-ჿ]/.test(n);
      // Georgian nouns decline: compare on the stem without the final -ი.
      const stem = ka && n.endsWith('ი') ? n.slice(0, -1) : n;
      return { name: n, stem, ka };
    });
  }
  return NAMES;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function mentions(text: string): Set<string> {
  const t = text.toLowerCase();
  const out = new Set<string>();
  for (const n of names()) {
    if (n.stem.length < 5) continue;
    const re = n.ka ? new RegExp(`(^|[^\\u10D0-\\u10FF])${esc(n.stem)}`, 'u') : new RegExp(`(^|[^a-z])${esc(n.stem)}([^a-z]|$)`);
    if (re.test(t)) out.add(n.stem);
  }
  return out;
}

/** Names in `generated` that do not occur in `allowed` (user input + agent output). */
export function unsupportedDrugNames(generated: string, allowed: string): string[] {
  const inText = mentions(generated);
  if (!inText.size) return [];
  const ok = mentions(allowed);
  const a = allowed.toLowerCase();
  return [...inText].filter((s) => !ok.has(s) && !a.includes(s));
}
