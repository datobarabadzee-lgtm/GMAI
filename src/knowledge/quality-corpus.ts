import 'server-only';
import activeRules from '../../authored/quality/rules-active.json';
import ruleIndex from '../../authored/quality/rules-index.json';
import taxonomyNodes from '../../authored/quality/taxonomy.json';
import auditBank from '../../authored/quality/audit.json';
import corpusManifest from '../../authored/quality/manifest.json';

/**
 * QUALITY & DEFECT CORPUS
 *
 * Source: the project author's own manual
 * „სამედიცინო დახმარების ხარისხის კრიტერიუმები და დეფექტების კლასიფიკაცია"
 * (Dr. Davit Barabadze, DRAFT) — AUTHOR_DRAFT, own IP.
 *
 * 4 482 rules were extracted from the manual. Only the 757 that carry a
 * decidable trigger, criterion or evidence requirement are served by the
 * engine; the remaining 3 425 are sentence-level extractions kept for
 * traceability so a count can always be reconciled against the source.
 *
 * Nothing here is autonomous. Every finding carries the manual's own
 * chapter path, and the manual's own safety rule applies: an adverse
 * outcome is not a defect, and a guideline deviation is not negligence.
 */

export type QualityRule = {
  id: string;
  family: string;
  defectClasses: { code: string | null; nameKa: string }[];
  maturity: 'STRUCTURED_DECISION_RULE' | 'COMPUTABLE_AUDIT_CHECK' | 'HIGH_COMPUTABILITY_RULE' | 'HUMAN_JUDGMENT_RULE';
  active: boolean;
  triggerKa: string | null;
  criterionKa: string | null;
  requiredEvidence: string[];
  exceptions: string[];
  needsCausality: boolean;
  needsStandardComparison: boolean;
  needsDocumentationReview: boolean;
  automation: string;
  autoFlag: boolean;
  humanReviewRequired: boolean;
  chapterPath: string[];
  block: number | null;
};

export type TaxonomyNode = {
  id: string;
  type: string;
  code: string | null;
  nameKa: string;
  parent: string | null;
  headingPath: string[];
};

export type AuditQuestion = {
  id: string;
  questionKa: string;
  defectClasses: string[];
  evidence: string[];
  headingPath: string[];
};

export const QUALITY_RULES = activeRules as QualityRule[];
export const QUALITY_TAXONOMY = taxonomyNodes as TaxonomyNode[];
export const AUDIT_QUESTIONS = auditBank as AuditQuestion[];
export const QUALITY_MANIFEST = corpusManifest as {
  source: string;
  sourceStatus: string;
  author: string;
  ingestedAt: string;
  rulesExtracted: number;
  rulesActive: number;
  maturityCounts: Record<string, number>;
  activeByMaturity: Record<string, number>;
  families: number;
  taxonomyNodes: number;
  auditQuestions: number;
  evidenceDimensions: number;
  checksum: string;
};

export const RULE_TRACE_COUNT = (ruleIndex as { id: string }[]).length;

export const DEFECT_CLASS_NODES = QUALITY_TAXONOMY.filter((n) => n.type === 'defect_class');

/**
 * Every evidence dimension present in the corpus, labelled. An unlabelled
 * dimension leaks a raw English key into a Georgian clinical interface, so
 * this map is asserted complete by the test suite against the data.
 */
export const EVIDENCE_LABEL_KA: Record<string, string> = {
  medical_record: 'სამედიცინო ჩანაწერი',
  timeline: 'მოვლენათა ქრონოლოგია',
  policy_protocol: 'შიდა პროტოკოლი / გაიდლაინი',
  consent_form: 'ინფორმირებული თანხმობის ფორმა',
  procedure_record: 'პროცედურის ოქმი',
  laboratory_data: 'ლაბორატორიული მონაცემები',
  monitoring_record: 'მონიტორინგის ჩანაწერი',
  staffing_resource_record: 'კადრები და რესურსი',
  medication_record: 'მედიკამენტების ჩანაწერი',
  imaging_data: 'ვიზუალიზაციის მონაცემები',
  incident_report: 'ინციდენტის ანგარიში',
  handover_record: 'ცვლის გადაცემის ჩანაწერი',
};

export const FAMILY_LABEL_KA: Record<string, string> = {
  documentation: 'დოკუმენტაცია',
  legal_expert_review: 'სამართლებრივი ექსპერტიზა',
  standard_comparison: 'სტანდარტთან შედარება',
  quality_criterion: 'ხარისხის კრიტერიუმი',
  safety: 'პაციენტის უსაფრთხოება',
  causality: 'მიზეზობრიობა',
  classification: 'კლასიფიკაცია',
  methodological_principle: 'მეთოდოლოგიური პრინციპი',
  governance: 'მმართველობა და KPI',
  defect_detection: 'დეფექტის ამოცნობა',
  evidence_requirement: 'მტკიცებულების მოთხოვნა',
  consent: 'ინფორმირებული თანხმობა',
  communication: 'კომუნიკაცია',
  defect_definition: 'დეფექტის დეფინიცია',
  kpi_data: 'KPI და მონაცემები',
  education_training: 'განათლება და ტრენინგი',
  rca_capa: 'RCA / CAPA',
};

export function familyLabel(family: string): string {
  return FAMILY_LABEL_KA[family] ?? family;
}

export function evidenceLabel(dimension: string): string {
  return EVIDENCE_LABEL_KA[dimension] ?? dimension;
}

/** Georgian-aware token split: drops case-form endings that break naive matching. */
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4)
    .map((t) => t.replace(/(ებისა|ების|ებს|ები|ისა|ის|ში|ზე|თან|დან|მა|ს)$/u, ''))
    .filter((t) => t.length >= 3);
}

const RULE_TOKENS = new Map<string, Set<string>>(
  QUALITY_RULES.map((r) => [r.id, new Set(tokens(`${r.triggerKa ?? ''} ${r.criterionKa ?? ''}`))]),
);

const QUESTION_TOKENS = new Map<string, Set<string>>(
  AUDIT_QUESTIONS.map((q) => [q.id, new Set(tokens(q.questionKa))]),
);

function overlap(queryTokens: string[], target: Set<string> | undefined): number {
  if (!target || !target.size || !queryTokens.length) return 0;
  let hit = 0;
  for (const t of queryTokens) if (target.has(t)) hit++;
  return hit / queryTokens.length;
}

export type RuleMatch = { rule: QualityRule; score: number };

/**
 * Retrieves rules relevant to a case narrative. Relevance is thresholded:
 * an empty result is a correct answer and must not fall back to the whole
 * corpus — that is how an irrelevant rule ends up cited against a clinician.
 */
export function matchRules(narrative: string, opts: { limit?: number; families?: string[]; minScore?: number } = {}): RuleMatch[] {
  const { limit = 12, families, minScore = 0.12 } = opts;
  const qt = tokens(narrative);
  if (qt.length < 2) return [];
  return QUALITY_RULES.filter((r) => !families?.length || families.includes(r.family))
    .map((rule) => ({ rule, score: overlap(qt, RULE_TOKENS.get(rule.id)) }))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score || a.rule.id.localeCompare(b.rule.id))
    .slice(0, limit);
}

export type QuestionMatch = { question: AuditQuestion; score: number };

export function matchAuditQuestions(narrative: string, opts: { limit?: number; minScore?: number } = {}): QuestionMatch[] {
  const { limit = 10, minScore = 0.1 } = opts;
  const qt = tokens(narrative);
  if (qt.length < 2) return [];
  return AUDIT_QUESTIONS.map((question) => ({ question, score: overlap(qt, QUESTION_TOKENS.get(question.id)) }))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score || a.question.id.localeCompare(b.question.id))
    .slice(0, limit);
}

export function questionsForDefectClass(nameKa: string): AuditQuestion[] {
  return AUDIT_QUESTIONS.filter((q) => q.defectClasses.some((c) => c === nameKa));
}

export function rulesForFamily(family: string): QualityRule[] {
  return QUALITY_RULES.filter((r) => r.family === family);
}

/** Evidence dimensions a set of matched rules collectively requires. */
export function requiredEvidenceFor(rules: QualityRule[]): { dimension: string; labelKa: string; ruleCount: number }[] {
  const counts = new Map<string, number>();
  for (const r of rules) for (const e of r.requiredEvidence) counts.set(e, (counts.get(e) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([dimension, ruleCount]) => ({ dimension, labelKa: evidenceLabel(dimension), ruleCount }));
}
