import 'server-only';

/**
 * OPEN LITERATURE RETRIEVAL
 *
 * Europe PMC REST API — free, no key, covers PubMed/MEDLINE plus preprints
 * and full text for open-access articles. This replaces any dependency on a
 * licensed secondary source: every citation returned here resolves to a
 * publicly reachable record the reader can open and check.
 *
 * Design rules:
 *  - never invent a citation; a citation exists only if Europe PMC returned it
 *  - prefer guidelines, systematic reviews and meta-analyses
 *  - carry the publication year so staleness is visible, not hidden
 *  - fail loudly: an upstream error is reported, not silently swallowed
 */

const BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest';
const UA = 'GMAI-LeaderMed/1.0 (clinical decision support; contact: info@leadermed.ge)';

export type Citation = {
  id: string;
  source: string;
  title: string;
  authors: string | null;
  journal: string | null;
  year: number | null;
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  isOpenAccess: boolean;
  citedBy: number | null;
  abstract: string | null;
  url: string;
  publicationTypes: string[];
  evidenceTier: EvidenceTier;
};

export type EvidenceTier = 'guideline' | 'systematic_review' | 'rct' | 'cohort_or_other' | 'preprint';

export type LiteratureQuery = {
  text: string;
  pico?: { p?: string; i?: string; c?: string; o?: string };
  limit?: number;
  openAccessOnly?: boolean;
  /** Restrict to publications from this year onward. Defaults to 8 years back. */
  fromYear?: number;
  tiers?: EvidenceTier[];
  /** Rank by citation count instead of relevance. Off by default. */
  sortByCitations?: boolean;
};

export type LiteratureResult = {
  query: string;
  hitCount: number;
  citations: Citation[];
  tierCounts: Record<EvidenceTier, number>;
};

const NON_EVIDENCE_TITLE = /\b(abstract book|program(me)? abstracts|abstracts (of|from) the|annual (scientific )?meeting|congress abstracts|poster (session|abstracts))\b|^abstracts?\b|^full .*abstract/i;

const GUIDELINE_TYPES = ['guideline', 'practice guideline', 'consensus development conference'];
const REVIEW_TYPES = ['systematic review', 'meta-analysis'];
const RCT_TYPES = ['randomized controlled trial', 'controlled clinical trial'];
const NON_RESEARCH_TYPES = ['editorial', 'comment', 'letter', 'news', 'erratum', 'published erratum', 'retraction', 'expression of concern'];

/**
 * A study ABOUT guidelines — an audit of compliance, an adherence survey, a
 * quality-improvement project — is not a guideline, whatever its title says
 * (audit F05: PMID 40688888 „Improving Patient Care and Clinical Services:
 * Compliance With … NICE Guidelines for …" was ranked as a guideline).
 */
const STUDY_OF_GUIDELINES =
  /\b(complian\w*|adheren\w*|concordan\w*|implementation of|uptake|awareness|knowledge of|audit|re-?audit|quality improvement|improving patient care|survey|questionnaire|retrospective|cross-sectional|cohort study|case series|practice patterns?)\b/;
const PROTOCOL = /\b(protocol|study design|rationale and design)\b/;

/**
 * Conservative classification. The rank of a publication is raised only on
 * explicit evidence; when the evidence is mixed or missing, it stays at the
 * lowest research tier:
 *   · a preprint stays a preprint, even if it is a systematic review;
 *   · editorials, comments, letters and errata are never ranked as evidence;
 *   · „guideline" requires Europe PMC's publication-type metadata AND a title
 *     that is not a study of guideline use — words like „guideline",
 *     „recommendation" or „consensus" in a title are not enough;
 *   · systematic review / RCT require metadata, the Cochrane journal or an
 *     explicit title — a protocol is not the study.
 */
export function classify(types: string[], isPreprint: boolean, title = '', journal = ''): EvidenceTier {
  const lower = types.map((t) => t.toLowerCase());
  const t = title.toLowerCase();
  const j = journal.toLowerCase();
  const has = (list: string[]) => lower.some((x) => list.some((g) => x === g || x.includes(g)));

  if (isPreprint || lower.includes('preprint')) return 'preprint';
  if (has(NON_RESEARCH_TYPES) && !has(GUIDELINE_TYPES) && !has(REVIEW_TYPES) && !has(RCT_TYPES)) return 'cohort_or_other';
  if (has(GUIDELINE_TYPES) && !STUDY_OF_GUIDELINES.test(t)) return 'guideline';
  if (PROTOCOL.test(t)) return 'cohort_or_other';
  if (has(REVIEW_TYPES)) return 'systematic_review';
  if (j.includes('cochrane database of systematic reviews')) return 'systematic_review';
  if (/\bsystematic review\b|meta-analys|metaanalys|umbrella review|network meta/.test(t)) return 'systematic_review';
  if (has(RCT_TYPES)) return 'rct';
  if (/randomi[sz]ed (controlled )?trial|\brct\b/.test(t) && !/\b(secondary|post[- ]hoc|exploratory) analys/.test(t)) return 'rct';
  return 'cohort_or_other';
}

/** Builds a Europe PMC query string. PICO terms are quoted phrases, ANDed. */
export function buildQuery(q: LiteratureQuery): string {
  const parts: string[] = [];
  const phrase = (s: string) => `"${s.replace(/"/g, ' ').trim()}"`;

  const pico = q.pico ?? {};
  const picoTerms = [pico.p, pico.i, pico.c, pico.o].map((t) => t?.trim()).filter((t): t is string => Boolean(t && t.length > 2));

  if (picoTerms.length) {
    // An element may carry synonyms separated by "|" (e.g. "aged|elderly").
    // Synonyms are ORed inside the element and searched in title+abstract:
    // a full-text hit on "falls" in a reference list is not a study of falls.
    const element = (t: string) => {
      const syn = t.split('|').map((x) => x.trim()).filter((x) => x.length > 2);
      const group = syn.map((x) => `TITLE_ABS:${phrase(x)}`).join(' OR ');
      return syn.length > 1 ? `(${group})` : group;
    };
    parts.push(picoTerms.map(element).join(' AND '));
  } else if (q.text.trim()) {
    const text = q.text.trim();
    // A caller may pass a boolean expression (the low-value registry does).
    // Stripping its parentheses silently changes operator precedence and the
    // query returns nothing, so pass a boolean expression through untouched.
    // A structured query is any text carrying boolean operators, parentheses
    // or a field qualifier such as TITLE:. Stripping quotes from TITLE:"x"
    // turns it into an unscoped free-text search that matches anywhere — the
    // query silently stops being a title search and the results drift.
    const isStructured = /\s(AND|OR|NOT)\s/.test(text) || /[()]/.test(text) || /\b[A-Z_]{2,}:/.test(text);
    parts.push(isStructured ? `(${text})` : text.replace(/[()"]/g, ' ').trim());
  }

  if (!parts.length) return '';

  const fromYear = q.fromYear ?? new Date().getFullYear() - 8;
  parts.push(`(FIRST_PDATE:[${fromYear}-01-01 TO 3000-12-31])`);
  if (q.openAccessOnly !== false) parts.push('(OPEN_ACCESS:y)');
  parts.push('(LANG:eng OR LANG:"" OR LANG:en)');

  return parts.join(' AND ');
}

export async function searchLiterature(q: LiteratureQuery): Promise<LiteratureResult> {
  if (process.env.DISABLE_LIVE_SOURCES === '1') return { query: '', hitCount: 0, citations: [], tierCounts: emptyTiers() };

  const query = buildQuery(q);
  if (!query) return { query: '', hitCount: 0, citations: [], tierCounts: emptyTiers() };

  const limit = Math.min(q.limit ?? 15, 50);
  // Tier filtering discards most records, so widen the page when it is active.
  const pageSize = Math.min(q.tiers?.length ? Math.max(limit * 10, 60) : limit * 2, 100);
  // Default relevance sort. Sorting by citation count surfaces famous papers
  // that merely mention the drug — wrong answer for a targeted drug question.
  const sort = q.sortByCitations ? '&sort=CITED%20desc' : '';
  const url = `${BASE}/search?query=${encodeURIComponent(query)}&format=json&pageSize=${pageSize}&resultType=core${sort}`;

  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new LiteratureError(`Europe PMC ${res.status}`);

  const json = (await res.json()) as {
    hitCount?: number;
    resultList?: { result?: EuropePmcRecord[] };
  };

  const records = json.resultList?.result ?? [];
  // Congress abstract books and meeting programmes match every term somewhere
  // in hundreds of pages; they are not evidence for a single question.
  let citations = records.map(toCitation).filter((c) => !NON_EVIDENCE_TITLE.test(c.title));

  if (q.tiers?.length) citations = citations.filter((c) => q.tiers!.includes(c.evidenceTier));

  // Guidelines and reviews first, then by citation count, then newest.
  const tierRank: Record<EvidenceTier, number> = {
    guideline: 0,
    systematic_review: 1,
    rct: 2,
    cohort_or_other: 3,
    preprint: 4,
  };
  citations.sort(
    (a, b) =>
      tierRank[a.evidenceTier] - tierRank[b.evidenceTier] ||
      (b.citedBy ?? 0) - (a.citedBy ?? 0) ||
      (b.year ?? 0) - (a.year ?? 0),
  );

  const tierCounts = emptyTiers();
  for (const c of citations) tierCounts[c.evidenceTier]++;

  return { query, hitCount: json.hitCount ?? citations.length, citations: citations.slice(0, limit), tierCounts };
}

type EuropePmcRecord = {
  id?: string;
  source?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  journalInfo?: { journal?: { title?: string }; yearOfPublication?: number };
  pubYear?: string;
  abstractText?: string;
  citedByCount?: number;
  isOpenAccess?: string;
  pubTypeList?: { pubType?: string[] | string };
  bookOrReportDetails?: unknown;
};

function toCitation(r: EuropePmcRecord): Citation {
  const types = ((): string[] => {
    const t = r.pubTypeList?.pubType;
    if (!t) return [];
    return Array.isArray(t) ? t : [t];
  })();
  const source = r.source ?? 'MED';
  const id = r.id ?? r.pmid ?? r.doi ?? crypto.randomUUID();
  const year = r.journalInfo?.yearOfPublication ?? (r.pubYear ? Number(r.pubYear) : null);

  return {
    id: `${source}:${id}`,
    source,
    title: (r.title ?? '').replace(/\s+/g, ' ').replace(/\.$/, '').trim(),
    authors: r.authorString?.replace(/\s+/g, ' ').trim() || null,
    journal: r.journalInfo?.journal?.title ?? null,
    year: Number.isFinite(year) ? (year as number) : null,
    doi: r.doi ?? null,
    pmid: r.pmid ?? null,
    pmcid: r.pmcid ?? null,
    isOpenAccess: r.isOpenAccess === 'Y',
    citedBy: typeof r.citedByCount === 'number' ? r.citedByCount : null,
    abstract: r.abstractText ? r.abstractText.replace(/\s+/g, ' ').trim() : null,
    url: r.pmcid
      ? `https://europepmc.org/article/PMC/${r.pmcid}`
      : r.doi
        ? `https://doi.org/${r.doi}`
        : `https://europepmc.org/article/${source}/${id}`,
    publicationTypes: types,
    evidenceTier: classify(types, source === 'PPR', r.title ?? '', r.journalInfo?.journal?.title ?? ''),
  };
}

function emptyTiers(): Record<EvidenceTier, number> {
  return { guideline: 0, systematic_review: 0, rct: 0, cohort_or_other: 0, preprint: 0 };
}

export class LiteratureError extends Error {}

/**
 * Evidence lookup for a single named agent — the question the low-value
 * registry asks: "what does the best research say about THIS drug?"
 *
 * The term is required to appear in the title or keywords, otherwise a
 * guideline that mentions the drug once outranks the trial that tested it.
 * Three passes, widening only when the narrower one is empty.
 */
export async function searchDrugEvidence(term: string, limit = 5): Promise<LiteratureResult> {
  const t = term.replace(/["()]/g, ' ').trim();
  if (t.length < 3) return { query: '', hitCount: 0, citations: [], tierCounts: emptyTiers() };

  const titleAnchor = `TITLE:"${t}"`;
  const looseAnchor = `(TITLE:"${t}" OR KW:"${t}")`;
  const reviewFilter =
    '(JOURNAL:"Cochrane database of systematic reviews" OR TITLE:"systematic review" OR TITLE:"meta-analysis" OR PUB_TYPE:"Guideline" OR PUB_TYPE:"systematic review")';

  const passes: LiteratureQuery[] = [
    // Most precise: the agent is named in the title of a review or guideline.
    { text: `${titleAnchor} AND ${reviewFilter}`, limit, openAccessOnly: false, fromYear: 1995 },
    // Then: named in the title of a trial.
    { text: `${titleAnchor} AND (TITLE:"randomized" OR TITLE:"randomised" OR PUB_TYPE:"randomized controlled trial")`, limit, openAccessOnly: false, fromYear: 1995 },
    // Then: named in the title at all.
    { text: titleAnchor, limit, openAccessOnly: false, fromYear: 1995 },
    // Last resort: keyword match, which is looser and may drift off-target.
    { text: looseAnchor, limit, openAccessOnly: false, fromYear: 2000 },
  ];

  for (const pass of passes) {
    const res = await searchLiterature(pass);
    if (res.citations.length) return res;
  }
  return { query: titleAnchor, hitCount: 0, citations: [], tierCounts: emptyTiers() };
}

export const EVIDENCE_TIER_KA: Record<EvidenceTier, string> = {
  guideline: 'გაიდლაინი',
  systematic_review: 'სისტემური მიმოხილვა / მეტაანალიზი',
  rct: 'რანდომიზებული კვლევა',
  cohort_or_other: 'სხვა დიზაინი',
  preprint: 'პრეპრინტი (არარეცენზირებული)',
};

/** Vancouver-style citation line built only from fields the API returned. */
export function citationText(c: Citation): string {
  // Each part may already end with a full stop (author strings usually do);
  // stripping it before joining avoids "Smith J.. Title".
  const bits = [c.authors, c.title, c.journal, c.year ? String(c.year) : null]
    .filter((b): b is string => Boolean(b))
    .map((b) => b.replace(/[.\s]+$/, ''));
  const tail = c.doi ? ` doi:${c.doi}` : c.pmid ? ` PMID:${c.pmid}` : '';
  return `${bits.join('. ')}.${tail}`;
}
