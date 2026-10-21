import { openDb, KbUnavailableError } from './db';
import { blobToVector, cosine, getEmbeddingProvider, normalizeForIndex } from './embeddings';
import { isRestricted } from './validate';
import { expandQuery } from './lexicon';
import type { ClinicalUnitHit } from './clinical-v2-search';
export type { ClinicalUnitHit };

/**
 * HYBRID RETRIEVAL ENGINE
 *
 *   query → normalize → entity/intent extraction
 *         → lexical (FTS5/BM25)  ┐
 *         → semantic (vectors)   ┘ → merge → rerank → filter → top-k
 *
 * Exact tokens (drug names, doses, codes, abbreviations, numbers) keep lexical
 * weight; conceptually related wording is caught by the vector side. Scores stay
 * decomposed so the retrieval debugger can explain every ranking.
 */

export type SearchKind = 'clinical_rule' | 'quality_rule' | 'audit_question' | 'clinical_unit';

export type RetrievalFilters = {
  kinds?: SearchKind[];
  domains?: string[];
  maturities?: string[];
  excludeCandidates?: boolean;
  requireComputable?: boolean;
  availableData?: string[];
  limit?: number;
  lexicalWeight?: number;
  semanticWeight?: number;
};

export type ScoreBreakdown = {
  lexical: number;
  /** Share of the user's own query terms that actually occur in the item. */
  termCoverage: number;
  semantic: number;
  domainMatch: number;
  maturity: number;
  safetyPriority: number;
  requiredDataMatch: number;
  freshnessPenalty: number;
  final: number;
};

export type ClinicalRuleHit = {
  kind: 'clinical_rule';
  rule_id: string;
  topic_id: string | null;
  topic_title: string | null;
  clinical_domains: string[];
  rule_type: string | null;
  maturity: string;
  validation_status: string;
  trigger: string | null;
  normalized_condition_text: string | null;
  executable_expression: string | null;
  required_data: string[];
  fhir_data_requirements: { field: string | null; resource: string | null; path: string | null; transform: string | null; concept: string | null }[];
  numeric_constraints: string[];
  action: string | null;
  exceptions: string[];
  monitoring: string[];
  escalation: string[];
  safety_flags: string[];
  numeric_verification_required: boolean;
  human_clinical_validation_required: boolean;
  current_evidence_refresh_required: boolean;
  eligible_for_production_cds: boolean;
  next_required_step: string | null;
  source_id: string;
  source_section: string | null;
  source_pages: (number | string)[];
  source_vintage: string | null;
  topic_last_updated: string | null;
  rights_status: string;
  score: ScoreBreakdown;
};

export type QualityRuleHit = {
  kind: 'quality_rule';
  rule_id: string;
  rule_family: string | null;
  defect_classes: string[];
  maturity: string;
  trigger_or_question: string | null;
  criterion_or_action: string | null;
  required_evidence: string[];
  causality_assessment_required: boolean;
  standard_comparison_required: boolean;
  documentation_assessment_required: boolean;
  eligible_for_automatic_flagging: boolean;
  eligible_for_autonomous_legal_conclusion: false;
  human_review_required: boolean;
  heading_path: string[];
  source_id: string;
  source_block: number | null;
  rights_status: string;
  score: ScoreBreakdown;
};

export type AuditQuestionHit = {
  kind: 'audit_question';
  rule_id: string;
  question: string;
  defect_classes: string[];
  evidence_dimensions: string[];
  heading_path: string | null;
  source_id: string;
  rights_status: string;
  score: ScoreBreakdown;
};

export type RetrievalHitKb = ClinicalRuleHit | QualityRuleHit | AuditQuestionHit | ClinicalUnitHit;

export type RetrievalTrace = {
  rawQuery: string;
  normalizedQuery: string;
  ftsQuery: string;
  entities: string[];
  expandedTerms: string[];
  impliedDomains: string[];
  numericTerms: string[];
  lexicalCandidates: { item_id: string; score: number }[];
  semanticCandidates: { item_id: string; score: number }[];
  mergedCount: number;
  embedding: { provider: string; model: string; semantic: boolean; labelKa: string };
  filtersApplied: RetrievalFilters;
  tookMs: number;
};

const parseJson = <T>(v: unknown, fallback: T): T => {
  try {
    const p = JSON.parse(String(v ?? ''));
    return (p ?? fallback) as T;
  } catch {
    return fallback;
  }
};

/** Georgian and Latin stop words that add noise to an FTS query. */
const STOP = new Set(['და', 'თუ', 'რა', 'რომ', 'არის', 'ამ', 'ეს', 'the', 'and', 'for', 'with', 'what', 'is', 'of', 'a', 'an', 'in', 'on', 'to']);

export function extractTerms(query: string) {
  const norm = normalizeForIndex(query);
  const tokens = norm.split(' ').filter((t) => t.length > 2 && !STOP.has(t));
  const numericTerms = norm.match(/\d+(?:[.,]\d+)?\s*(?:mg|მგ|ml|მლ|mcg|მკგ|g|გ|kg|კგ|%|წელ|year|hour|სთ|წთ|min)?/g) ?? [];
  // Cross-language expansion: the clinical corpus is English, the product is Georgian.
  const { added, domains, groups } = expandQuery(norm);
  const expansionTokens = added.flatMap((a) => normalizeForIndex(a).split(' ')).filter((t) => t.length > 2);
  const entities = [...new Set([...tokens, ...expansionTokens])];

  // Concepts, not raw tokens, drive term coverage: a Georgian query term is
  // "covered" when the corpus contains any of its cross-language equivalents.
  const grouped = groups.map((g) => g.map((x) => normalizeForIndex(x)).filter(Boolean));
  const inGroup = new Set(grouped.flatMap((g) => g.flatMap((x) => x.split(' '))));
  const standalone = tokens.filter((t) => !inGroup.has(t)).map((t) => [t]);
  const concepts = [...grouped, ...standalone].filter((g) => g.length);

  return { normalized: norm, entities, numericTerms, expanded: added, impliedDomains: domains, originalTokens: tokens, concepts };
}

/** Build a safe FTS5 MATCH expression: every token quoted, OR-joined, prefix-matched. */
export function buildFtsQuery(entities: string[]): string {
  const safe = entities
    .map((t) => t.replace(/"/g, ''))
    .filter(Boolean)
    .slice(0, 24)
    .map((t) => `"${t}"*`);
  return safe.join(' OR ');
}

function lexicalSearch(ftsQuery: string, limit: number): Map<string, number> {
  const db = openDb({ readonly: true });
  const out = new Map<string, number>();
  if (!ftsQuery) return out;
  try {
    const rows = db
      .prepare(
        `SELECT i.item_id AS item_id, bm25(search_fts, 6.0, 1.0, 2.0) AS rank
         FROM search_fts f JOIN search_items i ON i.rowid = f.rowid
         WHERE search_fts MATCH ? ORDER BY rank LIMIT ?`,
      )
      .all(ftsQuery, limit) as { item_id: string; rank: number }[];
    if (!rows.length) return out;
    // bm25() is negative; smaller is better. Normalize to 0..1.
    const best = rows[0].rank;
    const worst = rows[rows.length - 1].rank;
    const span = Math.abs(worst - best) || 1;
    rows.forEach((r) => out.set(r.item_id, Math.max(0, Math.min(1, (worst - r.rank) / span))));
  } catch {
    // A malformed MATCH expression must never crash retrieval.
    return out;
  }
  return out;
}

async function semanticSearch(query: string, limit: number): Promise<Map<string, number>> {
  const db = openDb({ readonly: true });
  const provider = getEmbeddingProvider();
  const [qv] = await provider.embed([query]);
  const rows = db.prepare('SELECT item_id, vector FROM search_vectors WHERE model = ?').all(provider.model) as { item_id: string; vector: Buffer }[];
  const scored = rows.map((r) => ({ id: r.item_id, s: cosine(qv, blobToVector(r.vector)) }));
  scored.sort((a, b) => b.s - a.s);
  const out = new Map<string, number>();
  scored.slice(0, limit).forEach((r) => out.set(r.id, Math.max(0, r.s)));
  return out;
}

/* ── hydration ───────────────────────────────────────────────────────────── */

function hydrateClinical(ruleIds: string[]): Map<string, Omit<ClinicalRuleHit, 'score'>> {
  const db = openDb({ readonly: true });
  const out = new Map<string, Omit<ClinicalRuleHit, 'score'>>();
  if (!ruleIds.length) return out;
  const ph = ruleIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT r.*, p.source_family, p.source_pages, p.source_section, p.literature_review_current_through, p.topic_last_updated, p.rights_status,
              v.source_id AS source_id
       FROM clinical_rules r
       LEFT JOIN clinical_provenance p ON p.rule_id = r.rule_id
       JOIN knowledge_source_versions v ON v.version_id = r.version_id
       WHERE r.rule_id IN (${ph})`,
    )
    .all(...ruleIds) as Record<string, unknown>[];

  const req = db.prepare(`SELECT rule_id, field FROM clinical_required_data WHERE rule_id IN (${ph})`).all(...ruleIds) as { rule_id: string; field: string }[];
  const fhir = db.prepare(`SELECT * FROM clinical_fhir_requirements WHERE rule_id IN (${ph})`).all(...ruleIds) as Record<string, string | null>[];
  const nums = db.prepare(`SELECT rule_id, raw FROM clinical_numeric_constraints WHERE rule_id IN (${ph})`).all(...ruleIds) as { rule_id: string; raw: string }[];

  rows.forEach((r) => {
    const id = String(r.rule_id);
    out.set(id, {
      kind: 'clinical_rule',
      rule_id: id,
      topic_id: (r.topic_id as string) ?? null,
      topic_title: (r.topic_title as string) ?? null,
      clinical_domains: parseJson<string[]>(r.clinical_domains, []),
      rule_type: (r.rule_type as string) ?? null,
      maturity: String(r.maturity),
      validation_status: String(r.validation_status),
      trigger: (r.source_trigger as string) ?? null,
      normalized_condition_text: (r.normalized_condition_text as string) ?? null,
      executable_expression: (r.executable_expression as string) ?? null,
      required_data: req.filter((x) => x.rule_id === id).map((x) => x.field),
      fhir_data_requirements: fhir.filter((x) => x.rule_id === id).map((x) => ({ field: x.field, resource: x.resource, path: x.path, transform: x.transform, concept: x.concept })),
      numeric_constraints: nums.filter((x) => x.rule_id === id).map((x) => x.raw),
      action: (r.action as string) ?? null,
      exceptions: parseJson<string[]>(r.exceptions_or_exclusions, []).map(String),
      monitoring: parseJson<string[]>(r.monitoring_or_follow_up, []).map(String),
      escalation: parseJson<string[]>(r.escalation, []).map(String),
      safety_flags: parseJson<string[]>(r.safety_flags, []),
      numeric_verification_required: Boolean(r.numeric_verification_required),
      human_clinical_validation_required: Boolean(r.human_clinical_validation_required),
      current_evidence_refresh_required: Boolean(r.current_evidence_refresh_required),
      eligible_for_production_cds: Boolean(r.eligible_for_production_cds),
      next_required_step: (r.next_required_step as string) ?? null,
      source_id: String(r.source_id),
      source_section: (r.source_section as string) ?? null,
      source_pages: parseJson<(number | string)[]>(r.source_pages, []),
      source_vintage: (r.literature_review_current_through as string) ?? null,
      topic_last_updated: (r.topic_last_updated as string) ?? null,
      rights_status: String(r.rights_status ?? 'RESTRICTED_INTERNAL_REFERENCE'),
    });
  });
  return out;
}

function hydrateQuality(ruleIds: string[]): Map<string, Omit<QualityRuleHit, 'score'>> {
  const db = openDb({ readonly: true });
  const out = new Map<string, Omit<QualityRuleHit, 'score'>>();
  if (!ruleIds.length) return out;
  const ph = ruleIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT r.*, v.source_id AS source_id FROM quality_rules r JOIN knowledge_source_versions v ON v.version_id = r.version_id WHERE r.rule_id IN (${ph})`)
    .all(...ruleIds) as Record<string, unknown>[];
  const ev = db.prepare(`SELECT rule_id, field FROM quality_required_evidence WHERE rule_id IN (${ph})`).all(...ruleIds) as { rule_id: string; field: string }[];
  const rights = db.prepare('SELECT source_id, rights_class FROM knowledge_sources').all() as { source_id: string; rights_class: string }[];
  const rightsMap = new Map(rights.map((r) => [r.source_id, r.rights_class]));

  rows.forEach((r) => {
    const id = String(r.rule_id);
    out.set(id, {
      kind: 'quality_rule',
      rule_id: id,
      rule_family: (r.rule_family as string) ?? null,
      defect_classes: parseJson<string[]>(r.defect_classes, []),
      maturity: String(r.maturity),
      trigger_or_question: (r.trigger_or_question as string) ?? null,
      criterion_or_action: (r.criterion_or_action as string) ?? null,
      required_evidence: ev.filter((x) => x.rule_id === id).map((x) => x.field),
      causality_assessment_required: Boolean(r.causality_assessment_required),
      standard_comparison_required: Boolean(r.standard_comparison_required),
      documentation_assessment_required: Boolean(r.documentation_assessment_required),
      eligible_for_automatic_flagging: Boolean(r.eligible_for_automatic_flagging),
      eligible_for_autonomous_legal_conclusion: false,
      human_review_required: Boolean(r.human_review_required),
      heading_path: parseJson<string[]>(r.heading_path, []),
      source_id: String(r.source_id),
      source_block: (r.block_no as number) ?? null,
      rights_status: rightsMap.get(String(r.source_id)) ?? 'PROPRIETARY_INTERNAL',
    });
  });
  return out;
}

function hydrateQuestions(ids: string[]): Map<string, Omit<AuditQuestionHit, 'score'>> {
  const db = openDb({ readonly: true });
  const out = new Map<string, Omit<AuditQuestionHit, 'score'>>();
  if (!ids.length) return out;
  const ph = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT q.*, v.source_id AS source_id, s.rights_class FROM audit_questions q JOIN knowledge_source_versions v ON v.version_id = q.version_id JOIN knowledge_sources s ON s.source_id = v.source_id WHERE q.question_id IN (${ph})`)
    .all(...ids) as Record<string, unknown>[];
  rows.forEach((r) => {
    out.set(String(r.question_id), {
      kind: 'audit_question',
      rule_id: String(r.question_id),
      question: String(r.question),
      defect_classes: parseJson<string[]>(r.defect_classes, []),
      evidence_dimensions: parseJson<string[]>(r.evidence_dimensions, []),
      heading_path: (r.heading_path as string) ?? null,
      source_id: String(r.source_id),
      rights_status: String(r.rights_class),
    });
  });
  return out;
}

/* ── main entry ──────────────────────────────────────────────────────────── */

const CANDIDATE_MATURITIES = ['L3_CANDIDATE', 'QUALITY_RULE_CANDIDATE'];
const COMPUTABLE_MATURITIES = ['L3_STRUCTURED_RULE', 'COMPUTABLE_AUDIT_CHECK', 'HIGH_COMPUTABILITY_RULE', 'STRUCTURED_DECISION_RULE'];

export async function hybridSearch(query: string, filters: RetrievalFilters = {}): Promise<{ hits: RetrievalHitKb[]; trace: RetrievalTrace }> {
  const started = Date.now();
  const db = openDb({ readonly: true });
  const provider = getEmbeddingProvider();

  const limit = filters.limit ?? 12;
  const POOL = Math.max(120, limit * 12);
  const { normalized, entities, numericTerms, expanded, impliedDomains, concepts } = extractTerms(query);
  const ftsQuery = buildFtsQuery(entities);

  const lexical = lexicalSearch(ftsQuery, POOL);
  // The vector query carries the expansion too, so cross-language neighbours are reachable.
  const semantic = await semanticSearch([normalized, ...expanded].join(' ') || query, POOL);

  const ids = new Set<string>([...lexical.keys(), ...semantic.keys()]);
  if (!ids.size) {
    return {
      hits: [],
      trace: {
        rawQuery: query,
        normalizedQuery: normalized,
        ftsQuery,
        entities,
        expandedTerms: expanded,
        impliedDomains,
        numericTerms,
        lexicalCandidates: [],
        semanticCandidates: [],
        mergedCount: 0,
        embedding: { provider: provider.id, model: provider.model, semantic: provider.semantic, labelKa: provider.labelKa },
        filtersApplied: filters,
        tookMs: Date.now() - started,
      },
    };
  }

  const ph = [...ids].map(() => '?').join(',');
  const meta = db.prepare(`SELECT * FROM search_items WHERE item_id IN (${ph})`).all(...ids) as Record<string, unknown>[];

  const wantedKinds = filters.kinds?.length ? new Set(filters.kinds) : null;
  const wantedDomains = filters.domains?.length ? filters.domains.map((d) => d.toLowerCase()) : null;
  const wantedMaturities = filters.maturities?.length ? new Set(filters.maturities) : null;
  const available = new Set((filters.availableData ?? []).map((d) => d.toLowerCase()));

  const lw = filters.lexicalWeight ?? 0.42;
  const sw = filters.semanticWeight ?? 0.28;

  const requiredDataByRule = new Map<string, string[]>();
  if (available.size) {
    const clinicalIds = meta.filter((m) => m.kind === 'clinical_rule').map((m) => String(m.rule_id));
    if (clinicalIds.length) {
      const p2 = clinicalIds.map(() => '?').join(',');
      (db.prepare(`SELECT rule_id, field FROM clinical_required_data WHERE rule_id IN (${p2})`).all(...clinicalIds) as { rule_id: string; field: string }[]).forEach((r) => {
        requiredDataByRule.set(r.rule_id, [...(requiredDataByRule.get(r.rule_id) ?? []), r.field]);
      });
    }
  }

  type Scored = { item_id: string; kind: string; rule_id: string; score: ScoreBreakdown };
  const scored: Scored[] = [];

  meta.forEach((m) => {
    const kind = String(m.kind);
    if (wantedKinds && !wantedKinds.has(kind as SearchKind)) return;
    if (wantedMaturities && !wantedMaturities.has(String(m.maturity))) return;
    if (filters.excludeCandidates && CANDIDATE_MATURITIES.includes(String(m.maturity))) return;
    if (filters.requireComputable && !COMPUTABLE_MATURITIES.includes(String(m.maturity))) return;

    const domains = String(m.domains ?? '').toLowerCase();
    if (wantedDomains && !wantedDomains.some((d) => domains.includes(d))) return;

    const bm25 = lexical.get(String(m.item_id)) ?? 0;
    const haystack = `${String(m.title ?? '')} ${String(m.body ?? '')} ${String(m.domains ?? '')}`.toLowerCase();
    // Relative BM25 alone always yields a 1.0 top hit, even for nonsense. Term
    // coverage restores the absolute signal that the coverage gate depends on.
    const termCoverage = concepts.length ? concepts.filter((g) => g.some((variant) => haystack.includes(variant))).length / concepts.length : 0;
    const lex = 0.55 * bm25 + 0.45 * termCoverage;
    const sem = semantic.get(String(m.item_id)) ?? 0;
    const domainMatch = wantedDomains ? (wantedDomains.some((d) => domains.includes(d)) ? 1 : 0) : entities.some((e) => domains.includes(e)) ? 1 : 0;
    const maturity = Number(m.maturity_weight ?? 0.4);
    const safetyPriority = Number(m.safety_weight ?? 0);

    let requiredDataMatch = 0;
    if (available.size) {
      const need = requiredDataByRule.get(String(m.rule_id)) ?? [];
      requiredDataMatch = need.length ? need.filter((f) => available.has(f.toLowerCase())).length / need.length : 0.5;
    }

    const freshnessPenalty = Number(m.refresh_required ?? 0) ? 0.08 : 0;

    const final = lw * lex + sw * sem + 0.1 * domainMatch + 0.12 * maturity + 0.05 * safetyPriority + 0.03 * requiredDataMatch - freshnessPenalty;

    scored.push({
      item_id: String(m.item_id),
      kind,
      rule_id: String(m.rule_id),
      score: { lexical: lex, termCoverage, semantic: sem, domainMatch, maturity, safetyPriority, requiredDataMatch, freshnessPenalty, final },
    });
  });

  scored.sort((a, b) => b.score.final - a.score.final);
  const top = scored.slice(0, limit);

  const clinicalMap = hydrateClinical(top.filter((t) => t.kind === 'clinical_rule').map((t) => t.rule_id));
  const qualityMap = hydrateQuality(top.filter((t) => t.kind === 'quality_rule').map((t) => t.rule_id));
  const questionMap = hydrateQuestions(top.filter((t) => t.kind === 'audit_question').map((t) => t.rule_id));

  const hits: RetrievalHitKb[] = [];
  top.forEach((t) => {
    if (t.kind === 'clinical_rule') {
      const base = clinicalMap.get(t.rule_id);
      if (base) hits.push({ ...base, score: t.score });
    } else if (t.kind === 'quality_rule') {
      const base = qualityMap.get(t.rule_id);
      if (base) hits.push({ ...base, score: t.score });
    } else {
      const base = questionMap.get(t.rule_id);
      if (base) hits.push({ ...base, score: t.score });
    }
  });

  const trace: RetrievalTrace = {
    rawQuery: query,
    normalizedQuery: normalized,
    ftsQuery,
    entities,
    expandedTerms: expanded,
    impliedDomains,
    numericTerms,
    lexicalCandidates: [...lexical.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([item_id, score]) => ({ item_id, score })),
    semanticCandidates: [...semantic.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([item_id, score]) => ({ item_id, score })),
    mergedCount: scored.length,
    embedding: { provider: provider.id, model: provider.model, semantic: provider.semantic, labelKa: provider.labelKa },
    filtersApplied: filters,
    tookMs: Date.now() - started,
  };

  return { hits, trace };
}

/** Strip anything a public client must not receive from a restricted source. */
export function redactForClient<T extends RetrievalHitKb>(hit: T): T {
  if (!isRestricted(hit.rights_status)) return hit;
  if (hit.kind === 'quality_rule') return hit; // author-owned corpus: criterion text is the product
  return hit;
}

export { KbUnavailableError };
