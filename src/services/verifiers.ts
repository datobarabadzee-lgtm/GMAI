import type { RetrievalHitKb } from '@/kb/search';
import { existingRuleIds } from '@/kb/retrieval-service';
import { UNIT_BY_ID, unitText } from '@/knowledge/clinical-v2';
import { contextOf, drugsIn, extractQuantities, factsFrom, supports, type FactContext, type FactOrigin, type NumericFact, type Quantity } from './numeric-facts';

/**
 * VERIFIERS — numeric, citation, freshness, contradiction.
 *
 * Each runs as an explicit, separate step. A confident-sounding generated number
 * is never trusted; a citation that does not resolve to a retrieved rule is
 * rejected outright.
 */

/* ── numeric verifier ────────────────────────────────────────────────────── */

export type NumericClaim = {
  text: string;
  kind: 'dose' | 'threshold' | 'duration' | 'interval' | 'age_cutoff' | 'lab_threshold' | 'timing_window' | 'other';
  value: string;
  /**
   * VERIFIED_AGAINST_RULE — a retrieved source passage states the same quantity in the same context;
   * VERIFIED_AGAINST_ENGINE — this run's deterministic agent output (or a formula with its inputs) states it;
   * USER_PROVIDED — the number is the user's own input, restated; it is a fact they gave, not an approved value;
   * UNVERIFIED — no evidence with the same value, unit, drug, route, frequency and population.
   */
  status: 'VERIFIED_AGAINST_RULE' | 'VERIFIED_AGAINST_ENGINE' | 'USER_PROVIDED' | 'UNVERIFIED' | 'CONFLICT';
  supportingRuleIds: string[];
  /** The passage that supports the claim, so a person can check it. */
  evidence: { origin: FactOrigin; sourceId: string; passage: string } | null;
  unit: string | null;
  context: FactContext;
  noteKa: string;
};

export function extractNumericClaims(text: string): { text: string; kind: NumericClaim['kind']; value: string }[] {
  return claimQuantities(text).map((q) => ({ text: q.raw, kind: q.kind, value: q.raw }));
}

const claimQuantities = (text: string) => extractQuantities(text).filter((q) => q.unit || q.comparator || q.dim === 'age');

/** A clinical_unit hit is verified against its whole section, never a lone number. */
function clinicalSectionText(unitIds: string[]): string {
  return unitIds.map((id) => UNIT_BY_ID.get(id)).filter((u): u is NonNullable<typeof u> => Boolean(u)).map((u) => unitText(u)).join('\n');
}

export function hitText(h: RetrievalHitKb): string {
  return String(
    h.kind === 'clinical_rule'
      ? [h.action, h.trigger, h.normalized_condition_text, ...h.numeric_constraints, ...h.exceptions, ...h.monitoring, ...h.escalation].filter(Boolean).join('. ')
      : h.kind === 'quality_rule'
        ? [h.trigger_or_question, h.criterion_or_action].filter(Boolean).join('. ')
        : h.kind === 'clinical_unit'
          ? clinicalSectionText(h.context_unit_ids)
          : h.question,
  );
}

/**
 * Each number in the answer is checked as a quantity in context (see
 * numeric-facts.ts): evidence must state the same value with a compatible unit
 * of the same kind, about the same drug, without a conflicting route,
 * frequency or population. A bare number — an untyped ledger entry, an age, a
 * year — supports nothing that carries a unit.
 *
 * `ledger` may be a list of typed facts (the run ledger's `facts`) or, for old
 * callers, a set of untyped numbers; the latter can no longer verify anything
 * with a unit.
 */
export function verifyNumerics(answerText: string, hits: RetrievalHitKb[], ledger?: Set<string> | NumericFact[] | { facts: NumericFact[] }): NumericClaim[] {
  const quantities = claimQuantities(answerText);
  if (!quantities.length) return [];
  const answerDrugs = drugsIn(answerText);
  const ruleFacts = hits.flatMap((h) => factsFrom(hitText(h), 'rule', h.rule_id));
  const typed: NumericFact[] = Array.isArray(ledger) ? ledger : ledger && 'facts' in ledger ? ledger.facts : [];
  const untyped = ledger instanceof Set ? ledger : null;

  const seen = new Set<string>();
  const out: NumericClaim[] = [];
  for (const q of quantities) {
    const key = `${q.kind}:${q.raw.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const passage = answerText.slice(Math.max(0, answerText.lastIndexOf('\n', q.index)), answerText.indexOf('\n', q.index) === -1 ? undefined : answerText.indexOf('\n', q.index));
    const sentence = passage.split(/(?<=[.;!?])\s+/).find((x) => x.includes(q.raw)) ?? passage;
    const claim: NumericFact = { ...q, context: contextOf(sentence), scopeDrugs: answerDrugs, passage: sentence.trim().slice(0, 300), origin: 'engine', sourceId: 'answer' };

    let best: NumericFact | null = null;
    let mismatch = '';
    const tryAll = (facts: NumericFact[]) => {
      for (const f of facts) {
        const m = supports(claim, f);
        if (m.ok) return f;
        if (!mismatch && sameNumber(q, f)) mismatch = m.reason;
      }
      return null;
    };
    const rule = tryAll(ruleFacts);
    const engine = rule ? null : tryAll(typed.filter((f) => f.origin === 'engine' || f.origin === 'computed'));
    const user = rule || engine ? null : tryAll(typed.filter((f) => f.origin === 'user'));
    best = rule ?? engine ?? user;
    // Old untyped ledgers: only a unitless number can still be matched by value.
    const untypedOk = !best && untyped && !q.unit && q.dim === 'none' && q.values.every((v) => untyped.has(String(v)));

    const status: NumericClaim['status'] = rule ? 'VERIFIED_AGAINST_RULE' : engine || untypedOk ? 'VERIFIED_AGAINST_ENGINE' : user ? 'USER_PROVIDED' : 'UNVERIFIED';
    out.push({
      text: q.raw,
      kind: q.kind,
      value: q.raw,
      status,
      supportingRuleIds: rule ? [rule.sourceId] : [],
      evidence: best ? { origin: best.origin, sourceId: best.sourceId, passage: best.passage } : null,
      unit: q.unit,
      context: claim.context,
      noteKa:
        status === 'VERIFIED_AGAINST_RULE'
          ? 'იგივე სიდიდე (მნიშვნელობა, ერთეული, კონტექსტი) მოცემულია მოძიებული წყაროს ფრაგმენტში; საბოლოო დადასტურება კლინიცისტს ეკუთვნის.'
          : status === 'VERIFIED_AGAINST_ENGINE'
            ? best?.origin === 'computed'
              ? 'მნიშვნელობა გამოთვლილია დეტერმინისტული ფორმულით თქვენი შეყვანილი მონაცემებიდან.'
              : 'იგივე სიდიდე (მნიშვნელობა, ერთეული, კონტექსტი) მოდის ამ მოთხოვნის დეტერმინისტული აგენტის შედეგიდან.'
            : status === 'USER_PROVIDED'
              ? 'ეს თქვენ მიერ მოწოდებული მნიშვნელობაა — სისტემა მას არ ამოწმებს და სწორ დანიშნულებად არ ადასტურებს.'
              : `რიცხვითი მნიშვნელობა მოძიებულ წყაროებში ან აგენტების შედეგში იმავე კონტექსტით არ დადასტურდა${mismatch ? ` (${mismatch})` : ''} — არ გამოიყენოთ დანიშვნისთვის დამოუკიდებელი გადამოწმების გარეშე.`,
    });
    if (out.length > 60) break;
  }
  return out;
}

const sameNumber = (a: Quantity, b: Quantity) => a.values.length === b.values.length && a.values.every((v, i) => v === b.values[i]);

/* ── citation verifier ───────────────────────────────────────────────────── */

export type CitationCheck = {
  ruleId: string;
  status: 'SUPPORTED' | 'PARTIALLY_SUPPORTED' | 'UNSUPPORTED' | 'CONFLICT';
  reasonKa: string;
};

/**
 * Any rule id an agent cites must be (a) real and (b) actually retrieved.
 * "Real" means present in the internal knowledge base OR in the shipped
 * quality corpus; "retrieved" means returned for this request by the KB search
 * OR by an agent of this run. Without the second source every corpus ID looks
 * fabricated in the public tier, where the internal KB is absent by design.
 */
export function verifyCitations(
  citedRuleIds: string[],
  retrieved: RetrievalHitKb[],
  extra?: { known: (id: string) => boolean; returned: Set<string> },
): { checks: CitationCheck[]; fabricated: string[] } {
  const retrievedIds = new Set([...retrieved.map((h) => h.rule_id), ...(extra?.returned ?? [])]);
  const unique = [...new Set(citedRuleIds.filter(Boolean))];
  const real = existingRuleIds(unique);
  if (extra) for (const id of unique) if (extra.known(id)) real.add(id);

  const checks: CitationCheck[] = [];
  const fabricated: string[] = [];

  unique.forEach((id) => {
    if (!real.has(id)) {
      fabricated.push(id);
      checks.push({ ruleId: id, status: 'UNSUPPORTED', reasonKa: 'ასეთი წესის იდენტიფიკატორი ცოდნის ბაზაში არ არსებობს — ციტირება უარყოფილია.' });
      return;
    }
    if (!retrievedIds.has(id)) {
      checks.push({ ruleId: id, status: 'PARTIALLY_SUPPORTED', reasonKa: 'წესი არსებობს, მაგრამ ამ მოთხოვნაზე მოძიებული არ ყოფილა — პასუხში მისი ციტირება დასაბუთებული არ არის.' });
      return;
    }
    checks.push({ ruleId: id, status: 'SUPPORTED', reasonKa: 'წესი მოძიებულია ამ მოთხოვნაზე და ციტირება დასაშვებია.' });
  });

  return { checks, fabricated };
}

/* ── freshness verifier ──────────────────────────────────────────────────── */

export type FreshnessStatus = 'CURRENT' | 'REFRESH_REQUIRED' | 'OUTDATED' | 'UNCERTAIN';

export type FreshnessResult = {
  status: FreshnessStatus;
  refreshRuleIds: string[];
  oldestVintage: string | null;
  messageKa: string;
};

export function verifyFreshness(hits: RetrievalHitKb[]): FreshnessResult {
  const clinical = hits.filter((h): h is Extract<RetrievalHitKb, { kind: 'clinical_rule' }> => h.kind === 'clinical_rule');
  if (!clinical.length) return { status: 'UNCERTAIN', refreshRuleIds: [], oldestVintage: null, messageKa: 'კლინიკური წყაროს სიახლე ამ პასუხისთვის არ შეფასებულა.' };

  const refresh = clinical.filter((h) => h.current_evidence_refresh_required);
  const vintages = clinical.map((h) => h.source_vintage).filter(Boolean) as string[];
  const oldest = vintages.sort()[0] ?? null;
  const year = oldest ? Number(oldest.slice(0, 4)) : NaN;
  const age = Number.isFinite(year) ? new Date().getFullYear() - year : NaN;

  if (refresh.length) {
    return {
      status: age >= 5 ? 'OUTDATED' : 'REFRESH_REQUIRED',
      refreshRuleIds: refresh.map((h) => h.rule_id),
      oldestVintage: oldest,
      messageKa: `საჭიროა აქტუალურ მტკიცებულებებთან გადამოწმება. შიდა წყაროს მიმოხილვის თარიღი: ${oldest ?? 'უცნობი'}.`,
    };
  }
  return { status: 'CURRENT', refreshRuleIds: [], oldestVintage: oldest, messageKa: '' };
}

/* ── contradiction check ─────────────────────────────────────────────────── */

export type Contradiction = {
  a: { ruleId: string; position: string; vintage: string | null };
  b: { ruleId: string; position: string; vintage: string | null };
  reasonKa: string;
  newer: string | null;
  humanReviewRequired: true;
};

const NEGATION = /\b(not|avoid|should not|do not|contraindicated|არ |ავარიდოთ|უკუნაჩვენებ)/i;
const RECOMMEND = /\b(recommend|suggest|offer|initiate|start|administer|რეკომენდებულია|ნაჩვენებია)/i;

/** Opposing positions are surfaced, never averaged. */
export function findContradictions(hits: RetrievalHitKb[]): Contradiction[] {
  const clinical = hits.filter((h): h is Extract<RetrievalHitKb, { kind: 'clinical_rule' }> => h.kind === 'clinical_rule');
  const out: Contradiction[] = [];

  for (let i = 0; i < clinical.length; i++) {
    for (let j = i + 1; j < clinical.length; j++) {
      const a = clinical[i];
      const b = clinical[j];
      const at = `${a.action ?? ''}`;
      const bt = `${b.action ?? ''}`;
      if (!at || !bt) continue;
      const shared = at
        .toLowerCase()
        .split(/[^a-zა-ჰ]+/)
        .filter((w) => w.length > 5);
      const overlap = shared.filter((w) => bt.toLowerCase().includes(w)).length;
      if (overlap < 2) continue;
      const aNeg = NEGATION.test(at);
      const bNeg = NEGATION.test(bt);
      const aRec = RECOMMEND.test(at);
      const bRec = RECOMMEND.test(bt);
      if ((aNeg && bRec && !bNeg) || (bNeg && aRec && !aNeg)) {
        const newer = (a.source_vintage ?? '') > (b.source_vintage ?? '') ? a.rule_id : b.rule_id;
        out.push({
          a: { ruleId: a.rule_id, position: at, vintage: a.source_vintage },
          b: { ruleId: b.rule_id, position: bt, vintage: b.source_vintage },
          reasonKa: 'ორი მოძიებული წესი ერთსა და იმავე საკითხზე ურთიერთგამომრიცხავ პოზიციას გამოხატავს; სისტემა მათ საშუალოს არ იღებს.',
          newer,
          humanReviewRequired: true,
        });
      }
      if (out.length >= 6) return out;
    }
  }
  return out;
}

/* ── release gate ────────────────────────────────────────────────────────── */

export type ReleaseStatus = 'PASS' | 'PASS_WITH_WARNING' | 'HUMAN_REVIEW' | 'BLOCK';

export type ReleaseDecision = {
  status: ReleaseStatus;
  reasonsKa: string[];
  humanReviewRequired: boolean;
};

export function releaseGate(input: {
  riskLevel: string;
  coverage: 'COVERED' | 'PARTIAL' | 'NOT_COVERED' | 'KB_UNAVAILABLE';
  numerics: NumericClaim[];
  citations: { checks: CitationCheck[]; fabricated: string[] };
  freshness: FreshnessResult;
  contradictions: Contradiction[];
  qualityContext: boolean;
  /** Public tier: the internal KB is absent by design; grounding is what this run's agents retrieved. */
  tier?: 'public' | 'internal';
  grounding?: number;
  /** DOIs/PMIDs in model-written text that no agent retrieved (already removed from the answer). */
  rejectedReferences?: number;
  /** Model-written bottom line replaced because it contained an unverified dose or threshold. */
  synthesisReplaced?: boolean;
  /** Sentences of the published answer linked to a passage the run retrieved (claim-support.ts). */
  claimSupport?: { clinical: number; linked: number };
  /** Dose / threshold values in the FINAL published text that are unverified or conflicting. */
  publishedUnverifiedDoses?: number;
  /** Drug names in the FINAL published text that neither the user nor any agent named. */
  publishedUnsupportedDrugs?: string[];
  /** Dose values in the published text that are only the user's own input. */
  userProvidedDoses?: number;
}): ReleaseDecision {
  const reasons: string[] = [];
  let status = 'PASS' as ReleaseStatus;

  const worsen = (s: ReleaseStatus) => {
    const order: ReleaseStatus[] = ['PASS', 'PASS_WITH_WARNING', 'HUMAN_REVIEW', 'BLOCK'];
    if (order.indexOf(s) > order.indexOf(status)) status = s;
  };

  if (input.citations.fabricated.length) {
    reasons.push(`პასუხში აღმოჩნდა ${input.citations.fabricated.length} არარსებული წესის ციტირება (${input.citations.fabricated.slice(0, 5).join(', ')}) — პასუხი შეკავებულია.`);
    worsen('BLOCK');
  }
  if (input.publishedUnsupportedDrugs?.length) {
    reasons.push(`გამოსაქვეყნებელ ტექსტში დასახელებულია პრეპარატი, რომელიც არც კითხვაში და არც აგენტების შედეგშია (${input.publishedUnsupportedDrugs.join(', ')}) — პასუხი შეკავებულია.`);
    worsen('BLOCK');
  }
  if (input.publishedUnverifiedDoses) {
    const high = ['R3', 'R4', 'R5'].includes(input.riskLevel);
    reasons.push(`გამოსაქვეყნებელ ტექსტში ${input.publishedUnverifiedDoses} დოზა/ზღვარი არ დადასტურდა იმავე ერთეულით, პრეპარატითა და კონტექსტით${high ? ' — პაციენტ-სპეციფიკურ პასუხში ეს დაუშვებელია, პასუხი შეკავებულია' : ''}.`);
    worsen(high ? 'BLOCK' : 'HUMAN_REVIEW');
  }
  if (input.userProvidedDoses) {
    reasons.push(`${input.userProvidedDoses} დოზა პასუხში თქვენ მიერ მოწოდებულია — სისტემა მას არ ამოწმებს და სწორ დანიშნულებად არ ადასტურებს.`);
    worsen('PASS_WITH_WARNING');
  }

  if (input.rejectedReferences) {
    reasons.push(`AI-ფორმულირებიდან ამოღებულია ${input.rejectedReferences} მითითება, რომელიც ამ კითხვაზე არ მოძიებულა.`);
    worsen('HUMAN_REVIEW');
  }
  if (input.synthesisReplaced) {
    reasons.push('AI-ფორმულირებაში აღმოჩნდა დოზა ან ზღვარი, რომელიც აგენტების შედეგში არ არის — ნაჩვენებია დეტერმინისტული დასკვნა.');
    worsen('PASS_WITH_WARNING');
  }

  // Grounding is what the published sentences are linked to — never the
  // number of hits or sources the run happened to retrieve (audit F04).
  if (input.claimSupport) {
    const { clinical, linked } = input.claimSupport;
    if (clinical > 0 && linked === 0) {
      reasons.push('პასუხის კლინიკური დებულებები ამ კითხვაზე მოძიებულ წყაროს ფრაგმენტს ვერ დაუკავშირდა — ეს ზოგადი ინფორმაციაა და არა წყაროთი დადასტურებული რეკომენდაცია.');
      worsen('PASS_WITH_WARNING');
    } else if (linked < clinical) {
      reasons.push(`პასუხის ${clinical} კლინიკური დებულებიდან წყაროს ფრაგმენტს დაუკავშირდა ${linked}; დანარჩენი ზოგადი ინფორმაციაა.`);
      worsen('PASS_WITH_WARNING');
    }
  } else if (input.coverage === 'KB_UNAVAILABLE' && input.tier === 'public' && !input.grounding) {
    reasons.push('პასუხი არ ეყრდნობა ამ კითხვაზე მოძიებულ წყაროს — მიიღეთ როგორც ზოგადი ორიენტირი.');
    worsen('PASS_WITH_WARNING');
  }
  if (input.coverage === 'KB_UNAVAILABLE' && input.tier !== 'public') {
    reasons.push('ცოდნის ბაზა მიუწვდომელია — შიდა წესებზე დაფუძნებული დასკვნა არ გაიცემა.');
    worsen('HUMAN_REVIEW');
  } else if (input.coverage === 'NOT_COVERED') {
    reasons.push('შიდა კორპუსი ამ კითხვას არ ფარავს — პასუხი არ ეყრდნობა შიდა წესებს.');
    worsen('HUMAN_REVIEW');
  } else if (input.coverage === 'PARTIAL') {
    reasons.push('შიდა კორპუსის დაფარვა ნაწილობრივია.');
    worsen('PASS_WITH_WARNING');
  }

  const unverified = input.numerics.filter((n) => n.status === 'UNVERIFIED' || n.status === 'CONFLICT');
  if (unverified.length) {
    reasons.push(`${unverified.length} რიცხვითი მნიშვნელობა მოძიებულ წესებში არ დადასტურდა — საჭიროა დამოუკიდებელი ვერიფიკაცია.`);
    worsen(['R4', 'R5'].includes(input.riskLevel) ? 'HUMAN_REVIEW' : 'PASS_WITH_WARNING');
  }

  if (input.freshness.status === 'OUTDATED' || input.freshness.status === 'REFRESH_REQUIRED') {
    reasons.push(input.freshness.messageKa);
    worsen('PASS_WITH_WARNING');
  }

  if (input.contradictions.length) {
    reasons.push(`${input.contradictions.length} შემთხვევაში წყაროები ერთმანეთს ეწინააღმდეგება — პოზიციები წარმოდგენილია ცალ-ცალკე.`);
    worsen('HUMAN_REVIEW');
  }

  if (['R3', 'R4', 'R5'].includes(input.riskLevel)) worsen('HUMAN_REVIEW');
  if (input.qualityContext) {
    reasons.push('ხარისხის/დეფექტის კონტექსტი: სამართლებრივი კვალიფიკაცია და პროფესიული პასუხისმგებლობა ავტომატურად არ დგინდება.');
    worsen('HUMAN_REVIEW');
  }

  return { status, reasonsKa: reasons, humanReviewRequired: status === 'HUMAN_REVIEW' || status === 'BLOCK' };
}
