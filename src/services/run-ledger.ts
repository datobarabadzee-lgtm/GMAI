import type { AgentResult } from '@/schemas/agent';
import { AUDIT_QUESTIONS, QUALITY_RULES } from '@/knowledge/quality-corpus';
import type { Citation } from '@/services/literature';
import { factsFrom, type NumericFact } from '@/services/numeric-facts';

/**
 * RUN LEDGER — what this run actually established, before any model wrote a word.
 *
 * The verifiers (A19, A20) used to check the answer only against internal
 * knowledge-base hits. The public tier has no internal knowledge base, so they
 * checked against an empty list: every number was "unverified", every rule ID
 * from the author's own quality manual looked "fabricated", and the release
 * gate sent every answer to human review with a message about a missing
 * database. That is a verifier that verifies nothing.
 *
 * The ledger is the ground truth instead: rule IDs the agents returned that
 * exist in the shipped corpus, publications they retrieved from Europe PMC,
 * and every number that appears in an agent's deterministic output or in the
 * user's own input. Text a model wrote is checked against it.
 */

const RULE_ID_RE = /\b(?:QDR-\d{5}|QAQ-\d{4})\b/g;
const DOI_RE = /\b10\.\d{4,9}\/[^\s"'<>)\]]+/gi;
const PMID_RE = /\bPMID[:\s]*(\d{6,9})\b/gi;

const CORPUS_IDS = new Set<string>([...QUALITY_RULES.map((r) => r.id), ...AUDIT_QUESTIONS.map((q) => q.id)]);

export const corpusHas = (id: string) => CORPUS_IDS.has(id);

export type RunLedger = {
  /** Corpus rule/question IDs that an agent returned in this run. */
  ruleIds: Set<string>;
  citations: Citation[];
  dois: Set<string>;
  pmids: Set<string>;
  /** Normalised numbers present in agent output or in the user's input. Diagnostic only — never used to verify. */
  numbers: Set<string>;
  /** Typed quantities with context: deterministic agent output (engine/computed) and the user's input (user). */
  facts: NumericFact[];
};

// Agents whose numbers are formula results from the user's own inputs.
const COMPUTING_AGENTS = new Set(['A09']);

const normDoi = (d: string) => d.toLowerCase().replace(/[.,;:]+$/, '');
export const numbersIn = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((d) => String(Number(d.replace(',', '.'))));

function isCitation(x: unknown): x is Citation {
  return Boolean(x && typeof x === 'object' && 'title' in x && ('doi' in x || 'pmid' in x) && 'evidenceTier' in x);
}

function collectCitations(value: unknown, out: Citation[], depth = 0): void {
  if (depth > 4 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const v of value) collectCitations(v, out, depth + 1);
    return;
  }
  if (isCitation(value)) {
    out.push(value);
    return;
  }
  for (const v of Object.values(value)) collectCitations(v, out, depth + 1);
}

export function resultText(r: AgentResult): string {
  return [r.summary, r.note, ...r.claims, ...r.sections.flatMap((s) => [s.titleKa, s.body, ...s.bullets])].join('\n');
}

export function buildLedger(results: Iterable<AgentResult>, inputText: string): RunLedger {
  const ruleIds = new Set<string>();
  const citations: Citation[] = [];
  const numbers = new Set<string>(numbersIn(inputText));
  const facts: NumericFact[] = factsFrom(inputText, 'user', 'input');

  for (const r of results) {
    if (r.status !== 'ok') continue;
    const text = resultText(r);
    facts.push(...factsFrom(text, COMPUTING_AGENTS.has(r.agentId) ? 'computed' : 'engine', r.agentId));
    let dataText = '';
    try {
      dataText = JSON.stringify(r.data ?? {});
    } catch {
      dataText = '';
    }
    for (const id of `${text}\n${dataText}`.match(RULE_ID_RE) ?? []) if (CORPUS_IDS.has(id)) ruleIds.add(id);
    collectCitations(r.data, citations);
    for (const n of numbersIn(`${text}\n${dataText}`)) numbers.add(n);
  }

  const dois = new Set(citations.map((c) => c.doi).filter((d): d is string => Boolean(d)).map(normDoi));
  const pmids = new Set(citations.map((c) => c.pmid).filter((p): p is string => Boolean(p)));
  return { ruleIds, citations, dois, pmids, numbers, facts };
}

/* ── literature reference check ──────────────────────────────────────────── */

export type ReferenceCheck = { ref: string; kind: 'doi' | 'pmid'; status: 'RETRIEVED' | 'NOT_RETRIEVED' };

/** A DOI or PMID in model-written text must be one the agents actually retrieved. */
export function verifyReferences(text: string, ledger: RunLedger): ReferenceCheck[] {
  const out: ReferenceCheck[] = [];
  for (const d of text.match(DOI_RE) ?? []) {
    const n = normDoi(d);
    out.push({ ref: n, kind: 'doi', status: ledger.dois.has(n) ? 'RETRIEVED' : 'NOT_RETRIEVED' });
  }
  for (const m of text.matchAll(PMID_RE)) out.push({ ref: m[1], kind: 'pmid', status: ledger.pmids.has(m[1]) ? 'RETRIEVED' : 'NOT_RETRIEVED' });
  return out;
}

export function scrubReferences(text: string, bad: ReferenceCheck[]): string {
  let t = text;
  for (const b of bad) {
    if (b.kind === 'doi') t = t.replace(new RegExp(`(doi:\\s*)?${b.ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[.,;:]*`, 'gi'), '[მითითება უარყოფილია: ამ კითხვაზე არ მოძიებულა]');
    else t = t.replace(new RegExp(`PMID[:\\s]*${b.ref}`, 'g'), '[მითითება უარყოფილია: ამ კითხვაზე არ მოძიებულა]');
  }
  return t;
}

/* ── freshness of the literature this run relied on ──────────────────────── */

export type LedgerFreshness = { status: 'CURRENT' | 'REFRESH_REQUIRED' | 'UNCERTAIN'; newestYear: number | null; messageKa: string };

export function ledgerFreshness(ledger: RunLedger, now = new Date().getFullYear()): LedgerFreshness {
  const strong = ledger.citations.filter((c) => c.evidenceTier === 'guideline' || c.evidenceTier === 'systematic_review');
  if (!strong.length) return { status: 'UNCERTAIN', newestYear: null, messageKa: '' };
  const newest = Math.max(...strong.map((c) => c.year ?? 0));
  if (newest && now - newest > 5) {
    return { status: 'REFRESH_REQUIRED', newestYear: newest, messageKa: `ყველაზე ახალი მოძიებული გაიდლაინი/სისტემური მიმოხილვა ${newest} წლისაა — შეამოწმეთ უფრო ახალი რეკომენდაცია.` };
  }
  return { status: 'CURRENT', newestYear: newest || null, messageKa: '' };
}
