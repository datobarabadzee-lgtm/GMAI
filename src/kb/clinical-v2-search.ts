import 'server-only';
import {
  CLINICAL_UNITS,
  SETTING_KA,
  TOPIC_TWINS,
  UNIT_BY_ID,
  sectionUnits,
  topicOutline,
  unitHref,
  unitText,
  type ClinicalSetting,
  type ClinicalType,
  type ClinicalUnit,
} from '@/knowledge/clinical-v2';
import { HashEmbeddingProvider, cosine, normalizeForIndex } from './embeddings';
import { extractTerms, type RetrievalTrace, type ScoreBreakdown } from './search';
import { stemToken } from './open-corpus';

/**
 * HYBRID SEARCH over the gmai_clinical_v2 collection.
 *
 *   query → normalise → lexicon expansion (Georgian ↔ English concepts)
 *         → lexical  (BM25 over stemmed tokens, titles weighted)  ┐
 *         → vector   (offline hashed n-gram vectors)              ┘ → merge
 *
 * The vector side is the same offline hash provider the rest of the public
 * tier uses: it captures shared word forms, not learned meaning. Semantic
 * search with a trained embedding model is NOT enabled; the trace says so.
 * The unit is the ranking grain; the SECTION is the smallest context ever
 * returned (context_unit_ids), together with the topic outline.
 */

export type ClinicalUnitHit = {
  kind: 'clinical_unit';
  rule_id: string;
  collection: 'gmai_clinical_v2';
  topic_id: string;
  topic_title: string;
  section_id: string;
  section_title: string;
  unit_title: string;
  setting: ClinicalSetting;
  clinical_types: ClinicalType[];
  context_unit_ids: string[];
  matched_item_ids: string[];
  snippet: string;
  href: string;
  has_media: boolean;
  source_id: 'GMAI-CLINICAL-V2';
  rights_status: 'provided_by_owner';
  score: ScoreBreakdown;
};

export type ClinicalV2Filters = {
  setting?: ClinicalSetting;
  clinicalType?: ClinicalType;
  topicId?: string;
  category?: string;
  limit?: number;
};

const STOP = new Set(['და', 'თუ', 'რა', 'რომ', 'არის', 'ამ', 'ეს', 'არ', 'ან', 'მისი', 'იყო', 'უნდა', 'როგორ', 'რომელი', 'როდის', 'რატომ', 'the', 'and', 'for', 'with', 'what', 'of', 'in', 'on', 'to', 'how']);
const stemsOf = (text: string) =>
  normalizeForIndex(text)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stemToken);

/**
 * Section words every clinical text uses („უკუჩვენებები", „დოზა", „მართვა").
 * They may rank, but they never count as a title match or as covering the
 * question: „ავასტინის უკუჩვენებები" must not be grounded in the stroke
 * thrombolysis contraindication list just because both say „უკუჩვენებები".
 */
const GENERIC_WORDS = [
  'უკუჩვენება', 'უკუჩვენებები', 'ჩვენება', 'ჩვენებები', 'დოზა', 'დოზები', 'დოზირება', 'გვერდითი', 'მოვლენა', 'მოვლენები', 'მკურნალობა', 'მართვა',
  'პაციენტი', 'პაციენტები', 'მიღება', 'ინსტრუქცია', 'შეფასება', 'გართულება', 'გართულებები', 'რისკი', 'საწყისი', 'მიუთითეთ',
  'contraindication', 'contraindications', 'indication', 'indications', 'dose', 'doses', 'dosing', 'dosage', 'treatment', 'management', 'patient', 'patients', 'side', 'effect', 'effects', 'adverse', 'reaction', 'reactions', 'risk',
];
let GENERIC: Set<string> | null = null;
const generic = () => (GENERIC ??= new Set(GENERIC_WORDS.map((w) => stemToken(normalizeForIndex(w)))));

type Doc = { u: ClinicalUnit; stems: string[]; titleStems: Set<string>; len: number };
let INDEX: { docs: Doc[]; df: Map<string, number>; avgLen: number; vectors: Float32Array[] } | null = null;
const embedder = new HashEmbeddingProvider();

async function index() {
  if (INDEX) return INDEX;
  const docs: Doc[] = CLINICAL_UNITS.map((u) => {
    const titles = `${u.topic_title} ${u.section_title} ${u.title}`;
    const body = unitText(u);
    const stems = stemsOf(`${titles} ${body}`);
    return { u, stems, titleStems: new Set(stemsOf(titles)), len: stems.length };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const s of new Set(d.stems)) df.set(s, (df.get(s) ?? 0) + 1);
  const avgLen = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
  const vectors = await embedder.embed(docs.map((d) => `${d.u.topic_title} ${d.u.section_title} ${d.u.title} ${unitText(d.u).slice(0, 4000)}`));
  INDEX = { docs, df, avgLen, vectors };
  return INDEX;
}

export async function clinicalV2Search(query: string, filters: ClinicalV2Filters = {}): Promise<{ hits: ClinicalUnitHit[]; trace: RetrievalTrace }> {
  const started = Date.now();
  const { docs, df, avgLen, vectors } = await index();
  const limit = filters.limit ?? 8;
  const terms = extractTerms(query);
  const queryStems = [
    ...new Set(
      [...normalizeForIndex(query).split(' '), ...terms.expanded.flatMap((e) => normalizeForIndex(e).split(' '))]
        .filter((t) => t.length > 1 && !STOP.has(t))
        .map(stemToken),
    ),
  ];
  const G = generic();
  const concepts = terms.concepts
    .map((g) => [...new Set(g.flatMap((x) => x.split(' ')).filter((t) => t.length > 1).map(stemToken))])
    .filter((g) => g.length && !g.every((x) => G.has(x)));
  const specificStems = new Set(queryStems.filter((x) => !G.has(x)));
  // A question made only of section words names no clinical subject.
  if (!specificStems.size) concepts.length = 0;
  const [qVec] = await embedder.embed([query]);

  const N = docs.length;
  const k1 = 1.2;
  const b = 0.75;
  const scored = docs
    .map((d, i) => {
      const u = d.u;
      if (filters.setting && u.setting !== filters.setting) return null;
      if (filters.clinicalType && !u.clinical_types.includes(filters.clinicalType)) return null;
      if (filters.topicId && u.topic_id !== filters.topicId) return null;
      const tf = new Map<string, number>();
      for (const s of d.stems) tf.set(s, (tf.get(s) ?? 0) + 1);
      let bm25 = 0;
      let titleHits = 0;
      for (const q of queryStems) {
        const f = tf.get(q);
        if (!f) continue;
        const n = df.get(q) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        bm25 += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avgLen)));
        if (d.titleStems.has(q) && specificStems.has(q)) titleHits += 1;
      }
      if (bm25 <= 0) return null;
      const present = new Set(d.stems);
      const termCoverage = concepts.length ? concepts.filter((g) => g.some((s) => present.has(s))).length / concepts.length : 0;
      if (!specificStems.size) return null;
      const semantic = Math.max(0, cosine(qVec, vectors[i]));
      const lexical = bm25 / (bm25 + 8);
      const title = queryStems.length ? Math.min(1, titleHits / queryStems.length) : 0;
      const final = 0.4 * lexical + 0.3 * termCoverage + 0.15 * semantic + 0.15 * title;
      return { d, bm25, lexical, termCoverage, semantic, title, final };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, c) => c.final - a.final || a.d.u.id.localeCompare(c.d.u.id))
    .slice(0, limit);

  const hits: ClinicalUnitHit[] = scored.map((x) => {
    const u = x.d.u;
    const matched = u.items.filter((it) => {
      const s = new Set(stemsOf(`${it.text} ${(it.rows ?? []).flat().join(' ')}`));
      return queryStems.some((q) => s.has(q));
    });
    const best = matched.find((it) => it.kind !== 'heading') ?? matched[0] ?? u.items.find((it) => it.kind !== 'heading') ?? u.items[0];
    const snippetSrc = best ? (best.kind === 'table' && best.rows ? best.rows.map((r) => r.filter(Boolean).join(' · ')).join(' / ') : best.text) : '';
    return {
      kind: 'clinical_unit',
      rule_id: u.id,
      collection: 'gmai_clinical_v2',
      topic_id: u.topic_id,
      topic_title: u.topic_title,
      section_id: u.section_id,
      section_title: u.section_title,
      unit_title: u.title,
      setting: u.setting,
      clinical_types: u.clinical_types,
      context_unit_ids: u.context_unit_ids,
      matched_item_ids: matched.map((it) => it.id),
      snippet: snippetSrc.length > 260 ? `${snippetSrc.slice(0, 257)}…` : snippetSrc,
      href: unitHref(u),
      has_media: u.items.some((it) => it.media.length > 0),
      source_id: 'GMAI-CLINICAL-V2',
      rights_status: 'provided_by_owner',
      score: {
        lexical: +x.lexical.toFixed(4),
        termCoverage: +x.termCoverage.toFixed(4),
        semantic: +x.semantic.toFixed(4),
        // Title agreement (topic / section / unit titles vs. query stems). Kept
        // in domainMatch so the shared ScoreBreakdown shape stays unchanged.
        domainMatch: +x.title.toFixed(4),
        maturity: 0,
        safetyPriority: 0,
        requiredDataMatch: 0,
        freshnessPenalty: 0,
        final: +x.final.toFixed(4),
      },
    };
  });

  const trace: RetrievalTrace = {
    rawQuery: query,
    normalizedQuery: terms.normalized,
    ftsQuery: queryStems.join(' OR '),
    entities: terms.entities,
    expandedTerms: terms.expanded,
    impliedDomains: terms.impliedDomains,
    numericTerms: terms.numericTerms,
    lexicalCandidates: scored.map((x) => ({ item_id: x.d.u.id, score: +x.bm25.toFixed(3) })),
    semanticCandidates: scored.map((x) => ({ item_id: x.d.u.id, score: +x.semantic.toFixed(3) })),
    mergedCount: scored.length,
    embedding: { provider: embedder.id, model: embedder.model, semantic: embedder.semantic, labelKa: `${embedder.labelKa} — სემანტიკური ძიება ჩართული არ არის` },
    filtersApplied: { kinds: ['clinical_unit'], limit },
    tookMs: Date.now() - started,
  };
  return { hits, trace };
}

/**
 * The context an agent receives for a set of hits: every hit expanded to its
 * whole section, sections grouped by topic with the topic outline, settings
 * labelled. Nothing is cut silently — a section that does not fit is named
 * with an explicit instruction not to use its numbers.
 */
export function clinicalV2Context(hits: (Pick<ClinicalUnitHit, 'section_id' | 'topic_id'> & { rule_id?: string })[], maxChars = 9000): { text: string; sectionIds: string[]; omittedSectionIds: string[]; partialSectionIds: string[]; unitIds: string[] } {
  const sections: string[] = [];
  for (const h of hits) if (!sections.includes(h.section_id)) sections.push(h.section_id);
  const byTopic = new Map<string, string[]>();
  for (const sid of sections) {
    const t = sectionUnits(sid)[0]?.topic_id;
    if (t) byTopic.set(t, [...(byTopic.get(t) ?? []), sid]);
  }
  const blocks: string[] = [];
  const included: string[] = [];
  const omitted: string[] = [];
  const unitIds: string[] = [];
  const partialIds: string[] = [];
  let used = 0;
  const header =
    'კლინიკური ცოდნის კოლექცია gmai_clinical_v2 (გადაუდებელი მედიცინა / ინტენსიური თერაპია). საცნობარო მასალაა: კლინიკური ვალიდაცია არ ჩატარებულა და უახლეს გაიდლაინებთან არ შედარებულა. დოზა გამოიყენე მხოლოდ მისი პირობებით (პაციენტის ჯგუფი, ერთეული, სიხშირე, გამონაკლისები); გადაუდებელი და ინტენსიური გარემოს მასალა არ გააერთიანო.';
  blocks.push(header);
  used += header.length;

  for (const [topicId, sids] of byTopic) {
    const first = sectionUnits(sids[0])[0];
    const outline = topicOutline(topicId);
    const twins = TOPIC_TWINS.get(topicId) ?? [];
    const topicHead = [
      `### თემა: ${first.topic_title} [${topicId}] — გარემო: ${SETTING_KA[first.setting]}${twins.length ? ` (ეს თემა გვხვდება სხვა გარემოშიც: ${twins.map((t) => `${t.title} — ${SETTING_KA[t.setting]}`).join('; ')}. ვერსიები არ გააერთიანო; განსხვავება აღნიშნე)` : ''}`,
      `თემის სტრუქტურა (${outline.length} სექცია; აქ მოცემულია ${sids.length}): ${outline.map((s) => s.title).join(' · ')}`,
    ].join('\n');
    blocks.push(topicHead);
    used += topicHead.length;
    for (const sid of sids) {
      const units = sectionUnits(sid);
      const body = [`#### სექცია: ${units[0].section_title} [${sid}] — ბმული: ${unitHref(units[0])}`, ...units.map((u) => `[${u.id}] ${u.title}\n${unitText(u, { media: true })}`)].join('\n');
      if (used + body.length > maxChars) {
        // The whole section does not fit. Fall back to the matched units in
        // full, in reading order, and name every unit of the section that was
        // left out — never a fragment of a unit, never a silent cut.
        const wanted = new Set(hits.filter((h) => h.section_id === sid && h.rule_id).map((h) => h.rule_id as string));
        const picked = units.filter((u) => wanted.has(u.id));
        const partial = picked.length
          ? [
              `#### სექცია: ${units[0].section_title} [${sid}] — ბმული: ${unitHref(units[0])}`,
              `სექცია სრულად (${body.length} სიმბოლო) არ ჩაეტია; ქვემოთ მოცემულია მხოლოდ შესაბამისი ერთეულები სრულად. გამოტოვებული ერთეულები: ${units
                .filter((u) => !wanted.has(u.id))
                .map((u) => `${u.title} [${u.id}]`)
                .join('; ')}. მათზე დამოკიდებული რიცხვი, დოზა ან კრიტერიუმი არ გამოიყენო — მიუთითე ბმული.`,
              ...picked.map((u) => `[${u.id}] ${u.title}\n${unitText(u, { media: true })}`),
            ].join('\n')
          : '';
        if (partial && used + partial.length <= maxChars) {
          blocks.push(partial);
          used += partial.length;
          included.push(sid);
          partialIds.push(sid);
          unitIds.push(...picked.map((u) => u.id));
          continue;
        }
        const note = `#### სექცია: ${units[0].section_title} [${sid}] — სრული ტექსტი (${body.length} სიმბოლო) კონტექსტში არ ჩაეტია. ამ სექციიდან რიცხვი, დოზა ან კრიტერიუმი არ გამოიყენო; მომხმარებელს მიუთითე ბმული: ${unitHref(units[0])}`;
        blocks.push(note);
        used += note.length;
        omitted.push(sid);
        continue;
      }
      blocks.push(body);
      used += body.length;
      included.push(sid);
      unitIds.push(...units.map((u) => u.id));
    }
  }
  return { text: blocks.join('\n\n'), sectionIds: included, omittedSectionIds: omitted, partialSectionIds: partialIds, unitIds };
}
