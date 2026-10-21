import { AUDIT_QUESTIONS, QUALITY_RULES, familyLabel } from '@/knowledge/quality-corpus';
import { HashEmbeddingProvider, cosine, normalizeForIndex } from './embeddings';
import { extractTerms, type AuditQuestionHit, type QualityRuleHit, type RetrievalFilters, type RetrievalTrace, type ScoreBreakdown } from './search';

/**
 * OPEN-CORPUS HYBRID SEARCH — the retrieval engine for the public tier.
 *
 * The internal engine (search.ts) runs FTS5/BM25 plus vectors over a SQLite
 * database that holds the licensed clinical corpus; that database is never
 * deployed. The quality-and-defect corpus, however, is the author's own work
 * and ships with the app (authored/quality). This module runs the same hybrid
 * pipeline over it in memory, so quality questions in the public tier are
 * retrieved, gated for coverage, packed into the model's context and verified
 * exactly as they are internally:
 *
 *   query → normalise → lexicon expansion (Georgian ↔ English concepts)
 *         → lexical  (BM25 over stemmed tokens)      ┐
 *         → semantic (offline hashed n-gram vectors) ┘ → merge → top-k
 *
 * Honest limitation: the vector side is the offline hash provider, which
 * captures morphological overlap, not learned meaning. It is labelled as such
 * in the trace. A trained embedding model would add a paid call per question.
 */

type Doc = { id: string; kind: 'quality_rule' | 'audit_question'; text: string; stems: string[]; len: number };

const STOP = new Set(['და', 'თუ', 'რა', 'რომ', 'არის', 'ამ', 'ეს', 'არ', 'ან', 'მისი', 'იყო', 'უნდა', 'the', 'and', 'for', 'with', 'what', 'of', 'in', 'on', 'to']);

/** Georgian declines heavily; a 6-letter prefix is a serviceable stem for retrieval. */
export const stemToken = (t: string) => (/[ა-ჰ]/.test(t) && t.length > 6 ? t.slice(0, 6) : t);
const stemsOf = (text: string) =>
  normalizeForIndex(text)
    .split(' ')
    .filter((t) => t.length > 2 && !STOP.has(t))
    .map(stemToken);

let INDEX: { docs: Doc[]; df: Map<string, number>; avgLen: number; vectors: Float32Array[] } | null = null;
const embedder = new HashEmbeddingProvider();

async function index() {
  if (INDEX) return INDEX;
  const docs: Doc[] = [
    ...QUALITY_RULES.map((r) => {
      const text = [r.criterionKa, r.triggerKa, familyLabel(r.family), ...r.defectClasses.map((d) => d.nameKa), ...r.chapterPath.slice(-2)].filter(Boolean).join(' ');
      const stems = stemsOf(text);
      return { id: r.id, kind: 'quality_rule' as const, text, stems, len: stems.length };
    }),
    ...AUDIT_QUESTIONS.map((q) => {
      const text = [q.questionKa, ...q.defectClasses, ...q.headingPath.slice(-2)].join(' ');
      const stems = stemsOf(text);
      return { id: q.id, kind: 'audit_question' as const, text, stems, len: stems.length };
    }),
  ];
  const df = new Map<string, number>();
  for (const d of docs) for (const s of new Set(d.stems)) df.set(s, (df.get(s) ?? 0) + 1);
  const avgLen = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
  const vectors = await embedder.embed(docs.map((d) => d.text));
  INDEX = { docs, df, avgLen, vectors };
  return INDEX;
}

const RULE_BY_ID = new Map(QUALITY_RULES.map((r) => [r.id, r]));
const QUESTION_BY_ID = new Map(AUDIT_QUESTIONS.map((q) => [q.id, q]));

export async function openCorpusSearch(
  query: string,
  filters: RetrievalFilters = {},
): Promise<{ hits: (QualityRuleHit | AuditQuestionHit)[]; trace: RetrievalTrace }> {
  const started = Date.now();
  const { docs, df, avgLen, vectors } = await index();
  const kinds = filters.kinds?.length ? filters.kinds : ['quality_rule', 'audit_question'];
  const limit = filters.limit ?? 10;

  const terms = extractTerms(query);
  const queryStems = [...new Set([...terms.originalTokens, ...terms.expanded.flatMap((e) => normalizeForIndex(e).split(' '))].filter((t) => t.length > 2 && !STOP.has(t)).map(stemToken))];
  const concepts = terms.concepts.map((g) => [...new Set(g.flatMap((x) => x.split(' ')).filter((t) => t.length > 2).map(stemToken))]).filter((g) => g.length);
  const [qVec] = await embedder.embed([query]);

  const N = docs.length;
  const k1 = 1.2;
  const b = 0.75;
  const scored = docs
    .map((d, i) => {
      if (!kinds.includes(d.kind)) return null;
      const tf = new Map<string, number>();
      for (const s of d.stems) tf.set(s, (tf.get(s) ?? 0) + 1);
      let bm25 = 0;
      for (const q of queryStems) {
        const f = tf.get(q);
        if (!f) continue;
        const n = df.get(q) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        bm25 += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avgLen)));
      }
      const present = new Set(d.stems);
      const termCoverage = concepts.length ? concepts.filter((g) => g.some((s) => present.has(s))).length / concepts.length : 0;
      const semantic = Math.max(0, cosine(qVec, vectors[i]));
      // Absolute, not relative, normalisation: the coverage gate needs to tell
      // "best of a bad lot" from a real match, so the top hit is never forced to 1.
      const lexical = bm25 / (bm25 + 8);
      const final = 0.45 * lexical + 0.3 * termCoverage + 0.25 * semantic;
      return { d, bm25, lexical, termCoverage, semantic, final };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x && x.bm25 > 0))
    .sort((a, b2) => b2.final - a.final || a.d.id.localeCompare(b2.d.id))
    .slice(0, limit);

  const score = (x: (typeof scored)[number]): ScoreBreakdown => ({
    lexical: +x.lexical.toFixed(4),
    termCoverage: +x.termCoverage.toFixed(4),
    semantic: +x.semantic.toFixed(4),
    domainMatch: 0,
    maturity: 0,
    safetyPriority: 0,
    requiredDataMatch: 0,
    freshnessPenalty: 0,
    final: +x.final.toFixed(4),
  });

  const hits = scored.map((x): QualityRuleHit | AuditQuestionHit => {
    if (x.d.kind === 'quality_rule') {
      const r = RULE_BY_ID.get(x.d.id)!;
      return {
        kind: 'quality_rule',
        rule_id: r.id,
        rule_family: r.family,
        defect_classes: r.defectClasses.map((d) => d.code ?? d.nameKa),
        maturity: r.maturity,
        trigger_or_question: r.triggerKa,
        criterion_or_action: r.criterionKa,
        required_evidence: r.requiredEvidence,
        causality_assessment_required: r.needsCausality,
        standard_comparison_required: r.needsStandardComparison,
        documentation_assessment_required: r.needsDocumentationReview,
        eligible_for_automatic_flagging: r.autoFlag,
        eligible_for_autonomous_legal_conclusion: false,
        human_review_required: r.humanReviewRequired,
        heading_path: r.chapterPath,
        source_id: 'GMAI-QUALITY-MANUAL',
        source_block: r.block,
        rights_status: 'author_owned',
        score: score(x),
      };
    }
    const q = QUESTION_BY_ID.get(x.d.id)!;
    return {
      kind: 'audit_question',
      rule_id: q.id,
      question: q.questionKa,
      defect_classes: q.defectClasses,
      evidence_dimensions: q.evidence,
      heading_path: q.headingPath.join(' > ') || null,
      source_id: 'GMAI-QUALITY-MANUAL',
      rights_status: 'author_owned',
      score: score(x),
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
    lexicalCandidates: scored.map((x) => ({ item_id: x.d.id, score: +x.bm25.toFixed(3) })),
    semanticCandidates: scored.map((x) => ({ item_id: x.d.id, score: +x.semantic.toFixed(3) })),
    mergedCount: scored.length,
    embedding: { provider: embedder.id, model: embedder.model, semantic: embedder.semantic, labelKa: embedder.labelKa },
    filtersApplied: filters,
    tookMs: Date.now() - started,
  };

  return { hits, trace };
}
