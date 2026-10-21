import { expandQuery } from '@/kb/lexicon';

/**
 * CLAIM → PASSAGE LINKING (audit F04, 2026-10-21)
 *
 * „The run retrieved something" is not evidence that the answer is right: a
 * definition of hypertension was published with PASS and two „sources" — a
 * creatinine-clearance paper and the patient-rights law — because grounding
 * was counted as the number of hits.
 *
 * Each sentence of the published answer is checked against the passages the
 * run actually has (retrieved rules and units, registry sources, retrieved
 * literature abstracts, deterministic engine output). A sentence is LINKED to
 * a passage only when they share enough specific clinical concepts — after
 * Georgian stemming and the lexicon's Georgian↔English concept groups — and
 * the passage is about the question's own topic. Generic words (patient,
 * treatment, dose, doctor, management…) and boilerplate never count.
 *
 * This is deterministic concept linking for a person to check, not automatic
 * proof that the passage entails the sentence; the UI and the release gate say
 * so. An answer with clinical sentences and no linked passage is published as
 * unsupported general information, never as PASS, and lists no sources.
 */

export type Passage = {
  id: string;
  /** Registry source id, rule id, literature id or agent id. */
  sourceId: string;
  kind: 'registry' | 'kb_rule' | 'clinical_unit' | 'literature' | 'engine';
  title: string;
  text: string;
};

export type ClaimLink = {
  sentence: string;
  clinical: boolean;
  status: 'LINKED' | 'UNSUPPORTED' | 'NOT_A_CLAIM';
  passage: { id: string; sourceId: string; kind: Passage['kind']; title: string; excerpt: string } | null;
  sharedConcepts: string[];
};

export type ClaimMap = { claims: ClaimLink[]; linkedSourceIds: string[]; clinicalClaims: number; linkedClaims: number };

// Function words and generic clinical words: present in almost every medical
// text, so they say nothing about whether two texts are on the same subject.
const GENERIC = new Set(
  [
    // Georgian (stems, 6 chars max)
    'პაციენ', 'მკურნა', 'ექიმთა', 'ექიმის', 'ექიმი', 'ექიმს', 'დოზირე', 'დოზის', 'დოზა', 'დოზით', 'მართვა', 'მართვი', 'შეფასე', 'საჭირო', 'შეიძლ', 'რეკომე', 'კლინიკ', 'მდგომა', 'დაავად', 'სიმპტო', 'ნიშნებ', 'რისკის', 'რისკი', 'ზრდის', 'შემთხვ', 'ინფორმ', 'მონაცე', 'მითითე', 'კონტექ', 'შემდეგ', 'ნაბიჯი', 'განმარ', 'ზოგადი', 'ზუსტი', 'გამოყე', 'თქვენი', 'თქვენს', 'უფრო', 'ძალიან', 'არსებო', 'მიხედვ', 'შესახე', 'ამიტომ', 'თუმცა', 'რადგან', 'რომელი', 'რომლის', 'ასევე', 'მხოლოდ', 'სადაც', 'აქ', 'ესაა', 'არის', 'იყოს', 'აქვს', 'ხდება', 'წყარო', 'წყაროს', 'მოცემუ', 'ხანგრძ', 'მნიშვნ', 'მაღალი', 'დაბალი', 'ნორმაზ', 'ნორმის', 'მომატე', 'ცვლილე', 'მიზეზი', 'მიზეზე', 'შედეგი', 'შედეგა', 'საათში', 'დღეში', 'წლის', 'ასაკის',
    // English
    'patient', 'patients', 'treatment', 'management', 'clinical', 'disease', 'diseases', 'dose', 'doses', 'dosing', 'adult', 'adults', 'risk', 'risks', 'recommend', 'recommended', 'recommendation', 'recommendations', 'guideline', 'guidelines', 'should', 'with', 'from', 'that', 'this', 'which', 'their', 'have', 'been', 'were', 'will', 'into', 'than', 'more', 'most', 'other', 'such', 'when', 'also', 'used', 'using', 'based', 'study', 'studies', 'evidence', 'review', 'care', 'health', 'medical', 'medicine', 'therapy', 'drug', 'drugs', 'increase', 'increased', 'high', 'higher', 'level', 'levels', 'normal', 'value', 'values', 'information', 'general', 'about', 'after', 'before', 'during', 'between', 'within', 'without', 'years', 'year', 'days', 'hours',
  ].map((w) => w.toLowerCase()),
);

const stem = (t: string) => (/[ა-ჰ]/.test(t) ? t.slice(0, 6) : t.replace(/(ies|es|s)$/, (m) => (m === 'ies' ? 'y' : '')));

/**
 * Specific concepts of a text. A word that belongs to a lexicon concept group
 * („არტერიული წნევა" ≈ „blood pressure") is counted once, as that concept —
 * otherwise one idea written in two languages or two case forms would count as
 * three shared concepts.
 */
export function concepts(text: string): Set<string> {
  const raw = new Set<string>();
  for (const w of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (w.length < 4) continue;
    const s = stem(w);
    if (GENERIC.has(s) || GENERIC.has(w) || /^\d+$/.test(s)) continue;
    raw.add(s);
  }
  const out = new Set<string>();
  const absorbed = new Set<string>();
  for (const g of expandQuery(text).groups) {
    out.add(`concept:${[...g].sort()[0].toLowerCase()}`);
    for (const phrase of g) for (const w of phrase.toLowerCase().split(/[\s-]+/)) if (w.length >= 4) absorbed.add(stem(w));
  }
  for (const r of raw) if (![...absorbed].some((a) => a.startsWith(r) || r.startsWith(a))) out.add(r);
  return out;
}

const sentences = (text: string) =>
  text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

export function mapClaims(answer: string, question: string, passages: Passage[]): ClaimMap {
  const topic = concepts(question);
  const pc = passages.map((p) => ({ p, c: concepts(`${p.title}\n${p.text}`) }));
  // A passage is eligible only if it is about the question's own subject.
  const eligible = pc.filter(({ c }) => [...topic].some((t) => c.has(t)));
  const claims: ClaimLink[] = sentences(answer).map((sentence) => {
    const sc = concepts(sentence);
    if (sc.size < 2) return { sentence, clinical: false, status: 'NOT_A_CLAIM', passage: null, sharedConcepts: [] };
    let best: { p: Passage; shared: string[] } | null = null;
    for (const { p, c } of eligible) {
      const shared = [...sc].filter((t) => c.has(t));
      const enough = shared.length >= 3 && shared.length / sc.size >= 0.3 && shared.some((t) => topic.has(t));
      if (enough && (!best || shared.length > best.shared.length)) best = { p, shared };
    }
    if (!best) return { sentence, clinical: true, status: 'UNSUPPORTED', passage: null, sharedConcepts: [] };
    return {
      sentence,
      clinical: true,
      status: 'LINKED',
      passage: { id: best.p.id, sourceId: best.p.sourceId, kind: best.p.kind, title: best.p.title, excerpt: best.p.text.slice(0, 400) },
      sharedConcepts: best.shared.map((s) => s.replace(/^concept:/, '')),
    };
  });
  const linked = claims.filter((c) => c.status === 'LINKED');
  return {
    claims,
    linkedSourceIds: [...new Set(linked.map((c) => c.passage!.sourceId))],
    clinicalClaims: claims.filter((c) => c.clinical).length,
    linkedClaims: linked.length,
  };
}
