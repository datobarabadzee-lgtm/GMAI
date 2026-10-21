import 'server-only';
import { expandQuery } from '@/kb/lexicon';
import { innFromDictionary } from '@/services/drug-naming';

/**
 * ENGLISH SEARCH TERMS FROM A GEORGIAN QUESTION — WITHOUT A MODEL CALL
 *
 * Open literature is indexed in English. Translating every question with a
 * model would add a paid call to every answer; instead three controlled sources
 * are combined:
 *   1. the clinical lexicon (controlled Georgian ↔ English concept pairs)
 *   2. the drug dictionary (Georgian name → INN), dictionary hits only
 *   3. Latin tokens already present (acronyms, scores, codes: DOAC, MRI, HbA1c)
 *
 * Returns nothing rather than a guess when none of these recognise anything —
 * an empty query is correctly treated upstream as "no literature search".
 */
export function englishSearchTerms(text: string, max = 5): string[] {
  const out: string[] = [];
  const push = (t: string) => {
    const v = t.trim().toLowerCase();
    if (v.length >= 3 && !out.includes(v)) out.push(v);
  };

  // 1. Concepts: the first English term of each matched group is the canonical one.
  for (const group of expandQuery(text).groups) {
    const en = group.find((g) => /^[a-z0-9\s-]+$/i.test(g));
    if (en) push(en);
  }

  // 2. Drugs.
  for (const token of text.split(/[\s,.;:()/]+/)) {
    const inn = innFromDictionary(token);
    if (inn) push(inn);
  }

  // 3. Latin tokens that look like clinical terms, not filler.
  const STOP = new Set(['and', 'the', 'with', 'for', 'mg', 'ml', 'per', 'day']);
  for (const token of text.match(/\b[A-Za-z][A-Za-z0-9-]{2,}\b/g) ?? []) {
    if (!STOP.has(token.toLowerCase())) push(token);
  }

  return out.slice(0, max);
}

/** Runs a promise with a ceiling, resolving to `fallback` on timeout or error. */
export async function withCeiling<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * All controlled English synonyms for ONE short concept (a PICO element).
 * A question needs one canonical term per concept; a PICO element needs every
 * synonym ORed, or a review indexed as "falls" is missed by "accidental falls".
 */
export function englishSynonyms(text: string, max = 4): string[] {
  const out: string[] = [];
  const push = (t: string) => {
    const v = t.trim().toLowerCase();
    if (v.length >= 3 && !out.includes(v)) out.push(v);
  };
  for (const group of expandQuery(text).groups) {
    for (const g of group) if (/^[a-z0-9\s-]+$/i.test(g)) push(g);
  }
  for (const t of englishSearchTerms(text, max)) push(t);
  return out.slice(0, max);
}
