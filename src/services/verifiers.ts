import type { RetrievalHitKb } from '@/kb/search';
import { existingRuleIds } from '@/kb/retrieval-service';
import { UNIT_BY_ID, unitText } from '@/knowledge/clinical-v2';

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
  /** VERIFIED_AGAINST_ENGINE: the number appears in this run's deterministic agent output or in the user's own input. */
  status: 'VERIFIED_AGAINST_RULE' | 'VERIFIED_AGAINST_ENGINE' | 'UNVERIFIED' | 'CONFLICT';
  supportingRuleIds: string[];
  noteKa: string;
};

// Georgian letters are not \w in JavaScript, so a trailing \b after a Georgian
// unit ("5 მგ;") never matches and the dose was silently not extracted. Word
// ends are written as an explicit "no letter follows" lookahead instead.
const END = '(?![a-zA-Zა-ჰ])';
const NUMERIC_PATTERNS: { kind: NumericClaim['kind']; re: RegExp }[] = [
  { kind: 'dose', re: new RegExp(`\\d+(?:[.,]\\d+)?\\s*(?:მგ|mg|მკგ|mcg|გ|g|მლ|ml|ერთეული|ერთ|units?|იე|IU)(?![a-zA-Zა-ჰ/])`, 'gi') },
  { kind: 'age_cutoff', re: /(?:ასაკი|age)\s*(?:≥|>=|>|<|≤|<=)?\s*\d{1,3}\s*(?:წლ[ა-ჰ]*|years?)?/gi },
  { kind: 'lab_threshold', re: /\d+(?:[.,]\d+)?\s*(?:მმოლ\/ლ|mmol\/l|მგ\/დლ|mg\/dl|გ\/დლ|g\/dl|მლ\/წთ|ml\/min|ერთ\/ლ|u\/l|ნგ\/ლ|ng\/l|%)/gi },
  { kind: 'duration', re: new RegExp(`\\d+(?:[.,]\\d+)?\\s*(?:დღ[ა-ჰ]*|კვირ[ა-ჰ]*|თვ[ა-ჰ]*|წლ[ა-ჰ]*|days?|weeks?|months?|years?|hours?|სთ|წთ|min)${END}`, 'gi') },
  { kind: 'interval', re: /(?:ყოველ|every|q)\s*\d+\s*(?:საათ[ა-ჰ]*|სთ|hours?|h|დღ[ა-ჰ]*|days?)/gi },
  { kind: 'threshold', re: /(?:≥|>=|≤|<=|>|<)\s*\d+(?:[.,]\d+)?/g },
];

export function extractNumericClaims(text: string): { text: string; kind: NumericClaim['kind']; value: string }[] {
  const found: { text: string; kind: NumericClaim['kind']; value: string }[] = [];
  const seen = new Set<string>();
  NUMERIC_PATTERNS.forEach(({ kind, re }) => {
    const r = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = r.exec(text)) !== null) {
      const v = m[0].trim();
      const key = `${kind}:${v.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ text: v, kind, value: v });
      if (found.length > 60) return;
    }
  });
  return found;
}

const digitsOf = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((d) => d.replace(',', '.'));

/**
 * A number is verified only when the same number appears in a retrieved rule,
 * or — when a run ledger is given — in this run's deterministic agent output or
 * the user's own input. A number that appears in neither was produced by the
 * model and is exactly what this verifier exists to catch.
 */
/** A clinical_unit hit is verified against its whole section, never a lone number. */
function clinicalSectionText(unitIds: string[]): string {
  return unitIds.map((id) => UNIT_BY_ID.get(id)).filter((u): u is NonNullable<typeof u> => Boolean(u)).map((u) => unitText(u)).join('\n');
}

export function verifyNumerics(answerText: string, hits: RetrievalHitKb[], ledgerNumbers?: Set<string>): NumericClaim[] {
  const claims = extractNumericClaims(answerText);
  if (!claims.length) return [];

  const ruleNumbers = new Map<string, Set<string>>();
  hits.forEach((h) => {
    const corpus =
      h.kind === 'clinical_rule'
        ? [h.action, h.trigger, h.normalized_condition_text, ...h.numeric_constraints, ...h.exceptions, ...h.monitoring, ...h.escalation].filter(Boolean).join(' ')
        : h.kind === 'quality_rule'
          ? [h.trigger_or_question, h.criterion_or_action].filter(Boolean).join(' ')
          : h.kind === 'clinical_unit'
            ? clinicalSectionText(h.context_unit_ids)
            : h.question;
    ruleNumbers.set(h.rule_id, new Set(digitsOf(String(corpus))));
  });

  return claims.map((c) => {
    const nums = digitsOf(c.value);
    const supporting = [...ruleNumbers.entries()].filter(([, set]) => nums.every((n) => set.has(n))).map(([id]) => id);
    const norm = nums.map((n) => String(Number(n)));
    const engine = !supporting.length && Boolean(ledgerNumbers) && norm.every((n) => ledgerNumbers!.has(n));
    return {
      ...c,
      status: supporting.length ? 'VERIFIED_AGAINST_RULE' : engine ? 'VERIFIED_AGAINST_ENGINE' : 'UNVERIFIED',
      supportingRuleIds: supporting,
      noteKa: supporting.length
        ? 'მნიშვნელობა ემთხვევა მოძიებულ წესს; საბოლოო დადასტურება კლინიცისტს ეკუთვნის.'
        : engine
          ? 'მნიშვნელობა მოდის ამ მოთხოვნის დეტერმინისტული აგენტის შედეგიდან ან თქვენი შეყვანილი მონაცემიდან.'
          : 'რიცხვითი მნიშვნელობა არც მოძიებულ წესებში და არც აგენტების შედეგში არ დადასტურდა — არ გამოიყენოთ დანიშვნისთვის დამოუკიდებელი გადამოწმების გარეშე.',
    } satisfies NumericClaim;
  });
}

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
}): ReleaseDecision {
  const reasons: string[] = [];
  let status = 'PASS' as ReleaseStatus;

  const worsen = (s: ReleaseStatus) => {
    const order: ReleaseStatus[] = ['PASS', 'PASS_WITH_WARNING', 'HUMAN_REVIEW', 'BLOCK'];
    if (order.indexOf(s) > order.indexOf(status)) status = s;
  };

  if (input.citations.fabricated.length) {
    reasons.push(`უარყოფილია ${input.citations.fabricated.length} არარსებული წესის ციტირება — პასუხი გამოქვეყნებამდე შესწორდა.`);
    worsen('BLOCK');
  }

  if (input.rejectedReferences) {
    reasons.push(`AI-ფორმულირებიდან ამოღებულია ${input.rejectedReferences} მითითება, რომელიც ამ კითხვაზე არ მოძიებულა.`);
    worsen('HUMAN_REVIEW');
  }
  if (input.synthesisReplaced) {
    reasons.push('AI-ფორმულირებაში აღმოჩნდა დოზა ან ზღვარი, რომელიც აგენტების შედეგში არ არის — ნაჩვენებია დეტერმინისტული დასკვნა.');
    worsen('PASS_WITH_WARNING');
  }

  if (input.coverage === 'KB_UNAVAILABLE' && input.tier === 'public') {
    if (!input.grounding) {
      reasons.push('პასუხი არ ეყრდნობა ამ კითხვაზე მოძიებულ წყაროს — მიიღეთ როგორც ზოგადი ორიენტირი.');
      worsen('PASS_WITH_WARNING');
    }
  } else if (input.coverage === 'KB_UNAVAILABLE') {
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
