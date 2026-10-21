import { appTier } from '@/lib/tier';
import { hybridSearch, type RetrievalFilters, type RetrievalHitKb, type RetrievalTrace, type ClinicalRuleHit, type QualityRuleHit, type AuditQuestionHit } from './search';
import { kbExists, KbUnavailableError, openDb } from './db';
import { openCorpusSearch } from './open-corpus';
import { UNIT_BY_ID } from '@/knowledge/clinical-v2';
import { clinicalV2Context, clinicalV2Search, type ClinicalUnitHit } from './clinical-v2-search';

/**
 * AGENT-FACING RETRIEVAL SERVICE.
 *
 * Adds the two guarantees agents depend on:
 *   1. a COVERAGE GATE — when the internal corpus does not actually cover the
 *      question, the service says so instead of returning weak matches that an
 *      agent might treat as grounding;
 *   2. TOKEN-BOUNDED CONTEXT PACKING — only selected rules ever reach a prompt.
 */

export type Coverage = 'COVERED' | 'PARTIAL' | 'NOT_COVERED' | 'KB_UNAVAILABLE';

export type RetrievalResult = {
  coverage: Coverage;
  messageKa: string;
  hits: RetrievalHitKb[];
  trace: RetrievalTrace | null;
  ruleIds: string[];
};

const STRONG = 0.32;
const WEAK = 0.16;

const QUALITY_KINDS = new Set(['quality_rule', 'audit_question']);

export async function retrieveRules(query: string, filters: RetrievalFilters = {}): Promise<RetrievalResult> {
  // Collection gmai_clinical_v2 (emergency / intensive care) ships with every
  // tier and is searched in memory. It joins the clinical retrieval whenever
  // the caller asks for `clinical_unit`, in the public tier on its own and in
  // the internal tier merged with the SQLite rule base.
  if (filters.kinds?.includes('clinical_unit')) {
    const v2 = await clinicalV2Search(query, { limit: filters.limit ?? 8 });
    const rest = filters.kinds.filter((k) => k !== 'clinical_unit');
    if (!kbExists() || !rest.length) return gateClinicalV2(v2.hits, v2.trace);
    const base = await hybridSearch(query, { ...filters, kinds: rest });
    const merged = [...base.hits, ...strongV2(v2.hits)].sort((a, b) => b.score.final - a.score.final).slice(0, filters.limit ?? 10);
    return gateCoverage(merged, base.trace);
  }

  // The author's quality corpus ships with every tier. Without the internal
  // database it is searched in memory by the open-corpus engine, so a quality
  // question is grounded and coverage-gated in the public tier too.
  if (!kbExists() && filters.kinds?.length && filters.kinds.every((k) => QUALITY_KINDS.has(k))) {
    const { hits, trace } = await openCorpusSearch(query, filters);
    return gateCoverage(hits, trace);
  }
  if (!kbExists()) {
    // In the public tier the internal rule base is absent by design, not by
    // misconfiguration, so the operator-facing import instruction would be both
    // meaningless and alarming to a patient. Grounding there comes from the open
    // source registry, which the answer cites in the usual way.
    return {
      coverage: 'KB_UNAVAILABLE',
      messageKa: appTier() === 'public' ? '' : new KbUnavailableError().messageKa,
      hits: [],
      trace: null,
      ruleIds: [],
    };
  }

  const { hits, trace } = await hybridSearch(query, filters);
  return gateCoverage(hits, trace);
}

/**
 * The clinical collection covers one field (emergency and intensive care). A
 * question outside it is not "unanswerable" — it is simply not this
 * collection's subject — so weak matches are dropped without a warning instead
 * of being passed to the model as grounding.
 */
// A body-only match (no query word in any title) must be very strong to count:
// otherwise "hypothyroidism treatment" grounds itself in a delirium unit.
const strongV2 = (hits: ClinicalUnitHit[]) =>
  hits.filter((h) => h.score.final >= 0.3 && h.score.termCoverage >= 0.5 && (h.score.domainMatch > 0 || h.score.final >= 0.6));

function gateClinicalV2(hits: ClinicalUnitHit[], trace: RetrievalTrace): RetrievalResult {
  const kept = strongV2(hits);
  if (!kept.length) return { coverage: 'NOT_COVERED', messageKa: '', hits: [], trace, ruleIds: [] };
  const gated = gateCoverage(kept, trace);
  return { ...gated, messageKa: gated.coverage === 'NOT_COVERED' ? '' : gated.messageKa };
}

function gateCoverage(hits: RetrievalHitKb[], trace: RetrievalTrace | null): RetrievalResult {
  const best = hits[0]?.score.final ?? 0;
  // A vector space always returns *something*, so ranking alone is not grounding.
  // Two independent signals decide coverage:
  //   · termCoverage — share of query concepts that literally occur in the rule;
  //   · recognizedConcept — whether the query contained any clinical concept the
  //     controlled lexicon knows (which is what makes cross-language retrieval
  //     legitimate rather than coincidental).
  const bestCoverage = Math.max(0, ...hits.map((h) => h.score.termCoverage));
  const recognizedConcept = (trace?.expandedTerms.length ?? 0) > 0;

  let coverage: Coverage;
  let messageKa: string;
  if (!hits.length || best < WEAK || (!recognizedConcept && bestCoverage < 0.5)) {
    coverage = 'NOT_COVERED';
    messageKa =
      'შიდა ცოდნის ბაზაში ამ კითხვაზე რელევანტური წესი ვერ მოიძებნა. პასუხი მოდელის მეხსიერებიდან არ გაიცემა — საჭიროა გარე, აქტუალურ წყაროსთან გადამოწმება ან კორპუსის შევსება.';
  } else if (best < STRONG || (!recognizedConcept && bestCoverage < 0.7)) {
    coverage = 'PARTIAL';
    messageKa = 'შიდა ცოდნის ბაზაში მოიძებნა მხოლოდ ნაწილობრივ რელევანტური მასალა. დასკვნა უნდა ჩაითვალოს არასრულად დასაბუთებულად.';
  } else {
    coverage = 'COVERED';
    messageKa = '';
  }

  return { coverage, messageKa, hits, trace, ruleIds: hits.map((h) => h.rule_id) };
}

/** Rules whose required data the case does not yet provide. */
export function missingRequiredData(hits: RetrievalHitKb[], available: string[]) {
  const have = new Set(available.map((a) => a.toLowerCase()));
  const out: { rule_id: string; field: string; status: 'MISSING' }[] = [];
  hits.forEach((h) => {
    if (h.kind !== 'clinical_rule') return;
    h.required_data.forEach((f) => {
      if (!have.has(f.toLowerCase())) out.push({ rule_id: h.rule_id, field: f, status: 'MISSING' });
    });
  });
  return out;
}

/** Compact, token-bounded rendering of retrieved rules for an LLM prompt. */
export function packContext(hits: RetrievalHitKb[], maxChars = 9000): string {
  const lines: string[] = [];
  let used = 0;
  // Clinical units are never packed one by one: each becomes its whole section,
  // with the topic outline, inside one budget that names anything left out.
  const units = hits.filter((h): h is ClinicalUnitHit => h.kind === 'clinical_unit');
  if (units.length) {
    const ctx = clinicalV2Context(units, Math.max(2000, Math.floor(maxChars * 0.75)));
    lines.push(ctx.text);
    used += ctx.text.length;
  }
  for (const h of hits) {
    if (h.kind === 'clinical_unit') continue;
    let block = '';
    if (h.kind === 'clinical_rule') {
      block = [
        `[RULE ${h.rule_id}] (${h.maturity}; validation=${h.validation_status})`,
        `topic: ${h.topic_title ?? '—'} | domains: ${h.clinical_domains.join(', ') || '—'}`,
        `trigger: ${h.normalized_condition_text ?? h.trigger ?? '—'}`,
        `action: ${h.action ?? '—'}`,
        h.required_data.length ? `required_data: ${h.required_data.join(', ')}` : '',
        h.numeric_constraints.length ? `numeric: ${h.numeric_constraints.join(' ; ')}` : '',
        h.exceptions.length ? `exceptions: ${h.exceptions.join(' ; ')}` : '',
        h.monitoring.length ? `monitoring: ${h.monitoring.join(' ; ')}` : '',
        h.escalation.length ? `escalation: ${h.escalation.join(' ; ')}` : '',
        `provenance: ${h.source_id} pages ${h.source_pages.join(',') || '—'} | vintage ${h.source_vintage ?? '—'} | refresh_required=${h.current_evidence_refresh_required}`,
      ]
        .filter(Boolean)
        .join('\n');
    } else if (h.kind === 'quality_rule') {
      block = [
        `[QRULE ${h.rule_id}] (${h.maturity}; family=${h.rule_family ?? '—'}; human_review=${h.human_review_required})`,
        h.defect_classes.length ? `defect_classes: ${h.defect_classes.join(', ')}` : '',
        h.trigger_or_question ? `question: ${h.trigger_or_question}` : '',
        h.criterion_or_action ? `criterion: ${h.criterion_or_action}` : '',
        h.required_evidence.length ? `required_evidence: ${h.required_evidence.join(', ')}` : '',
        `flags: causality=${h.causality_assessment_required} standard=${h.standard_comparison_required} documentation=${h.documentation_assessment_required}`,
      ]
        .filter(Boolean)
        .join('\n');
    } else if (h.kind === 'audit_question') {
      block = `[AUDITQ ${h.rule_id}] ${h.question}\ndefect_classes: ${h.defect_classes.join(', ') || '—'} | evidence: ${h.evidence_dimensions.join(', ') || '—'}`;
    }
    if (used + block.length > maxChars) break;
    lines.push(block);
    used += block.length;
  }
  return lines.join('\n\n');
}

/** Provenance record attached to every rule-based statement. */
export type ProvenanceEntry = {
  rule_id: string;
  kind: string;
  source_id: string;
  topic: string | null;
  source_section: string | null;
  source_pages: (number | string)[];
  source_vintage: string | null;
  maturity: string;
  validation_status: string;
  refresh_required: boolean;
  rights_status: string;
  /** Deep link into the student page (clinical_unit only). */
  href?: string;
  setting?: string;
};

export function provenanceOf(hits: RetrievalHitKb[]): ProvenanceEntry[] {
  return hits.map((h) => {
    if (h.kind === 'clinical_rule') {
      return {
        rule_id: h.rule_id,
        kind: h.kind,
        source_id: h.source_id,
        topic: h.topic_title,
        source_section: h.source_section,
        source_pages: h.source_pages,
        source_vintage: h.source_vintage,
        maturity: h.maturity,
        validation_status: h.validation_status,
        refresh_required: h.current_evidence_refresh_required,
        rights_status: h.rights_status,
      };
    }
    if (h.kind === 'quality_rule') {
      return {
        rule_id: h.rule_id,
        kind: h.kind,
        source_id: h.source_id,
        topic: h.heading_path.join(' > ') || null,
        source_section: h.heading_path.at(-1) ?? null,
        source_pages: h.source_block !== null ? [h.source_block] : [],
        source_vintage: 'AUTHOR_DRAFT',
        maturity: h.maturity,
        validation_status: 'HUMAN_REVIEW_REQUIRED',
        refresh_required: false,
        rights_status: h.rights_status,
      };
    }
    if (h.kind === 'clinical_unit') {
      return {
        rule_id: h.rule_id,
        kind: h.kind,
        source_id: h.source_id,
        topic: h.topic_title,
        source_section: h.section_title,
        source_pages: [],
        source_vintage: null,
        maturity: 'REFERENCE_KNOWLEDGE',
        validation_status: 'CLINICAL_REVIEW_NOT_PERFORMED',
        refresh_required: false,
        rights_status: h.rights_status,
        href: h.href,
        setting: h.setting,
      };
    }
    const q = h as AuditQuestionHit;
    return {
      rule_id: q.rule_id,
      kind: q.kind,
      source_id: q.source_id,
      topic: q.heading_path,
      source_section: q.heading_path,
      source_pages: [],
      source_vintage: 'AUTHOR_DRAFT',
      maturity: 'AUDIT_QUESTION',
      validation_status: 'HUMAN_REVIEW_REQUIRED',
      refresh_required: false,
      rights_status: q.rights_status,
    };
  });
}

/** Rule ids that actually exist — used to reject any fabricated citation. */
export function existingRuleIds(ids: string[]): Set<string> {
  if (!ids.length) return new Set();
  const v2 = ids.filter((id) => UNIT_BY_ID.has(id));
  if (!kbExists()) return new Set(v2);
  const db = openDb({ readonly: true });
  const ph = ids.map(() => '?').join(',');
  const rows = [
    ...(db.prepare(`SELECT rule_id AS id FROM clinical_rules WHERE rule_id IN (${ph})`).all(...ids) as { id: string }[]),
    ...(db.prepare(`SELECT rule_id AS id FROM quality_rules WHERE rule_id IN (${ph})`).all(...ids) as { id: string }[]),
    ...(db.prepare(`SELECT question_id AS id FROM audit_questions WHERE question_id IN (${ph})`).all(...ids) as { id: string }[]),
  ];
  return new Set([...rows.map((r) => r.id), ...v2]);
}

export type { ClinicalUnitHit };
export type { ClinicalRuleHit, QualityRuleHit, AuditQuestionHit, RetrievalHitKb, RetrievalTrace, RetrievalFilters };
