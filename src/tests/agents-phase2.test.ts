import { describe, expect, it } from 'vitest';
import { AGENT_IMPLEMENTATIONS } from '@/agents/implementations';
import type { AgentContext } from '@/agents/context';
import { emptyPatientContext, type PatientContext } from '@/schemas/clinical';
import { analyzeImagingReport, largestMm, looksLikeImagingReport } from '@/lib/imaging-report';
import { resolveTemplate, matchTopic } from '@/agents/phase2';

/**
 * Phase 2 acceptance: the four former stubs must produce content that comes
 * from their engine on a realistic case — and must stay silent rather than
 * invent when the input does not support a finding.
 */

function ctx(over: Omit<Partial<AgentContext>, 'patient'> & { patient?: Partial<PatientContext> } = {}): AgentContext {
  const { patient, ...rest } = over;
  return {
    question: '', plan: '', patient: { ...emptyPatientContext(), ...(patient ?? {}) },
    mode: 'quick', intent: 'clinical_reasoning', risk: 'R2', emergency: false, hits: [],
    reviewMode: 'clinician', academyLevel: 'resident', extras: {}, results: new Map(), ...rest,
  } as AgentContext;
}
const run = (id: string, c: AgentContext) => Promise.resolve(AGENT_IMPLEMENTATIONS[id](c));
const allText = (r: { summary: string; sections: { titleKa: string; body: string; bullets: string[] }[] }) =>
  [r.summary, ...r.sections.flatMap((s) => [s.titleKa, s.body, ...s.bullets])].join('\n');

const CT_CHEST = `გულმკერდის კტ კონტრასტით.
აღწერა: მარჯვენა ფილტვის ზედა წილში აღინიშნება მყარი კვანძი 7 მმ ზომის. პლევრული გამონაჟონი არ აღინიშნება. პნევმოთორაქსი არ ვლინდება.
მარცხენა თირკმელზედა ჯირკვალში წარმონაქმნი 14 მმ.
ფილტვის არტერიის თრომბოემბოლია არ გამოირიცხება სეგმენტურ დონეზე.
დასკვნა: ფილტვის კვანძი 7 მმ. თირკმელზედა ჯირკვლის ინციდენტალომა. რეკომენდებულია განმეორებითი კტ ანგიოგრაფია.`;

describe('A11 imaging — structured report analysis', () => {
  it('parses measurements in mm and cm, including 3-axis sizes', () => {
    expect(largestMm('კვანძი 7 მმ')).toBe(7);
    expect(largestMm('lesion 1.2 x 0.8 cm')).toBe(12);
    expect(largestMm('ზომით 3,4 სმ')).toBe(34);
  });

  it('separates incidental, hedged and negative findings and applies published follow-up rules', () => {
    const a = analyzeImagingReport(CT_CHEST, { age: 62, sex: 'male', egfr: 25 });
    expect(a.modality).toBe('კტ');
    expect(a.hasImpression).toBe(true);
    const labels = a.incidental.map((f) => f.labelKa);
    expect(labels).toContain('ფილტვის კვანძი');
    expect(labels).toContain('თირკმელზედა ჯირკვლის წარმონაქმნი');
    expect(a.incidental.find((f) => f.labelKa === 'ფილტვის კვანძი')?.followUpKa).toMatch(/6–8 მმ — კტ 6–12 თვეში/);
    // "pneumothorax is not seen" is a negative, NOT a critical finding.
    expect(a.critical.map((f) => f.labelKa)).not.toContain('პნევმოთორაქსი');
    expect(a.negatives.some((f) => /პნევმოთორაქს/.test(f.text))).toBe(true);
    // "cannot be excluded" is hedged language, surfaced for the radiologist.
    expect(a.hedged.some((f) => /არ გამოირიცხება/.test(f.text))).toBe(true);
    // Contrast recommended with eGFR 25 must be flagged.
    expect(a.contrastWarnings.length).toBe(1);
  });

  it('flags a critical finding for immediate communication', async () => {
    const r = await run('A11', ctx({ extras: { reportText: 'თავის ტვინის კტ: მარცხენა ჰემისფეროში სუბდურული ჰემატომა 12 მმ, შუა ხაზის ცდომა 6 მმ.' } }));
    expect(r.status).toBe('ok');
    expect(r.summary).toMatch(/კრიტიკული მიგნება/);
    expect(allText(r)).toMatch(/ქალასშიდა სისხლჩაქცევა/);
  });

  it('reads a report pasted into the question, and skips a mere question about imaging', async () => {
    expect(looksLikeImagingReport(CT_CHEST)).toBe(true);
    expect(looksLikeImagingReport('რა არის მრტ?')).toBe(false);
    const r = await run('A11', ctx({ question: CT_CHEST }));
    expect(r.status).toBe('ok');
    const s = await run('A11', ctx({ question: 'როდის არის საჭირო მრტ?' }));
    expect(s.status).toBe('insufficient_input');
  });

  it('applies the thyroid threshold by age and the aortic threshold by sex', () => {
    const young = analyzeImagingReport('კისრის კტ: ფარისებრი ჯირკვლის კვანძი 12 მმ.', { age: 30, sex: 'female', egfr: null });
    expect(young.incidental[0].followUpKa).toMatch(/≥ 10 მმ — ნაჩვენებია/);
    const older = analyzeImagingReport('კისრის კტ: ფარისებრი ჯირკვლის კვანძი 12 მმ.', { age: 50, sex: 'female', egfr: null });
    expect(older.incidental[0].followUpKa).toMatch(/< 15 მმ/);
    const aaa = analyzeImagingReport('მუცლის კტ: ინფრარენული აორტის ანევრიზმა 52 მმ.', { age: 70, sex: 'female', egfr: null });
    expect(aaa.incidental[0].followUpKa).toMatch(/ზღვარი: 50 მმ/);
  });
});

describe('A12 documentation — pre-filled draft and documentation audit', () => {
  it('resolves the template from free text', () => {
    expect(resolveTemplate('', 'მომიმზადე ეპიკრიზი')?.id).toBe('discharge');
    expect(resolveTemplate('', 'ფორმა 100 მჭირდება')?.id).toBe('form100');
    expect(resolveTemplate('referral', '')?.id).toBe('referral');
  });

  it('fills sections from the case and lists real documentation defects', async () => {
    const r = await run('A12', ctx({
      question: 'მომიმზადე ფორმა 100',
      plan: 'გაგრძელდეს აპიქსაბანი, კონტროლი 1 თვეში.',
      patient: {
        age: 78, sex: 'female', narrative: 'პაციენტი შემოვიდა გულის ფრიალის ჩივილით, ეკგ-ზე წინაგულების ფიბრილაცია.',
        problems: ['წინაგულების ფიბრილაცია'],
        medications: [{ id: 'm1', drug: 'აპიქსაბანი', dose: '5 მგ', frequency: '', route: '', indication: '', startDate: '', status: 'active' }],
        labs: [{ id: 'l1', analyte: 'creatinine', value: 1.9, unit: 'mg/dL', date: '' }],
      },
    }));
    expect(r.status).toBe('ok');
    const d = r.data as { templateId: string; completeness: number; checks: string[]; draftMarkdown: string };
    expect(d.templateId).toBe('form100');
    expect(d.completeness).toBeGreaterThan(30);
    expect(d.draftMarkdown).toMatch(/I48/); // ICD-10 suggested from the term registry
    expect(d.checks.join(' ')).toMatch(/ალერგიის სტატუსი/);
    expect(d.checks.join(' ')).toMatch(/დოზა ან სიხშირე აკლია: აპიქსაბანი/);
    expect(allText(r)).toMatch(/QDR-\d+/); // documentation rules from the author's manual
  });

  it('declines with the list of templates when the type is unknown', async () => {
    const r = await run('A12', ctx({ question: 'რაღაც დოკუმენტი' }));
    expect(r.status).toBe('insufficient_input');
    expect(r.note).toMatch(/ეპიკრიზი/);
  });
});

describe('A16 patient — plain language, grounded in the case', () => {
  it('explains terms, labs from the question and unproven medicines', async () => {
    const r = await run('A16', ctx({ question: 'მაქვს წინაგულების ფიბრილაცია, ვიღებ ცერებროლიზინს. ჰემოგლობინი 9.1' , mode: 'patient' }));
    const t = allText(r);
    expect(t).toMatch(/გულის რიტმის დარღვევა/);
    expect(t).toMatch(/ჰემოგლობინ.*ნორმაზე დაბალია/);
    expect(t).toMatch(/ცერებროლიზინ/);
    expect(t).toMatch(/ნუ შეწყვეტთ თვითნებურად/);
    expect(t).toMatch(/ინსულტ|სახის ერთი მხარის/);
  });

  it('does not invent explanations when nothing is recognised', async () => {
    const r = await run('A16', ctx({ question: 'როგორ ვიგრძნო თავი უკეთ?' }));
    expect(r.sections.find((s) => s.titleKa === 'რას ნიშნავს ეს')).toBeUndefined();
    expect(r.sections.find((s) => s.titleEn === 'Red flags')?.bullets.length).toBeGreaterThan(0);
  });
});

describe('A17 academy — curated unit plus live evidence', () => {
  it('matches the curated unit and returns level-specific content with a quiz', async () => {
    expect(matchTopic('ანტიკოაგულაცია წინაგულების ფიბრილაციის დროს')?.id).toBe('af-anticoagulation');
    const r = await run('A17', ctx({ extras: { topic: 'ანტიკოაგულაცია ფიბრილაციის დროს' }, academyLevel: 'gp' }));
    const t = allText(r);
    expect(t).toMatch(/ამბულატორიულ პრაქტიკაში/);
    expect(t).toMatch(/პასუხი: [A-D]/);
    expect(r.sourceIds).toContain('SRC-ESC-AF-2024');
  });

  it('builds a lesson from the quality manual when no curated unit exists', async () => {
    const r = await run('A17', ctx({ extras: { topic: 'ინფორმირებული თანხმობის დოკუმენტირება ოპერაციამდე' } }));
    expect(r.status).toBe('ok');
    expect(allText(r)).toMatch(/QDR-\d+|QAQ-/);
  });
});

describe('lab values inside prose', () => {
  it('reads known analytes with Georgian declension and ignores unknown numbers', async () => {
    const { extractLabsFromProse } = await import('@/lib/labs');
    const v = extractLabsFromProse('ჰემოგლობინის დონე 9,1 გ/დლ, Na 128 და K 3.1. ვიღებ 2 აბს დღეში, ასაკი 70.');
    const by = Object.fromEntries(v.map((x) => [x.analyte, x.value]));
    expect(by['ჰემოგლობინი']).toBe(9.1);
    expect(by['ნატრიუმი']).toBe(128);
    expect(by['კალიუმი']).toBe(3.1);
    expect(v).toHaveLength(3);
  });
});

describe('DOAC dose criteria applied to the patient', () => {
  it('apixaban: 81 y, 58 kg, creatinine 1.6 → 3/3 criteria → 2.5 mg BID', async () => {
    const { evaluateDoac } = await import('@/lib/doac-dosing');
    const r = evaluateDoac('Apixaban', { ...emptyPatientContext(), age: 81, weightKg: 58, creatinineMgDl: 1.6 })!;
    expect(r.doseKa).toBe('2.5 მგ ორჯერ დღეში');
    expect(r.settled).toBe(true);
  });
  it('apixaban: one criterion met and two unknown → not settled', async () => {
    const { evaluateDoac } = await import('@/lib/doac-dosing');
    const r = evaluateDoac('Apixaban', { ...emptyPatientContext(), age: 81 })!;
    expect(r.settled).toBe(false);
    expect(r.doseKa).toBeNull();
  });
  it('apixaban: no criteria met → 5 mg BID', async () => {
    const { evaluateDoac } = await import('@/lib/doac-dosing');
    expect(evaluateDoac('Apixaban', { ...emptyPatientContext(), age: 70, weightKg: 80, creatinineMgDl: 1.0, sex: 'male' })!.doseKa).toBe('5 მგ ორჯერ დღეში');
  });
  it('rivaroxaban and edoxaban follow CrCl and weight thresholds', async () => {
    const { evaluateDoac } = await import('@/lib/doac-dosing');
    const p = { ...emptyPatientContext(), age: 78, weightKg: 70, creatinineMgDl: 1.5, sex: 'male' as const }; // CrCl ≈ 40
    expect(evaluateDoac('Rivaroxaban', p)!.doseKa).toMatch(/^15 მგ/);
    expect(evaluateDoac('edoxaban', p)!.doseKa).toBe('30 მგ დღეში ერთხელ');
    expect(evaluateDoac('dabigatran', { ...p, creatinineMgDl: 3 })!.warningsKa.join(' ')).toMatch(/უკუნაჩვენებია/);
  });
  it('A07 reports the reduced apixaban dose instead of "no adjustment"', async () => {
    const r = await run('A07', ctx({ question: 'რა დოზით დავნიშნო აპიქსაბანი?', extras: { drug: 'apixaban' }, patient: { age: 81, weightKg: 58, creatinineMgDl: 1.6 } }));
    expect(allText(r)).toMatch(/2\.5 მგ ორჯერ დღეში/);
    expect(allText(r)).not.toMatch(/კორექციის საჭიროება ავტომატურ შემოწმებაში არ გამოვლინდა/);
  });
});

describe('extended drug registry', () => {
  it('A07 applies DOAC criteria to dabigatran (now curated)', async () => {
    const r = await run('A07', ctx({ question: 'დაბიგატრანის დოზა', extras: { drug: 'დაბიგატრანი' }, patient: { age: 82, weightKg: 70, creatinineMgDl: 1.1, sex: 'male' } }));
    expect(allText(r)).toMatch(/110 მგ ორჯერ დღეში/);
  });
  it('A07 returns renal steps for gabapentin', async () => {
    const r = await run('A07', ctx({ question: 'გაბაპენტინის დოზა', extras: { drug: 'gabapentin' }, patient: { age: 80, weightKg: 60, creatinineMgDl: 1.8, sex: 'female' } }));
    expect(allText(r)).toMatch(/თირკმლის კორექცია \(CrCl/);
  });
});

describe('patient intake and condition cards', () => {
  it('asks the questions that change the answer for an MS question with symptoms', async () => {
    const { intakeQuestions } = await import('@/lib/patient-intake');
    const qs = intakeQuestions('რას ნიშნავს გაფანტული სკლეროზი? თვალებში გაორება მაქვს და მუხლში სისუსტე');
    const ids = qs.map((q) => q.id);
    expect(ids).toEqual(expect.arrayContaining(['redflags', 'onset', 'diagnosed']));
    expect(qs.length).toBeLessThanOrEqual(4);
  });
  it('asks what the person needs when nothing is recognised', async () => {
    const { intakeQuestions } = await import('@/lib/patient-intake');
    expect(intakeQuestions('გამარჯობა')[0].id).toBe('topic');
  });
  it('A16 gives a full MS explanation and routes a relapse to the neurologist within 1–2 days', async () => {
    const r = await run('A16', ctx({ mode: 'patient', question: 'რას ნიშნავს გაფანტული სკლეროზი? თვალებში გაორება მაქვს და მუხლში სისუსტე', extras: { intake: { answers: { diagnosed: 'yes', onset: 'days', redflags: ['none'] } } } }));
    const t = allText(r);
    expect(t).toMatch(/მიელინ/);
    expect(t).toMatch(/McDonald/);
    expect(t).toMatch(/24–48 საათში/);
    expect((r.data as { urgency: string }).urgency).toBe('soon');
  });
  it('A16 escalates to 112 when a danger sign is ticked', async () => {
    const r = await run('A16', ctx({ mode: 'patient', question: 'თვალებში გაორება მაქვს', extras: { intake: { answers: { redflags: ['stroke'] } } } }));
    expect((r.data as { urgency: string }).urgency).toBe('emergency');
    expect(r.sections[0].titleKa).toMatch(/112/);
  });
});
