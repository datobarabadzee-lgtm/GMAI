import 'server-only';
import { DEFECT_CLASSES, suggestDefectClasses, type DefectClass } from '@/knowledge/defect-classifier';
import {
  matchAuditQuestions,
  matchRules,
  questionsForDefectClass,
  requiredEvidenceFor,
  familyLabel,
  QUALITY_MANIFEST,
  type QualityRule,
} from '@/knowledge/quality-corpus';

/**
 * QUALITY PROFILE OF A CASE
 *
 * A13 and A14 previously classified a case from a ten-entry keyword table and
 * then printed generic criteria. The author's manual has since been ingested
 * as 757 active rules and 128 audit questions; this joins the two:
 *
 *   - CLASS-LEVEL knowledge (definition, control mechanism, responsible party,
 *     CAPA) comes from the curated ten-class table, which was written from the
 *     manual's chapter III and is the right granularity for a summary;
 *   - RULE-LEVEL criteria — the specific standard a finding is measured
 *     against, with its chapter address — come from the corpus.
 *
 * A class is reported only when the case text supports it, either through the
 * keyword signals or through matched corpus rules. Each class carries how much
 * support it has, so a reader can tell a strong signal from a single hit.
 */

export type ClassSupport = {
  cls: DefectClass;
  code: string;
  keywordHits: string[];
  ruleIds: string[];
  support: number;
};

export type QualityProfile = {
  rules: { rule: QualityRule; score: number }[];
  classes: ClassSupport[];
  questions: { id: string; questionKa: string; evidence: string[]; chapter: string }[];
  requiredEvidence: { dimension: string; labelKa: string; ruleCount: number }[];
  gates: { causality: boolean; standardComparison: boolean; documentationReview: boolean };
  corpusNoteKa: string;
};

/** Corpus code D01..D10 ↔ the ten-class table, aligned by the manual's own ordering. */
const byCode = (code: string | null): DefectClass | undefined => {
  if (!code) return undefined;
  const n = Number(code.replace(/^D0?/, ''));
  return DEFECT_CLASSES.find((c) => c.index === n);
};

const codeOf = (cls: DefectClass) => `D${String(cls.index).padStart(2, '0')}`;

export function qualityProfile(narrative: string): QualityProfile {
  const text = narrative.trim();
  const rules = text.length >= 20 ? matchRules(text, { limit: 15 }) : [];

  const tally = new Map<string, ClassSupport>();
  const bump = (cls: DefectClass, keywordHits: string[], ruleId?: string) => {
    const code = codeOf(cls);
    const cur = tally.get(code) ?? { cls, code, keywordHits: [], ruleIds: [], support: 0 };
    for (const k of keywordHits) if (!cur.keywordHits.includes(k)) cur.keywordHits.push(k);
    if (ruleId && !cur.ruleIds.includes(ruleId)) cur.ruleIds.push(ruleId);
    cur.support = cur.keywordHits.length + cur.ruleIds.length;
    tally.set(code, cur);
  };

  for (const cand of suggestDefectClasses(text)) bump(cand.cls, cand.hits);
  for (const { rule } of rules) {
    for (const dc of rule.defectClasses) {
      const cls = byCode(dc.code);
      if (cls) bump(cls, [], rule.id);
    }
  }

  const classes = [...tally.values()].sort((a, b) => b.support - a.support);

  // Audit questions: those matched to the narrative first, then the class bank
  // for the strongest classes, so a case never comes back with no questions
  // when the classes it raises have questions of their own.
  const matchedQ = matchAuditQuestions(text, { limit: 8 }).map(({ question }) => question);
  const seen = new Set(matchedQ.map((q) => q.id));
  for (const c of classes.slice(0, 3)) {
    for (const q of questionsForDefectClass(c.cls.nameKa)) {
      if (seen.size >= 10) break;
      if (!seen.has(q.id)) {
        matchedQ.push(q);
        seen.add(q.id);
      }
    }
  }

  const matchedRules = rules.map((r) => r.rule);

  return {
    rules,
    classes,
    questions: matchedQ.slice(0, 10).map((q) => ({
      id: q.id,
      questionKa: q.questionKa,
      evidence: q.evidence,
      chapter: q.headingPath[q.headingPath.length - 1] ?? '',
    })),
    requiredEvidence: requiredEvidenceFor(matchedRules),
    gates: {
      causality: matchedRules.some((r) => r.needsCausality),
      standardComparison: matchedRules.some((r) => r.needsStandardComparison),
      documentationReview: matchedRules.some((r) => r.needsDocumentationReview),
    },
    corpusNoteKa: `წყარო: ${QUALITY_MANIFEST.source} — ${QUALITY_MANIFEST.rulesActive} აქტიური წესი, ${QUALITY_MANIFEST.auditQuestions} აუდიტის კითხვა.`,
  };
}

/** One line per matched rule: what the standard says and where in the manual. */
export function ruleLine(rule: QualityRule): string {
  const body = rule.criterionKa ?? rule.triggerKa ?? '';
  const where = rule.chapterPath.length ? ` [${rule.chapterPath[rule.chapterPath.length - 1]}]` : '';
  return `${rule.id} · ${familyLabel(rule.family)}: ${body.slice(0, 260)}${body.length > 260 ? '…' : ''}${where}`;
}
