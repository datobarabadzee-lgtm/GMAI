import type { RetrievalHit, RetrievalQuery, Source } from '@/schemas/evidence';
import { SOURCES } from '@/knowledge/sources';
import { expandQuery } from '@/kb/lexicon';

/**
 * HYBRID RETRIEVAL — vector-ready abstraction.
 *
 * The scoring contract (semantic + lexical + authority + recency) matches what a
 * pgvector/BM25 backend would return, so swapping the in-memory index for a real
 * one only requires replacing `semanticScore` and `lexicalScore`.
 */

const STOP = new Set(['the', 'and', 'for', 'with', 'რა', 'და', 'ის', 'თუ', 'როგორ', 'არის', 'რომელი', 'უნდა']);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}-]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOP.has(t));
}

function sourceCorpus(s: Source): string {
  return [s.title, s.publisher, s.key_finding, s.population, s.applicability, s.excerpt, ...s.keywords, ...s.specialty].join(' ').toLowerCase();
}

/** Lexical (BM25-like) term overlap. */
function lexicalScore(tokens: string[], s: Source): { score: number; matched: string[] } {
  const corpus = sourceCorpus(s);
  const matched = tokens.filter((t) => corpus.includes(t));
  if (!tokens.length) return { score: 0, matched: [] };
  return { score: matched.length / tokens.length, matched: [...new Set(matched)] };
}

/** Placeholder for an embedding similarity; deterministic and explainable today. */
function semanticScore(tokens: string[], s: Source): number {
  const kw = s.keywords.map((k) => k.toLowerCase());
  let hits = 0;
  tokens.forEach((t) => {
    if (kw.some((k) => k.includes(t) || t.includes(k))) hits += 1;
  });
  return tokens.length ? Math.min(1, hits / Math.max(3, tokens.length * 0.6)) : 0;
}

function authorityScore(s: Source): number {
  return 1 - (s.evidence_rank - 1) / 7;
}

function recencyScore(s: Source): number {
  const age = new Date().getFullYear() - s.year;
  if (s.freshness === 'superseded') return 0.1;
  if (s.freshness === 'historical') return 0.45;
  if (age <= 2) return 1;
  if (age <= 5) return 0.85;
  if (age <= 10) return 0.6;
  return 0.4;
}

export function retrieve(query: RetrievalQuery): RetrievalHit[] {
  const text = [query.text, query.pico?.p, query.pico?.i, query.pico?.c, query.pico?.o].filter(Boolean).join(' ');
  // Georgian declines ("ფიბრილაცია" → "ფიბრილაციის"), and the registry is
  // largely indexed in English. Tokens are stemmed, and each recognised concept
  // contributes its controlled English equivalent from the lexicon.
  const english = expandQuery(text).groups.flatMap((g) => g.filter((x) => /^[a-z0-9\s-]+$/i.test(x))).flatMap((x) => tokenize(x));
  const tokens = [...new Set([...tokenize(text).map((t) => (/[ა-ჰ]/.test(t) && t.length > 6 ? t.slice(0, 6) : t)), ...english])];

  const candidates = SOURCES.filter((s) => {
    if (query.sourceTypes.length && !query.sourceTypes.includes(s.source_type)) return false;
    if (query.jurisdictions.length && !query.jurisdictions.includes(s.jurisdiction)) return false;
    if (query.specialties.length && !query.specialties.some((sp) => s.specialty.includes(sp))) return false;
    if (query.yearFrom && s.year < query.yearFrom) return false;
    if (query.onlyCurrent && s.freshness !== 'current') return false;
    return true;
  });

  const hits = candidates.map((s) => {
    const lex = lexicalScore(tokens, s);
    const sem = semanticScore(tokens, s);
    const auth = authorityScore(s);
    const rec = recencyScore(s);
    const score = 0.34 * sem + 0.3 * lex.score + 0.22 * auth + 0.14 * rec;
    return { source: s, score, semantic: sem, lexical: lex.score, authority: auth, recency: rec, matched: lex.matched };
  });

  /**
   * Only genuinely matching sources are returned.
   *
   * This previously fell back to the whole registry when nothing matched, ranked
   * by authority alone — which is how a question about anaemia came back cited to
   * the data-protection act and an interoperability standard. For a system whose
   * promise is that every statement carries a source, an irrelevant citation is
   * worse than none: it teaches the reader not to trust the citations that are
   * real. An empty result is handled upstream as "not covered".
   */
  const MIN_RELEVANCE = 0.12;
  return hits
    .filter((h) => (h.semantic > 0 || h.lexical > 0) && 0.5 * h.semantic + 0.5 * h.lexical >= MIN_RELEVANCE)
    .sort((a, b) => b.score - a.score)
    .slice(0, query.limit);
}

export function retrieveText(text: string, limit = 6): RetrievalHit[] {
  return retrieve({ text, sourceTypes: [], specialties: [], jurisdictions: [], onlyCurrent: false, limit });
}
