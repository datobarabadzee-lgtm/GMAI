import { describe, expect, it } from 'vitest';
import { buildPlan, addMonthsIso, RULES_VERSION } from '@/prevention/engine';
import { score2, score2Band } from '@/prevention/risk/score2';
import { findriscPoints, findriscBand } from '@/prevention/risk/findrisc';
import type { PlanItem, PreventionInput, PreventionPlan } from '@/prevention/types';
import screening from '@/prevention/rules/screening.json';
import sources from '@/prevention/rules/sources.json';

const TODAY = '2026-10-27';

function plan(i: PreventionInput): Extract<PreventionPlan, { kind: 'PLAN' }> {
  const p = buildPlan(i, TODAY);
  if (p.kind !== 'PLAN') throw new Error(`expected PLAN, got ${p.kind}`);
  return p;
}
const group = (p: ReturnType<typeof plan>, g: string): PlanItem | undefined => p.screening.find((s) => s.group === g);
const statusOf = (i: PreventionInput, g: string) => group(plan(i), g)?.status;

describe('prevention — gates', () => {
  it('refuses a plan without age and sex (NEEDS_PATIENT_DATA)', () => {
    expect(buildPlan({}, TODAY).kind).toBe('NEEDS_PATIENT_DATA');
    expect(buildPlan({ age: 50 }, TODAY).kind).toBe('NEEDS_PATIENT_DATA');
    expect(buildPlan({ sex: 'female' }, TODAY).kind).toBe('NEEDS_PATIENT_DATA');
    expect(buildPlan({ age: 16, sex: 'male' }, TODAY).kind).toBe('NEEDS_PATIENT_DATA');
  });

  it('stops on red flags; chest pain is an emergency, rectal bleeding is urgent', () => {
    const e = buildPlan({ age: 50, sex: 'male', redFlags: ['chest-pain'] }, TODAY);
    expect(e.kind).toBe('RED_FLAG_STOP');
    if (e.kind === 'RED_FLAG_STOP') expect(e.emergency).toBe(true);
    const u = buildPlan({ age: 50, sex: 'male', redFlags: ['rectal-bleeding'] }, TODAY);
    if (u.kind !== 'RED_FLAG_STOP') throw new Error();
    expect(u.emergency).toBe(false);
  });

  it('is deterministic and versioned', () => {
    const i: PreventionInput = { age: 58, sex: 'female', smoking: 'current', packYears: 25, heightCm: 165, weightKg: 80 };
    expect(JSON.stringify(buildPlan(i, TODAY))).toBe(JSON.stringify(buildPlan(i, TODAY)));
    expect(plan(i).rulesVersion).toBe(RULES_VERSION);
  });
});

describe('prevention — age boundaries', () => {
  it('colorectal: 44 no, 45 yes, 75 yes, 76 shared decision, 86 no', () => {
    expect(statusOf({ age: 44, sex: 'male' }, 'crc')).toBe('not_needed');
    expect(statusOf({ age: 45, sex: 'male' }, 'crc')).toBe('due');
    expect(statusOf({ age: 75, sex: 'female' }, 'crc')).toBe('due');
    expect(statusOf({ age: 76, sex: 'female' }, 'crc')).toBe('discuss');
    expect(statusOf({ age: 86, sex: 'female' }, 'crc')).toBe('not_needed');
  });

  it('breast: women only, 39 no, 40 yes, 74 yes, 75 shared decision', () => {
    expect(statusOf({ age: 39, sex: 'female' }, 'breast')).toBe('not_needed');
    expect(statusOf({ age: 40, sex: 'female' }, 'breast')).toBe('due');
    expect(statusOf({ age: 74, sex: 'female' }, 'breast')).toBe('due');
    expect(statusOf({ age: 75, sex: 'female' }, 'breast')).toBe('discuss');
    expect(group(plan({ age: 50, sex: 'male' }), 'breast')).toBeUndefined();
  });

  it('cervical: 20 against, 21 cytology q3y, 30 HPV q5y, 65 yes, 66 against', () => {
    expect(statusOf({ age: 20, sex: 'female' }, 'cervical')).toBe('not_needed');
    expect(group(plan({ age: 21, sex: 'female' }), 'cervical')?.intervalMonths).toBe(36);
    expect(group(plan({ age: 30, sex: 'female' }), 'cervical')?.intervalMonths).toBe(60);
    expect(statusOf({ age: 65, sex: 'female' }, 'cervical')).toBe('due');
    expect(statusOf({ age: 66, sex: 'female' }, 'cervical')).toBe('not_needed');
  });

  it('lung: 49 no, 50–80 with ≥20 pack-years, stops 15 years after quitting', () => {
    const heavy: PreventionInput = { sex: 'male', smoking: 'current', packYears: 20 };
    expect(statusOf({ ...heavy, age: 49 }, 'lung')).toBe('not_needed');
    expect(statusOf({ ...heavy, age: 50 }, 'lung')).toBe('due');
    expect(statusOf({ ...heavy, age: 80 }, 'lung')).toBe('due');
    expect(statusOf({ ...heavy, age: 81 }, 'lung')).toBe('not_needed');
    expect(statusOf({ ...heavy, age: 60, packYears: 19 }, 'lung')).toBe('not_needed');
    expect(statusOf({ age: 60, sex: 'male', smoking: 'former', packYears: 30, quitYear: 2011 }, 'lung')).toBe('due');
    expect(statusOf({ age: 60, sex: 'male', smoking: 'former', packYears: 30, quitYear: 2010 }, 'lung')).toBe('not_needed');
    expect(statusOf({ age: 60, sex: 'male', smoking: 'never' }, 'lung')).toBe('not_needed');
  });

  it('lung: missing smoking history is needs_data, not assumed negative', () => {
    const it = group(plan({ age: 60, sex: 'male' }), 'lung')!;
    expect(it.status).toBe('needs_data');
    expect(it.missingKa?.length).toBeGreaterThan(0);
    expect(statusOf({ age: 60, sex: 'male', smoking: 'current' }, 'lung')).toBe('needs_data');
  });

  it('AAA: men 64 no, 65 yes if ever smoked, 75 yes, 76 no; never-smokers no', () => {
    expect(statusOf({ age: 64, sex: 'male', smoking: 'former' }, 'aaa')).toBe('not_needed');
    expect(statusOf({ age: 65, sex: 'male', smoking: 'former' }, 'aaa')).toBe('due');
    expect(statusOf({ age: 75, sex: 'male', smoking: 'current' }, 'aaa')).toBe('due');
    expect(statusOf({ age: 76, sex: 'male', smoking: 'current' }, 'aaa')).toBe('not_needed');
    expect(statusOf({ age: 70, sex: 'male', smoking: 'never' }, 'aaa')).toBe('not_needed');
  });

  it('diabetes: 34 no, 35–70 with BMI ≥25, 71 no; BMI unknown → needs_data', () => {
    const over = { heightCm: 170, weightKg: 80 }; // BMI 27.7
    expect(statusOf({ age: 34, sex: 'male', ...over }, 'diabetes')).toBe('not_needed');
    expect(statusOf({ age: 35, sex: 'male', ...over }, 'diabetes')).toBe('due');
    expect(statusOf({ age: 70, sex: 'male', ...over }, 'diabetes')).toBe('due');
    expect(statusOf({ age: 71, sex: 'male', ...over }, 'diabetes')).toBe('not_needed');
    expect(statusOf({ age: 50, sex: 'male', heightCm: 180, weightKg: 70 }, 'diabetes')).toBe('not_needed');
    expect(statusOf({ age: 50, sex: 'male' }, 'diabetes')).toBe('needs_data');
  });

  it('blood pressure: every 3 years at 39, yearly at 40', () => {
    expect(group(plan({ age: 39, sex: 'male' }), 'bp')?.intervalMonths).toBe(36);
    expect(group(plan({ age: 40, sex: 'male' }), 'bp')?.intervalMonths).toBe(12);
  });

  it('PSA: 54 no, 55–69 shared decision, 70 against', () => {
    expect(statusOf({ age: 54, sex: 'male' }, 'psa')).toBe('not_needed');
    expect(statusOf({ age: 55, sex: 'male' }, 'psa')).toBe('discuss');
    expect(statusOf({ age: 69, sex: 'male' }, 'psa')).toBe('discuss');
    const p70 = group(plan({ age: 70, sex: 'male' }), 'psa')!;
    expect(p70.status).toBe('not_needed');
    expect(p70.id).toBe('psa-70plus');
  });

  it('hepatitis C 18–79, HIV 15–65 (adult module: 18–65)', () => {
    expect(statusOf({ age: 79, sex: 'male' }, 'hcv')).toBe('due');
    expect(statusOf({ age: 80, sex: 'male' }, 'hcv')).toBe('not_needed');
    expect(statusOf({ age: 65, sex: 'male' }, 'hiv')).toBe('due');
    expect(statusOf({ age: 66, sex: 'male' }, 'hiv')).toBe('not_needed');
  });

  it('osteoporosis: women 64 needs menopause status, 65 due; postmenopausal under 65 is a discussion', () => {
    expect(statusOf({ age: 64, sex: 'female' }, 'osteo')).toBe('needs_data');
    expect(statusOf({ age: 64, sex: 'female', postmenopausal: true }, 'osteo')).toBe('discuss');
    expect(statusOf({ age: 65, sex: 'female' }, 'osteo')).toBe('due');
  });
});

describe('prevention — dates and statuses', () => {
  it('adds months safely at month ends', () => {
    expect(addMonthsIso('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonthsIso('2024-01-31', 1)).toBe('2024-02-29');
  });

  it('mammogram 2 years ago is overdue; 1 year ago is up to date with the next date', () => {
    expect(statusOf({ age: 50, sex: 'female', lastDone: { breast: '2024-10-01' } }, 'breast')).toBe('overdue');
    const ok = group(plan({ age: 50, sex: 'female', lastDone: { breast: '2025-11-01' } }), 'breast')!;
    expect(ok.status).toBe('up_to_date');
    expect(ok.nextDue).toBe('2027-11-01');
  });
});

describe('prevention — risk calculators', () => {
  it('SCORE2 matches the published worked examples (Supplementary Table 4)', () => {
    const base = { age: 50, smoker: true, systolicBp: 140, totalChol: 6.3, hdlChol: 1.4 };
    expect(score2({ ...base, sex: 'male', region: 'low' })).toBe(6.3);
    expect(score2({ ...base, sex: 'female', region: 'low' })).toBe(4.3);
    expect(score2({ ...base, sex: 'male', region: 'moderate' })).toBe(8.1);
    expect(score2({ ...base, sex: 'female', region: 'moderate' })).toBe(5.2);
    expect(score2({ ...base, sex: 'male', region: 'high' })).toBe(8.8);
    expect(score2({ ...base, sex: 'female', region: 'high' })).toBe(7.1);
    expect(score2({ ...base, sex: 'male', region: 'very_high' })).toBe(15.1);
    expect(score2({ ...base, sex: 'female', region: 'very_high' })).toBe(14.1);
  });

  it('SCORE2 further reference values and SCORE2-OP', () => {
    expect(score2({ age: 45, sex: 'male', smoker: false, systolicBp: 110, totalChol: 5, hdlChol: 2, region: 'low' })).toBe(1.1);
    expect(score2({ age: 45, sex: 'female', smoker: true, systolicBp: 140, totalChol: 5, hdlChol: 2, region: 'very_high' })).toBe(6);
    expect(score2({ age: 48, sex: 'male', smoker: true, systolicBp: 160, totalChol: 8, hdlChol: 2, region: 'high' })).toBe(10);
    expect(score2({ age: 75, sex: 'male', smoker: true, systolicBp: 140, totalChol: 5.5, hdlChol: 1.3, region: 'low' })).toBe(18.6);
    expect(score2({ age: 75, sex: 'female', smoker: true, systolicBp: 140, totalChol: 5.5, hdlChol: 1.3, region: 'low' })).toBe(15.2);
    expect(score2({ age: 39, sex: 'male', smoker: true, systolicBp: 140, totalChol: 5.5, hdlChol: 1.3 })).toBeNull();
  });

  it('ESC 2021 age-specific categories', () => {
    expect(score2Band(45, 2.4)).toBe('moderate');
    expect(score2Band(45, 2.5)).toBe('high');
    expect(score2Band(45, 7.5)).toBe('very_high');
    expect(score2Band(55, 9.9)).toBe('high');
    expect(score2Band(55, 10)).toBe('very_high');
    expect(score2Band(72, 14.9)).toBe('high');
  });

  it('plan uses the very-high-risk region for Georgia and names the strongest lever', () => {
    const p = plan({ age: 50, sex: 'male', smoking: 'current', systolicBp: 140, totalChol: 6.3, hdlChol: 1.4, cholUnit: 'mmol/L' });
    const r = p.risks.find((x) => x.id === 'score2')!;
    expect(r.value).toBe(15.1);
    expect(r.leverKa).toContain('მოწევის შეწყვეტა');
    expect(r.leverTo!).toBeLessThan(15.1);
  });

  it('SCORE2 is withheld in diabetes and when inputs are missing', () => {
    const d = plan({ age: 55, sex: 'male', conditions: ['diabetes'], smoking: 'never', systolicBp: 130, totalChol: 5, hdlChol: 1.2, cholUnit: 'mmol/L' });
    expect(d.risks.find((x) => x.id === 'score2')!.available).toBe(false);
    const m = plan({ age: 55, sex: 'male', smoking: 'never', systolicBp: 130 });
    const r = m.risks.find((x) => x.id === 'score2')!;
    expect(r.available).toBe(false);
    expect(r.missingKa).toContain('საერთო ქოლესტერინი');
  });

  it('converts mg/dL cholesterol', () => {
    const mmol = plan({ age: 60, sex: 'female', smoking: 'never', systolicBp: 135, totalChol: 5.2, hdlChol: 1.3, cholUnit: 'mmol/L' });
    const mg = plan({ age: 60, sex: 'female', smoking: 'never', systolicBp: 135, totalChol: 5.2 * 38.67, hdlChol: 1.3 * 38.67, cholUnit: 'mg/dL' });
    expect(mg.risks.find((x) => x.id === 'score2')!.value).toBe(mmol.risks.find((x) => x.id === 'score2')!.value);
  });

  it('FINDRISC points and bands', () => {
    const pts = findriscPoints({ age: 50, sex: 'male', bmi: 28, waistCm: 100, activeDaily30: false, vegFruitDaily: false, bpMedication: true, everHighGlucose: false, familyDiabetes: 'first' });
    expect(pts).toBe(2 + 1 + 3 + 2 + 1 + 2 + 0 + 5);
    expect(findriscBand(6).labelKa).toBe('დაბალი');
    expect(findriscBand(7).labelKa).toBe('ოდნავ მომატებული');
    expect(findriscBand(14).band).toBe('moderate');
    expect(findriscBand(15).band).toBe('high');
    expect(findriscBand(21).band).toBe('very_high');
    expect(findriscPoints({ age: 44, sex: 'female', bmi: 24.9, waistCm: 79, activeDaily30: true, vegFruitDaily: true, bpMedication: false, everHighGlucose: false, familyDiabetes: 'none' })).toBe(0);
  });
});

describe('prevention — vaccines, preconception, low value', () => {
  it('pregnancy adds flu, Tdap and RSV and holds HPV/MMR', () => {
    const p = plan({ age: 25, sex: 'female', pregnant: true });
    const ids = p.vaccines.map((v) => v.id);
    expect(ids).toEqual(expect.arrayContaining(['pregnancy_flu', 'pregnancy_tdap', 'pregnancy_rsv']));
    expect(p.vaccines.find((v) => v.id === 'hpv')!.status).toBe('consider');
  });

  it('flu given this season is up to date', () => {
    const p = plan({ age: 40, sex: 'male', vaccines: { influenza: { done: true, lastDate: '2026-10-01' } } });
    expect(p.vaccines.find((v) => v.id === 'influenza')!.status).toBe('up_to_date');
    const q = plan({ age: 40, sex: 'male', vaccines: { influenza: { done: true, lastDate: '2026-03-01' } } });
    expect(q.vaccines.find((v) => v.id === 'influenza')!.status).toBe('recommended');
  });

  it('preconception block appears only for women planning pregnancy', () => {
    expect(plan({ age: 30, sex: 'female', planningPregnancy: true }).preconception?.length).toBeGreaterThan(3);
    expect(plan({ age: 30, sex: 'female' }).preconception).toBeNull();
    expect(plan({ age: 30, sex: 'male', planningPregnancy: true }).preconception).toBeNull();
  });

  it('aspirin and PSA warnings are shown only where they apply', () => {
    expect(plan({ age: 59, sex: 'male' }).lowValue.map((x) => x.id)).not.toContain('aspirin-60');
    expect(plan({ age: 60, sex: 'male' }).lowValue.map((x) => x.id)).toContain('aspirin-60');
    expect(plan({ age: 70, sex: 'female' }).lowValue.map((x) => x.id)).not.toContain('psa-70');
  });

  it('gives one to three goals, smoking first for smokers', () => {
    const p = plan({ age: 50, sex: 'male', smoking: 'current', heightCm: 175, weightKg: 95 });
    expect(p.goals.length).toBeGreaterThanOrEqual(1);
    expect(p.goals.length).toBeLessThanOrEqual(3);
    expect(p.goals[0].id).toBe('quit-smoking');
  });
});

describe('prevention — AI explanation guard', () => {
  it('keeps sentences whose numbers are in the facts and drops invented numbers and doses', async () => {
    const { allowedNumbers, guardExplanation } = await import('@/prevention/explain-guard');
    const allowed = allowedNumbers('მამოგრაფია ორ წელიწადში ერთხელ, 40–74 წელი', 52);
    const g = guardExplanation(
      'თქვენ 52 წლის ხართ და მამოგრაფია გეხებათ. ის 40–74 წლის ქალებს ეხება. ეს რისკს 30%-ით ამცირებს. მიიღეთ 500 მგ კალციუმი. ჩაეწერეთ ვიზიტზე.',
      allowed,
    );
    expect(g.textKa).toBe('თქვენ 52 წლის ხართ და მამოგრაფია გეხებათ. ის 40–74 წლის ქალებს ეხება. ჩაეწერეთ ვიზიტზე.');
    expect(g.dropped).toBe(2);
  });

  it('drops Cyrillic or Armenian sentences', async () => {
    const { guardExplanation } = await import('@/prevention/explain-guard');
    expect(guardExplanation('კარგი. Привет. լավ.', new Set()).textKa).toBe('კარგი.');
  });
});

describe('prevention — rule hygiene', () => {
  it('every rule cites known sources and is DRAFT until clinical review', () => {
    for (const r of screening.rules) {
      expect(r.sources.length).toBeGreaterThan(0);
      r.sources.forEach((s) => expect(Object.keys(sources)).toContain(s));
      expect(['DRAFT', 'CLINICALLY_REVIEWED']).toContain(r.reviewStatus);
    }
  });

  it('Georgian text only — no Armenian or Cyrillic letters in rule files', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(__dirname, '../prevention/rules');
    for (const f of fs.readdirSync(dir)) {
      const t = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(/[԰-֏Ѐ-ӿ]/.test(t), f).toBe(false);
    }
  });
});
