import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AUDIT_QUESTIONS,
  DEFECT_CLASS_NODES,
  QUALITY_MANIFEST,
  QUALITY_RULES,
  familyLabel,
  matchAuditQuestions,
  matchRules,
  questionsForDefectClass,
  requiredEvidenceFor,
} from '@/knowledge/quality-corpus';

export const runtime = 'nodejs';

const Body = z.object({
  narrative: z.string().trim().min(1),
  families: z.array(z.string()).optional(),
  evidenceAvailable: z.array(z.string()).optional(),
});

/** Corpus statistics — what the engine actually holds, for honest display. */
export async function GET() {
  return NextResponse.json({
    manifest: QUALITY_MANIFEST,
    defectClasses: DEFECT_CLASS_NODES.map((n) => ({
      code: n.code,
      nameKa: n.nameKa,
      auditQuestions: questionsForDefectClass(n.nameKa).length,
    })),
    families: [...new Set(QUALITY_RULES.map((r) => r.family))]
      .map((family) => ({
        family,
        labelKa: familyLabel(family),
        rules: QUALITY_RULES.filter((r) => r.family === family).length,
      }))
      .sort((a, b) => b.rules - a.rules),
  });
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'BAD_REQUEST', messageKa: 'აღწერა ცარიელია.' }, { status: 400 });
  }

  const { narrative, families, evidenceAvailable = [] } = parsed.data;

  if (narrative.length < 40) {
    return NextResponse.json(
      {
        error: 'NEEDS_DETAIL',
        messageKa:
          'შემთხვევის აღწერა ძალიან მოკლეა დასკვნისთვის. მიუთითეთ: რა მოხდა, რა იყო დოკუმენტირებული, რა ეტაპზე და რა შედეგით. მონაცემის გარეშე სისტემა დეფექტს არ დააკვალიფიცირებს.',
      },
      { status: 422 },
    );
  }

  const ruleMatches = matchRules(narrative, { limit: 15, families });
  const questionMatches = matchAuditQuestions(narrative, { limit: 10 });

  if (!ruleMatches.length && !questionMatches.length) {
    return NextResponse.json({
      findings: [],
      questions: [],
      requiredEvidence: [],
      missingEvidence: [],
      gates: null,
      messageKa:
        'ამ აღწერაზე სახელმძღვანელოს კორპუსში რელევანტური კრიტერიუმი არ მოიძებნა. ეს არ ნიშნავს დეფექტის არარსებობას — ნიშნავს, რომ ავტომატური კლასიფიკაციის საფუძველი არ არის და შემთხვევა ადამიანურ განხილვას საჭიროებს.',
    });
  }

  const rules = ruleMatches.map((m) => m.rule);
  const requiredEvidence = requiredEvidenceFor(rules);
  const have = new Set(evidenceAvailable);
  const missingEvidence = requiredEvidence.filter((e) => !have.has(e.dimension));

  // Aggregate the defect classes the matched rules point at, with support counts.
  const classTally = new Map<string, { code: string | null; nameKa: string; ruleIds: string[] }>();
  for (const r of rules) {
    for (const c of r.defectClasses) {
      const entry = classTally.get(c.nameKa) ?? { code: c.code, nameKa: c.nameKa, ruleIds: [] };
      entry.ruleIds.push(r.id);
      classTally.set(c.nameKa, entry);
    }
  }

  const findings = ruleMatches.map(({ rule, score }) => ({
    ruleId: rule.id,
    family: rule.family,
    familyKa: familyLabel(rule.family),
    maturity: rule.maturity,
    relevance: Number(score.toFixed(3)),
    triggerKa: rule.triggerKa,
    criterionKa: rule.criterionKa,
    defectClasses: rule.defectClasses,
    requiredEvidence: rule.requiredEvidence,
    exceptions: rule.exceptions,
    chapterPath: rule.chapterPath,
    gates: {
      causality: rule.needsCausality,
      standardComparison: rule.needsStandardComparison,
      documentationReview: rule.needsDocumentationReview,
      humanReviewRequired: rule.humanReviewRequired,
      automation: rule.automation,
    },
  }));

  return NextResponse.json({
    findings,
    candidateClasses: [...classTally.values()]
      .map((c) => ({ ...c, support: c.ruleIds.length }))
      .sort((a, b) => b.support - a.support),
    questions: questionMatches.map(({ question, score }) => ({
      id: question.id,
      questionKa: question.questionKa,
      defectClasses: question.defectClasses,
      evidence: question.evidence,
      chapterPath: question.headingPath,
      relevance: Number(score.toFixed(3)),
    })),
    requiredEvidence,
    missingEvidence,
    // The manual's own safety rule, enforced in the response rather than printed as a footnote.
    gates: {
      causalityRequired: findings.some((f) => f.gates.causality),
      standardComparisonRequired: findings.some((f) => f.gates.standardComparison),
      documentationReviewRequired: findings.some((f) => f.gates.documentationReview),
      autonomousLegalConclusion: false,
    },
    disclaimerKa:
      'ეს არ არის დასკვნა დეფექტის არსებობის შესახებ. უარყოფითი შედეგი თავისთავად არ არის დეფექტი და გაიდლაინიდან გადახრა თავისთავად არ არის დაუდევრობა. მიზეზობრიობა, სტანდარტთან შედარება და დოკუმენტაციის შეფასება ფასდება ცალ-ცალკე, კვალიფიციური ადამიანის მიერ.',
    corpus: {
      rulesActive: QUALITY_MANIFEST.rulesActive,
      rulesExtracted: QUALITY_MANIFEST.rulesExtracted,
      auditQuestions: AUDIT_QUESTIONS.length,
      source: QUALITY_MANIFEST.source,
    },
  });
}
