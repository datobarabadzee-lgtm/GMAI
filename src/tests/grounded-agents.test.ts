import { describe, expect, it } from 'vitest';
import { kbExists } from '@/kb/db';
import { retrieveRules } from '@/kb/retrieval-service';
import { structureCase } from '@/agents/core/types';
import { challengePlanAgent, clinicalReasoningAgent, differentialAgent, drugSafetyAgent, qualityGrounding, whatAmIMissingAgent, QUALITY_HARD_RULES_KA } from '@/agents/core/agents';
import { orchestrate } from '@/services/orchestrator';
import { DEMO_CASES } from '@/knowledge/demo-cases';
import { emptyPatientContext } from '@/schemas/clinical';
import { reviewMedications } from '@/lib/medication-review';

const hasKb = kbExists();
const d = hasKb ? describe : describe.skip;

async function inputFor(caseId: string, question: string, plan = '') {
  const patient = DEMO_CASES.find((x) => x.id === caseId)!.patient;
  const kb = await retrieveRules(`${question} ${patient.narrative}`, { limit: 12 });
  return { question, plan, patient, structured: structureCase(patient, reviewMedications(patient).crcl), kb, riskLevel: 'R3' };
}

d('A01 clinical reasoning agent', () => {
  it('returns the full structured contract', async () => {
    const env = clinicalReasoningAgent(await inputFor('demo-polypharmacy', 'რა მაკლია ამ ქეისში?'));
    const o = env.output!;
    ['case_summary', 'major_problems', 'urgent_issues', 'clinical_reasoning', 'missing_information', 'recommended_next_steps', 'safety_concerns', 'relevant_rule_ids', 'uncertainty', 'evidence_refresh_required'].forEach((k) =>
      expect(o).toHaveProperty(k),
    );
  });

  it('never invents patient data that is not in the case', async () => {
    const env = clinicalReasoningAgent({ ...(await inputFor('demo-polypharmacy', 'x')), patient: emptyPatientContext(), structured: structureCase(emptyPatientContext(), null) });
    expect(env.output!.major_problems).toEqual([]);
    expect(env.output!.missing_information.length).toBeGreaterThan(3);
  });

  it('cites only rule ids that were actually retrieved', async () => {
    const input = await inputFor('demo-polypharmacy', 'პოლიფარმაცია');
    const env = clinicalReasoningAgent(input);
    env.output!.relevant_rule_ids.forEach((id) => expect(input.kb.ruleIds).toContain(id));
  });
});

d('A02 differential agent', () => {
  it('groups output into the required Georgian buckets', async () => {
    const env = differentialAgent(await inputFor('demo-tia', 'რა დიფერენციული დიაგნოზი განვიხილო?'));
    const o = env.output!;
    ['must_exclude_urgently', 'most_likely', 'alternatives', 'supporting_findings', 'opposing_findings', 'data_to_clarify', 'discriminating_investigations'].forEach((k) => expect(o).toHaveProperty(k));
  });

  it('states plainly when the corpus does not cover the syndrome', async () => {
    const kb = await retrieveRules('ზზზქქქ ჭჭჭ ბბბ არარსებული');
    const patient = emptyPatientContext();
    const env = differentialAgent({ question: 'x', plan: '', patient, structured: structureCase(patient, null), kb, riskLevel: 'R2' });
    if (!env.output!.must_exclude_urgently.length && !env.output!.most_likely.length) {
      expect(env.output!.noteKa).toMatch(/ვერ მოიძებნა|შიდა/);
    }
  });
});

d('A03 what am I missing agent', () => {
  it('classifies every required field as KNOWN / MISSING / UNKNOWN / NOT_APPLICABLE', async () => {
    const env = whatAmIMissingAgent(await inputFor('demo-af-ckd', 'რა მაკლია?'));
    env.output!.rows.forEach((r) => expect(['KNOWN', 'MISSING', 'UNKNOWN', 'NOT_APPLICABLE']).toContain(r.status));
  });

  it('renders the status in Georgian', async () => {
    const env = whatAmIMissingAgent(await inputFor('demo-af-ckd', 'რა მაკლია?'));
    env.output!.rows.forEach((r) => expect(['ცნობილია', 'აკლია', 'უცნობია', 'არ გამოიყენება']).toContain(r.statusKa));
  });

  it('marks pregnancy as not applicable for a male patient', async () => {
    const base = await inputFor('demo-tia', 'pregnancy status');
    const env = whatAmIMissingAgent(base);
    const preg = env.output!.rows.find((r) => /pregnan/i.test(r.field));
    if (preg) expect(preg.status).toBe('NOT_APPLICABLE');
  });

  it('flags an empty case as missing the documentation baseline', async () => {
    const patient = emptyPatientContext();
    const kb = await retrieveRules('general question');
    const env = whatAmIMissingAgent({ question: 'x', plan: '', patient, structured: structureCase(patient, null), kb, riskLevel: 'R2' });
    expect(env.output!.rows.filter((r) => r.status === 'MISSING').length).toBeGreaterThan(0);
  });
});

d('A04 challenge my plan agent', () => {
  it('refuses to run without a proposed plan', async () => {
    const env = challengePlanAgent(await inputFor('demo-af-ckd', 'შეამოწმე გეგმა'));
    expect(env.ok).toBe(false);
    expect(env.notesKa.join(' ')).toContain('გეგმა');
  });

  it('does not simply agree with the clinician', async () => {
    const env = challengePlanAgent(await inputFor('demo-af-ckd', 'შეამოწმე გეგმა', 'დავნიშნავ იბუპროფენს ტკივილზე და გავწერ პაციენტს.'));
    const o = env.output!;
    const issues = o.contraindications.length + o.missing_monitoring.length + o.unsafe_discharge.length + o.missing_prerequisites.length;
    expect(issues).toBeGreaterThan(0);
  });

  it('flags a discharge with no return criteria', async () => {
    const env = challengePlanAgent(await inputFor('demo-af-ckd', 'გეგმა', 'პაციენტს გავწერ ამბულატორიულ მეთვალყურეობაზე.'));
    expect(env.output!.unsafe_discharge.length).toBeGreaterThan(0);
  });
});

d('A07 drug safety agent', () => {
  it('covers every required safety dimension', async () => {
    const env = drugSafetyAgent(await inputFor('demo-polypharmacy', 'მედიკამენტების უსაფრთხოება'));
    ['drug_drug', 'drug_disease', 'allergy', 'age_related', 'renal', 'hepatic', 'pregnancy', 'monitoring', 'duplication', 'polypharmacy', 'deprescribing'].forEach((k) => expect(env.output!).toHaveProperty(k));
  });

  it('says external verification is required for an unknown molecule', async () => {
    const base = await inputFor('demo-polypharmacy', 'x');
    const patient = { ...base.patient, medications: [{ id: '1', drug: 'ზზზქქქ', dose: '', frequency: '', route: '', indication: '', startDate: '', status: 'active' as const }] };
    const env = drugSafetyAgent({ ...base, patient, structured: structureCase(patient, null) });
    expect(env.output!.externalVerificationRequiredKa).toContain('გადამოწმება');
  });

  it('does not fabricate an interaction for drugs that are not in the registry', async () => {
    const base = await inputFor('demo-polypharmacy', 'x');
    const patient = { ...base.patient, medications: [{ id: '1', drug: 'ზზზქქქ', dose: '', frequency: '', route: '', indication: '', startDate: '', status: 'active' as const }] };
    const env = drugSafetyAgent({ ...base, patient, structured: structureCase(patient, null) });
    expect(env.output!.drug_drug).toEqual([]);
  });
});

d('quality hard rules', () => {
  it('always states the five non-negotiable principles', async () => {
    const g = qualityGrounding(await inputFor('demo-quality', 'ხარისხის მიმოხილვა'));
    expect(g.hardRulesKa).toEqual(QUALITY_HARD_RULES_KA);
    expect(g.hardRulesKa.join(' ')).toContain('არასასურველი შედეგი ავტომატურად არ ნიშნავს დეფექტს');
    expect(g.hardRulesKa.join(' ')).toContain('დროითი თანმიმდევრობა არ არის მიზეზობრიობა');
  });

  it('never allows a candidate rule to auto-flag a defect', async () => {
    const g = qualityGrounding(await inputFor('demo-quality', 'დოკუმენტაციის დეფექტი'));
    g.applicableRules.filter((r) => r.maturity === 'QUALITY_RULE_CANDIDATE').forEach((r) => expect(r.autoFlagAllowed).toBe(false));
  });

  it('marks every applicable quality rule as requiring human review', async () => {
    const g = qualityGrounding(await inputFor('demo-quality', 'თანხმობის დეფექტი'));
    g.applicableRules.forEach((r) => expect(r.humanReviewRequired).toBe(true));
  });
});

d('end-to-end grounded pipeline', () => {
  it('produces provenance, verification and a release decision', async () => {
    const out = await orchestrate({ question: 'dyspepsia endoscopy referral', mode: 'deep', patient: DEMO_CASES[0].patient });
    expect(out.runId).toBeTruthy();
    expect(out.provenance.length).toBeGreaterThan(0);
    expect(out.verification!.freshness.status).toBeTruthy();
    expect(['PASS', 'PASS_WITH_WARNING', 'HUMAN_REVIEW', 'BLOCK']).toContain(out.release.status);
  });

  it('only lists provenance for rules that were retrieved', async () => {
    const out = await orchestrate({ question: 'informed consent documentation defect', mode: 'quality', patient: DEMO_CASES.find((d2) => d2.id === 'demo-quality')!.patient });
    out.provenance.forEach((p) => expect(out.kb.ruleIds).toContain(p.rule_id));
  });

  it('a high-risk workflow can never bypass the safety gate', async () => {
    const out = await orchestrate({ question: 'რა დოზა დავნიშნო?', mode: 'deep', patient: DEMO_CASES.find((d2) => d2.id === 'demo-af-ckd')!.patient });
    expect(['R3', 'R4', 'R5']).toContain(out.answer.risk);
    expect(out.release.humanReviewRequired).toBe(true);
    expect(out.answer.humanReviewRequired).toBe(true);
  });

  it('states coverage honestly when the corpus does not cover the question', async () => {
    const out = await orchestrate({ question: 'ზზზქქქ ჭჭჭ ბბბ არარსებული მდგომარეობა', mode: 'quick' });
    expect(['NOT_COVERED', 'PARTIAL']).toContain(out.kb.coverage);
  });
});
