import { describe, expect, it } from 'vitest';
import { classifyIntent, classifyRisk, buildPlan, orchestrate } from '@/services/orchestrator';
import { routeModel } from '@/services/model-router';
import { emptyPatientContext } from '@/schemas/clinical';
import { DEMO_CASES } from '@/knowledge/demo-cases';
import { detectRedFlags } from '@/agents/implementations';

const patientWith = (over: Partial<ReturnType<typeof emptyPatientContext>>) => ({ ...emptyPatientContext(), ...over });

describe('intent classification', () => {
  it('routes a dosing question to the drug intent', () => {
    expect(classifyIntent('რა დოზა დავნიშნო აპიქსაბანზე?', 'quick')).toBe('drug');
  });
  it('routes a guideline question to guideline comparison', () => {
    expect(classifyIntent('რას ამბობს ESC გაიდლაინი ამაზე?', 'quick')).toBe('guideline_comparison');
  });
  it('routes a defect question to the medico-legal intent', () => {
    expect(classifyIntent('იყო თუ არა ეს სამედიცინო დეფექტი და საჭიროა ექსპერტიზა?', 'quick')).toBe('defect');
  });
  it('forces patient education in patient mode regardless of wording', () => {
    expect(classifyIntent('რა დოზა უნდა მივიღო?', 'patient')).toBe('patient_education');
  });
  it('falls back to clinical reasoning for an unclassified question', () => {
    expect(classifyIntent('დამეხმარე ამ შემთხვევის გარჩევაში', 'quick')).toBe('clinical_reasoning');
  });
});

describe('risk classification', () => {
  it('assigns R4 to a patient-specific drug question', () => {
    const patient = patientWith({ age: 81, narrative: 'AF, CKD' });
    expect(classifyRisk({ text: 'დოზა', intent: 'drug', mode: 'quick', patient, emergency: false })).toBe('R4');
  });
  it('assigns R5 when an emergency is detected', () => {
    expect(classifyRisk({ text: 'x', intent: 'clinical_reasoning', mode: 'quick', patient: emptyPatientContext(), emergency: true })).toBe('R5');
  });
  it('assigns R1 to educational content', () => {
    expect(classifyRisk({ text: 'x', intent: 'academy', mode: 'quick', patient: emptyPatientContext(), emergency: false })).toBe('R1');
  });
  it('assigns R2 to a general question with no patient context', () => {
    expect(classifyRisk({ text: 'x', intent: 'evidence', mode: 'quick', patient: emptyPatientContext(), emergency: false })).toBe('R2');
  });
});

describe('red flag detection', () => {
  it('detects acute focal neurological deficit', () => {
    expect(detectRedFlags('უეცარი მარჯვენა კიდურების სისუსტე და დიზართრია').length).toBeGreaterThan(0);
  });
  it('detects chest pain', () => {
    expect(detectRedFlags('გულმკერდის ტკივილი 40 წუთი').join(' ')).toContain('კორონარული');
  });
  it('returns nothing for a benign administrative question', () => {
    expect(detectRedFlags('როგორ დავბეჭდო ცნობა')).toEqual([]);
  });
});

describe('model routing', () => {
  it('escalates to the reasoning tier for high risk', () => {
    expect(routeModel({ risk: 'R4', mode: 'quick', intent: 'drug', hasPatientContext: true }).tier).toBe('reasoning');
  });
  it('requires numeric verification for dosing intents', () => {
    expect(routeModel({ risk: 'R4', mode: 'quick', intent: 'drug', hasPatientContext: true }).requireNumericVerification).toBe(true);
  });
  it('always requires the safety gate at R3 and above', () => {
    expect(routeModel({ risk: 'R3', mode: 'deep', intent: 'clinical_reasoning', hasPatientContext: true }).requireSafetyGate).toBe(true);
  });
});

describe('planning', () => {
  it('always retrieves evidence before the parallel stage', () => {
    const plan = buildPlan({ text: 'x', mode: 'deep', intent: 'clinical_reasoning', risk: 'R3', emergency: false, redFlags: [], patient: emptyPatientContext() });
    expect(plan.sequential).toEqual(['A05']);
    expect(plan.parallel).not.toContain('A05');
  });
  it('adds the safety gate to verification at high risk', () => {
    const plan = buildPlan({ text: 'x', mode: 'quick', intent: 'drug', risk: 'R4', emergency: false, redFlags: [], patient: emptyPatientContext() });
    expect(plan.verificationRequired).toContain('A20');
  });
  it('lists missing information when the context is empty', () => {
    const plan = buildPlan({ text: 'x', mode: 'quick', intent: 'clinical_reasoning', risk: 'R2', emergency: false, redFlags: [], patient: emptyPatientContext() });
    expect(plan.missingInformation).toContain('თირკმლის ფუნქცია');
  });
});

describe('end-to-end orchestration (mock engine)', () => {
  it('completes the normal workflow and returns every required section', async () => {
    const demo = DEMO_CASES.find((d) => d.id === 'demo-af-ckd')!;
    const out = await orchestrate({ question: demo.suggestedQuestion, mode: 'deep', patient: demo.patient });
    const ids = out.answer.sections.map((s) => s.id);
    ['assessment', 'reasoning', 'next-steps', 'safety', 'missing', 'evidence', 'georgian', 'uncertainty'].forEach((id) => expect(ids).toContain(id));
    expect(out.answer.bottomLine.length).toBeGreaterThan(10);
    expect(out.answer.engine).toBe('mock');
  });

  it('escalates to human review for a patient-specific high-risk question', async () => {
    const demo = DEMO_CASES.find((d) => d.id === 'demo-polypharmacy')!;
    const out = await orchestrate({ question: 'რომელი მედიკამენტი უნდა შევწყვიტო?', mode: 'deep', patient: demo.patient });
    expect(['R3', 'R4', 'R5']).toContain(out.answer.risk);
    expect(out.answer.humanReviewRequired).toBe(true);
  });

  it('flags a red flag case as an emergency and surfaces it first', async () => {
    const out = await orchestrate({ question: 'პაციენტს აქვს გულმკერდის ტკივილი და ოფლიანობა', mode: 'quick' });
    expect(out.plan.redFlags.length).toBeGreaterThan(0);
    expect(out.answer.risk).toBe('R5');
    expect(out.answer.bottomLine).toContain('გადაუდებელი');
  });

  it('reports missing data instead of inventing it', async () => {
    const out = await orchestrate({ question: 'რა დოზა დავნიშნო აპიქსაბანზე?', mode: 'quick' });
    const missing = out.answer.sections.find((s) => s.id === 'missing');
    expect(missing?.bullets.join(' ')).toMatch(/თირკმლის ფუნქცია|წონა|ასაკი/);
  });

  it('never produces guilt-assigning language in quality mode', async () => {
    const demo = DEMO_CASES.find((d) => d.id === 'demo-quality')!;
    const out = await orchestrate({ question: 'ჩაატარე ხარისხის მიმოხილვა', mode: 'quality', patient: demo.patient });
    const text = [out.answer.bottomLine, ...out.answer.sections.flatMap((s) => [s.body, ...s.bullets])].join(' ');
    // Assertive guilt statements are forbidden; a negated disclaimer is not one.
    expect(text).not.toMatch(/დაუშვა დანაშაული|ბრალეულია|არის ბრალეული|\bis guilty\b|ექიმმა დაარღვია კანონი/);
    expect(out.release.humanReviewRequired).toBe(true);
  });

  it('produces a machine-readable answer that satisfies the output schema', async () => {
    const out = await orchestrate({ question: 'ანტიკოაგულაცია წინაგულების ფიბრილაციაში', mode: 'evidence' });
    expect(out.answer.queryId).toMatch(/[0-9a-f-]{36}/);
    expect(Array.isArray(out.agentResults)).toBe(true);
    expect(out.agentResults.every((r) => typeof r.agentId === 'string')).toBe(true);
  });
});
