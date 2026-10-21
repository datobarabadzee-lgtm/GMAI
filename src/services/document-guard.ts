import { drugsIn, extractQuantities, factsFrom, supports, contextOf, type NumericFact } from '@/services/numeric-facts';
import { unsupportedDrugNames } from '@/services/drug-name-guard';
import { expandQuery } from '@/kb/lexicon';

/**
 * DOCUMENT FACT GUARD (audit F08, 2026-10-21)
 *
 * A document is written up from facts the clinician supplied. The prompt asks
 * the model not to invent anything; this guard checks on the server that it
 * did not. Every sentence the model wrote is compared with the supplied
 * material, and a sentence is removed — never „corrected" — when it contains:
 *
 *   · a number/quantity (dose, lab value, duration…) not present with the same
 *     value and unit in the supplied facts;
 *   · a date not present in the supplied facts;
 *   · a drug name the supplied facts do not contain;
 *   · an ICD-10 code not present in the supplied facts;
 *   · a diagnosis/condition concept (lexicon) the supplied facts do not contain.
 *
 * A section left empty gets the standard „to be completed by the physician"
 * marker. The removed sentences are returned so the clinician sees exactly what
 * was stopped and why. Rewording a supplied fact is not validating it: the
 * document stays a draft until a clinician reviews and signs it.
 */

export const EMPTY_MARK = 'მონაცემი არ არის მოწოდებული — შესავსებია ექიმის მიერ';

export type Removed = { heading: string; sentence: string; reasonKa: string };

const ICD = /\b[A-TV-Z]\d{2}(?:\.\d{1,2})?\b/g;
const DATE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g;

const normDate = (d: string) => d.replace(/[./]/g, '-');

function conditionConcepts(text: string): Set<string> {
  // Only lexicon groups that carry a clinical domain are conditions/diagnoses.
  const out = new Set<string>();
  for (const g of expandQuery(text).groups) out.add([...g].sort()[0].toLowerCase());
  return out;
}

export function guardDocument(
  sections: { heading: string; body: string }[],
  supplied: string,
  allowedExtra: string[] = [],
): { sections: { heading: string; body: string }[]; removed: Removed[] } {
  const sourceText = [supplied, ...allowedExtra].join('\n');
  const facts: NumericFact[] = factsFrom(sourceText, 'user', 'supplied');
  const sourceDates = new Set((sourceText.match(DATE) ?? []).map(normDate));
  const sourceIcd = new Set(sourceText.match(ICD) ?? []);
  const sourceDrugs = new Set(drugsIn(sourceText));
  const sourceConcepts = conditionConcepts(sourceText);
  const removed: Removed[] = [];

  const checkSentence = (sentence: string): string | null => {
    for (const q of extractQuantities(sentence).filter((x) => x.unit || x.comparator)) {
      const claim: NumericFact = { ...q, context: contextOf(sentence), scopeDrugs: drugsIn(sentence), passage: sentence, origin: 'engine', sourceId: 'doc' };
      if (!facts.some((f) => supports(claim, f).ok)) return `რიცხვი „${q.raw}“ მოწოდებულ მონაცემებში არ არის`;
    }
    for (const d of sentence.match(DATE) ?? []) if (!sourceDates.has(normDate(d))) return `თარიღი „${d}“ მოწოდებულ მონაცემებში არ არის`;
    for (const c of sentence.match(ICD) ?? []) if (!sourceIcd.has(c)) return `ICD-10 კოდი „${c}“ მოწოდებულ მონაცემებში არ არის`;
    const drugs = drugsIn(sentence).filter((d) => !sourceDrugs.has(d));
    if (drugs.length) return `პრეპარატი „${drugs.join(', ')}“ მოწოდებულ მონაცემებში არ არის`;
    const unsupported = unsupportedDrugNames(sentence, sourceText);
    if (unsupported.length) return `პრეპარატი „${unsupported.join(', ')}“ მოწოდებულ მონაცემებში არ არის`;
    const newConditions = [...conditionConcepts(sentence)].filter((c) => !sourceConcepts.has(c));
    if (newConditions.length) return `დიაგნოზი/მდგომარეობა „${newConditions.join(', ')}“ მოწოდებულ მონაცემებში არ არის`;
    return null;
  };

  const out = sections.map((s) => {
    if (!s.body || s.body.startsWith(EMPTY_MARK)) return s;
    const kept: string[] = [];
    for (const line of s.body.split('\n')) {
      const parts = line.split(/(?<=[.!?;])\s+/);
      const keptParts: string[] = [];
      for (const sentence of parts) {
        if (!sentence.trim()) continue;
        const reason = checkSentence(sentence);
        if (reason) removed.push({ heading: s.heading, sentence: sentence.trim(), reasonKa: reason });
        else keptParts.push(sentence);
      }
      if (keptParts.length) kept.push(keptParts.join(' '));
    }
    const body = kept.join('\n').trim();
    return { heading: s.heading, body: body || EMPTY_MARK };
  });
  return { sections: out, removed };
}
