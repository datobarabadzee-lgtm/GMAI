import { describe, expect, test } from 'vitest';
import { drugMentions, fuzzyInn, latinCandidates, resolveDrugName } from '@/services/drug-naming';
import { AGE_BANDS, ageWarningsFor, parseAgeYears } from '@/knowledge/age-restrictions';
import { analyzeIntake, intakeQuestions } from '@/lib/patient-intake';
import { parseSummary } from '@/services/drug-summary';

describe('brand names and typos', () => {
  test('Georgian brands resolve to INN', () => {
    expect(resolveDrugName('რექსეტინი')).toMatchObject({ inn: 'paroxetine', via: 'brand' });
    expect(resolveDrugName('ცერუკალი')).toMatchObject({ inn: 'metoclopramide', via: 'brand' });
    expect(resolveDrugName('სიმბალტა').inn).toBe('duloxetine');
    expect(latinCandidates('ცერუკალი')[0]).toBe('metoclopramide');
    expect(latinCandidates('rexetin')[0]).toBe('paroxetine');
  });
  test('a typo is asked about, never silently replaced', () => {
    const r = resolveDrugName('მუხჯარო');
    expect(r).toMatchObject({ inn: null, via: 'fuzzy', suggestion: { name: 'მუნჯარო', inn: 'tirzepatide' } });
    expect(r.noteKa).toContain('დაადასტურეთ');
    expect(latinCandidates('მუხჯარო')).not.toContain('tirzepatide');
  });
  test('ordinary words are not turned into drugs', () => {
    expect(fuzzyInn('ბავშვი')).toBeNull();
    expect(drugMentions('შეიძლება ბავშვს მივცე თუ არა')).toEqual([]);
    expect(drugMentions('რექსეტინი 11 წლის ბავშვს შეიძლება?').map((m) => m.inn)).toEqual(['paroxetine']);
  });
});

describe('age restrictions', () => {
  test('paroxetine at 11 is flagged as not to be used', () => {
    const w = ageWarningsFor('paroxetine', 11, 'რექსეტინი');
    expect(w).toHaveLength(1);
    expect(w[0].level).toBe('avoid');
    expect(w[0].ageKa).toBe('11 წლის');
  });
  test('metoclopramide: under 1 contraindicated, under 18 restricted, adult none', () => {
    expect(ageWarningsFor('metoclopramide', 0)[0].level).toBe('contraindicated');
    expect(ageWarningsFor('metoclopramide', 9)[0].level).toBe('restricted');
    expect(ageWarningsFor('metoclopramide', 30)).toEqual([]);
  });
  test('combos and bands', () => {
    expect(ageWarningsFor('tirzepatide', 15)[0].level).toBe('not_established');
    const band = ageWarningsFor('promethazine', AGE_BANDS['1-5'].lo, undefined, AGE_BANDS['1-5']);
    expect(band[0].levelKa).toContain('დააზუსტეთ');
    expect(ageWarningsFor('paroxetine', null)).toEqual([]);
  });
  test('age is read from text, never from a dose', () => {
    expect(parseAgeYears('11 წლის ბავშვი')).toBe(11);
    expect(parseAgeYears('6 თვის ჩვილი')).toBe(0.5);
    expect(parseAgeYears('12 წლამდე შეიძლება?')).toBe(11.5);
    expect(parseAgeYears('20 მგ დღეში')).toBeNull();
  });
});

describe('intake for a drug question', () => {
  test('a brand alone is a drug question; stated age is not asked again', () => {
    const a = analyzeIntake('რექსეტინი 11 წლის ბავშვს');
    expect(a.drugTopic).toBe(true);
    expect(a.drugNamed).toBe(true);
    const ids = intakeQuestions('რექსეტინი 11 წლის ბავშვს').map((q) => q.id);
    expect(ids).not.toContain('detail');
    expect(ids).not.toContain('age');
    expect(intakeQuestions('ცერუკალი შეიძლება?').find((q) => q.id === 'age')?.options?.some((o) => o.value === '6-11')).toBe(true);
  });
});

describe('Georgian label summary is grounded', () => {
  const label = {
    query: 'duloxetine', brandNames: [], genericNames: ['DULOXETINE'], manufacturer: null, route: [], pharmClass: [], sections: [], hasBoxedWarning: false, sourceNoteKa: '',
    raw: { dosage_and_administration: 'Starting dose 30 mg once daily for one week, then 60 mg once daily. Maximum 120 mg.' },
  };
  test('a line with a number absent from the label is dropped', () => {
    const s = parseSummary(JSON.stringify({ whatKa: 'დულოქსეტინი ანტიდეპრესანტია.', dosingKa: ['საწყისი 30 მგ, შემდეგ 60 მგ', 'მაქს. 200 მგ'] }), label);
    expect(s?.dosingKa).toEqual(['საწყისი 30 მგ, შემდეგ 60 მგ']);
    expect(s?.droppedUnverified).toBe(1);
  });
  test('broken JSON yields null, not a crash', () => {
    expect(parseSummary('not json', label)).toBeNull();
  });
});

describe('clinician conversation context', () => {
  test('earlier turns are bounded and malformed ones dropped', async () => {
    const { conversationOf } = await import('@/services/orchestrator');
    const turns = Array.from({ length: 6 }, (_, i) => ({ question: `q${i}`, answer: 'x'.repeat(900) }));
    const c = conversationOf({ conversation: [...turns, { question: 1 }, null] });
    expect(c).toHaveLength(4);
    expect(c[0].question).toBe('q2');
    expect(c[0].answer.length).toBe(700);
    expect(conversationOf({})).toEqual([]);
  });
});

describe('a patient question must name something', () => {
  test('a bare starter is not a question', async () => {
    const { missingDetail, substanceOf } = await import('@/lib/patient-intake');
    expect(missingDetail('რას ნიშნავს დიაგნოზი:')?.textKa).toContain('რომელი დიაგნოზი');
    expect(missingDetail('ამიხსენი ჩემი ანალიზის პასუხი: ')?.textKa).toContain('ანალიზის დასახელება');
    expect(missingDetail('რისთვის მაქვს დანიშნული და როგორ მივიღო: ')?.textKa).toContain('რომელი წამალი');
    expect(missingDetail('რას ნიშნავს დიაგნოზი: ჰიპოთირეოზი')).toBeNull();
    expect(missingDetail('რა ვკითხო ექიმს ვიზიტზე?')).toBeNull();
    expect(missingDetail('ჰემოგლობინი 9.1')).toBeNull();
    // a topic button alone is not content either
    expect(missingDetail('?', { topic: 'diagnosis' })?.textKa).toContain('რომელი დიაგნოზი');
    expect(substanceOf('რას ნიშნავს დიაგნოზი: \n\nდამატებითი ინფორმაცია: თემა: დიაგნოზი მინდა გავიგო.').text).toBe('');
  });
});

describe('patient cards and blood pressure', () => {
  test('symptoms and pressure find their card', async () => {
    const { cardsFor } = await import('@/knowledge/condition-cards');
    const { bloodPressureOf } = await import('@/agents/phase2');
    expect(cardsFor('თავი მტკივა 3 დღეა')[0]?.id).toBe('headache');
    expect(cardsFor('შაკიკი მაქვს, თავი მტკივა')[0]?.id).toBe('migraine');
    expect(cardsFor('წნევა 160/100 მაქვს, რა ვქნა?')[0]?.id).toBe('htn');
    expect(cardsFor('სიცხე მაქვს 38.5')[0]?.id).toBe('fever');
    expect(cardsFor('თავბრუ მეხვევა')[0]?.id).toBe('dizziness');
    expect(cardsFor('მუცელი მტკივა')[0]?.id).toBe('abdominal');
    expect(cardsFor('რას ნიშნავს დიაგნოზი:')).toEqual([]);
    expect(bloodPressureOf('წნევა 185/115 და 140/90')).toEqual({ sys: 185, dia: 115 });
    expect(bloodPressureOf('ჰემოგლობინი 10.2')).toBeNull();
  });
  test('Georgian-market products are assessed, not "not found"', async () => {
    const { screenMedicationList } = await import('@/knowledge/low-value-meds');
    const ids = screenMedicationList('ტრენტალი, ნოვოპასიტი, დულოქსეტინი, ცერებროვინი').map((x) => x.entry.id);
    expect(ids).toEqual(expect.arrayContaining(['cerebrovin', 'novopassit', 'pentoxifylline-cerebral']));
  });
});
