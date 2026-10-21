/**
 * NEGATED REQUESTS (audit F09, 2026-10-21)
 *
 * „რა არის არტერიული ჰიპერტენზია? განმარტება მჭირდება, დოზირების გარეშე."
 * was routed as a DRUG question, because the word „დოზირება" matched — the
 * user had asked for the opposite. Before any word rule (intent, agent
 * selection, calculator suggestion, retrieval) reads the request, phrases that
 * exclude a subject are removed from the text those rules see. The user's
 * question itself is never changed: the answer is written for what they wrote.
 */

const SUBJECT_KA = '(?:დოზ[ა-ჰ]*|წამ[ა-ჰ]*|მედიკამენტ[ა-ჰ]*|პრეპარატ[ა-ჰ]*|მკურნალობ[ა-ჰ]*|თერაპი[ა-ჰ]*|ანალიზ[ა-ჰ]*|კალკულატორ[ა-ჰ]*|ქულ[ა-ჰ]*)';
const SUBJECT_EN = '(?:dos(?:e|es|ing|age)|drugs?|medications?|medicines?|treatment|therapy|calculators?|scores?)';

const PATTERNS: RegExp[] = [
  // „დოზირების გარეშე", „წამლების გარეშე", „დოზის გარდა"
  new RegExp(`${SUBJECT_KA}(?:\\s+(?:და|ან)\\s+${SUBJECT_KA})*\\s+(?:გარეშე|გარდა)`, 'giu'),
  // „დოზირება არ მჭირდება", „დოზა არ მაინტერესებს", „წამალს ნუ მირჩევ"
  new RegExp(`${SUBJECT_KA}\\s+(?:არ\\s+(?:მჭირდება|მინდა|მაინტერესებს|გვჭირდება|არის\\s+საჭირო)|ნუ\\s+[ა-ჰ]+)`, 'giu'),
  // „არა დოზირება", „არ მკითხავს დოზა"
  new RegExp(`(?:არა|ნუ)\\s+${SUBJECT_KA}`, 'giu'),
  // English: „without dosing", „no dose", „not about drugs", „no medication advice"
  new RegExp(`\\b(?:without|no|not about|excluding|except)\\s+(?:any\\s+)?${SUBJECT_EN}(?:\\s+(?:advice|information|recommendations?|details))?\\b`, 'gi'),
  new RegExp(`\\b${SUBJECT_EN}\\s+(?:is|are)\\s+not\\s+(?:needed|required|relevant)\\b`, 'gi'),
];

/** The request with excluded subjects removed — for routing and retrieval only. */
export function withoutNegatedRequests(text: string): string {
  let t = text;
  for (const re of PATTERNS) t = t.replace(re, ' ');
  return t.replace(/\s{2,}/g, ' ').trim();
}

/** True when the request explicitly excludes medication or dosing. */
export function excludesDrugs(text: string): boolean {
  return withoutNegatedRequests(text) !== text.replace(/\s{2,}/g, ' ').trim() && /დოზ|წამ|მედიკამენტ|პრეპარატ|dos|drug|medic/i.test(text) && !/დოზ|წამ|მედიკამენტ|პრეპარატ|\bdos|drug|medic/i.test(withoutNegatedRequests(text));
}
