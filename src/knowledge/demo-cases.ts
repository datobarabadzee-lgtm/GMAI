import type { PatientContext } from '@/schemas/clinical';
import { PatientContextSchema } from '@/schemas/clinical';

/** Fictional demonstration cases. No real patient data. */
export type DemoCase = {
  id: string;
  titleKa: string;
  summaryKa: string;
  tag: string;
  suggestedQuestion: string;
  patient: PatientContext;
};

const c = (p: unknown): PatientContext => PatientContextSchema.parse(p);

export const DEMO_CASES: DemoCase[] = [
  {
    id: 'demo-tia',
    titleKa: 'TIA / ინსულტის რისკი',
    summaryKa: '68 წლის მამაკაცი 40-წუთიანი მარჯვენა კიდურების სისუსტისა და დიზართრიის ეპიზოდით, სრული რეგრესით.',
    tag: 'ნევროლოგია',
    suggestedQuestion: 'რა არის ამ პაციენტის მეორადი პრევენციის ოპტიმალური სტრატეგია და რა კვლევებია გადაუდებელი?',
    patient: c({
      label: 'დემო: TIA 68 წ.',
      age: 68,
      sex: 'male',
      weightKg: 84,
      heightCm: 174,
      creatinineMgDl: 1.1,
      problems: ['არტერიული ჰიპერტენზია', 'ტიპი 2 შაქრიანი დიაბეტი', 'დისლიპიდემია', 'მწეველი 30 პაკეტი/წელი'],
      allergies: [],
      medications: [
        { id: 'm1', drug: 'Metformin', dose: '1000 მგ', frequency: 'ორჯერ დღეში', route: 'per os', indication: 'ტიპი 2 დიაბეტი', startDate: '2019-03', status: 'active' },
        { id: 'm2', drug: 'Atorvastatin', dose: '20 მგ', frequency: 'დღეში ერთხელ', route: 'per os', indication: 'დისლიპიდემია', startDate: '2021-06', status: 'active' },
      ],
      labs: [
        { id: 'l1', analyte: 'Creatinine', value: 1.1, unit: 'მგ/დლ', date: '2026-09-10', refLow: 0.7, refHigh: 1.3 },
        { id: 'l2', analyte: 'HbA1c', value: 7.9, unit: '%', date: '2026-09-10', refLow: 4, refHigh: 5.7 },
        { id: 'l3', analyte: 'LDL', value: 3.4, unit: 'მმოლ/ლ', date: '2026-09-10', refLow: 0, refHigh: 2.6 },
      ],
      timeline: [
        { id: 't1', date: '2026-09-12 08:20', category: 'symptom', title: 'მარჯვენა კიდურების სისუსტე და დიზართრია', detail: 'დაწყება მოულოდნელი, ხანგრძლივობა ~40 წუთი, სრული რეგრესი' },
        { id: 't2', date: '2026-09-12 11:00', category: 'encounter', title: 'მიმართვა ამბულატორიაში', detail: 'ნევროლოგიური სტატუსი ნორმაში' },
        { id: 't3', date: '2026-09-12 12:30', category: 'investigation', title: 'ეკგ', detail: 'სინუსური რითმი; წინაგულების ფიბრილაცია არ დაფიქსირებულა' },
      ],
      narrative:
        '68 წლის მამაკაცი. გუშინ დილით მოულოდნელად განუვითარდა მარჯვენა ხელისა და ფეხის სისუსტე და მეტყველების გაუგებრობა. სიმპტომები სრულად გაიარა დაახლოებით 40 წუთში. მიმართა მეორე დღეს. AD 168/94 მმვწყ. ნევროლოგიური სტატუსი ამჟამად ნორმაშია.',
    }),
  },
  {
    id: 'demo-af-ckd',
    titleKa: 'AF + ანტიკოაგულაცია + თირკმლის უკმარისობა',
    summaryKa: '81 წლის ქალი ახლად დიაგნოსტირებული წინაგულების ფიბრილაციით, CKD 3b და დაცემის ანამნეზით.',
    tag: 'კარდიოლოგია',
    suggestedQuestion: 'რომელი ანტიკოაგულანტი და რა დოზა არის ამ პაციენტისთვის ყველაზე დასაბუთებული?',
    patient: c({
      label: 'დემო: AF + CKD 81 წ.',
      age: 81,
      sex: 'female',
      weightKg: 58,
      heightCm: 158,
      creatinineMgDl: 1.6,
      egfr: 32,
      problems: ['წინაგულების ფიბრილაცია (ახლად დიაგნოსტირებული)', 'არტერიული ჰიპერტენზია', 'ქრონიკული თირკმლის დაავადება 3b', 'ორი დაცემა ბოლო 12 თვეში', 'გასტროეზოფაგური რეფლუქსი'],
      allergies: ['პენიცილინი — გამონაყარი'],
      medications: [
        { id: 'm1', drug: 'Furosemide', dose: '40 მგ', frequency: 'დღეში ერთხელ', route: 'per os', indication: 'შეშუპება', startDate: '2023-01', status: 'active' },
        { id: 'm2', drug: 'Omeprazole', dose: '20 მგ', frequency: 'დღეში ერთხელ', route: 'per os', indication: 'GERD', startDate: '2018-05', status: 'active' },
        { id: 'm3', drug: 'Ibuprofen', dose: '400 მგ', frequency: 'საჭიროებისამებრ', route: 'per os', indication: 'მუხლის ტკივილი', startDate: '2024-02', status: 'active' },
      ],
      labs: [
        { id: 'l1', analyte: 'Creatinine', value: 1.6, unit: 'მგ/დლ', date: '2026-09-11', refLow: 0.5, refHigh: 1.1 },
        { id: 'l2', analyte: 'Hemoglobin', value: 10.4, unit: 'გ/დლ', date: '2026-09-11', refLow: 12, refHigh: 15.5 },
        { id: 'l3', analyte: 'Potassium', value: 3.2, unit: 'მმოლ/ლ', date: '2026-09-11', refLow: 3.5, refHigh: 5.1 },
      ],
      timeline: [
        { id: 't1', date: '2026-09-11', category: 'encounter', title: 'გეგმიური ვიზიტი', detail: 'პულსი არარეგულარული, 96/წთ' },
        { id: 't2', date: '2026-09-11', category: 'investigation', title: 'ეკგ', detail: 'წინაგულების ფიბრილაცია, პარკუჭების სიხშირე 96/წთ' },
      ],
      narrative:
        '81 წლის ქალი გეგმიურ ვიზიტზე. ეკგ-ზე დაფიქსირდა წინაგულების ფიბრილაცია. ბოლო 12 თვეში ორი დაცემა მოტეხილობის გარეშე. იღებს იბუპროფენს მუხლის ტკივილის გამო თითქმის ყოველდღიურად. ჰემოგლობინი დაქვეითებულია.',
    }),
  },
  {
    id: 'demo-polypharmacy',
    titleKa: 'პოლიფარმაცია ხანდაზმულ პაციენტში',
    summaryKa: '77 წლის ქალი 9 მედიკამენტით, თავბრუსხვევით, დაბნეულობითა და დაცემის ეპიზოდით.',
    tag: 'გერიატრია',
    suggestedQuestion: 'რომელი მედიკამენტებია ამ პაციენტში დეპრესკრაიბინგის კანდიდატი და როგორ უნდა შემცირდეს ისინი?',
    patient: c({
      label: 'დემო: პოლიფარმაცია 77 წ.',
      age: 77,
      sex: 'female',
      weightKg: 62,
      heightCm: 160,
      creatinineMgDl: 1.2,
      egfr: 44,
      problems: ['არტერიული ჰიპერტენზია', 'გულის უკმარისობა', 'ქრონიკული ტკივილი', 'უძილობა', 'დეპრესია', 'GERD', 'ოსტეოართრიტი'],
      allergies: [],
      medications: [
        { id: 'm1', drug: 'Amitriptyline', dose: '25 მგ', frequency: 'ღამით', route: 'per os', indication: 'უძილობა / ტკივილი', startDate: '2017-09', status: 'active' },
        { id: 'm2', drug: 'Diazepam', dose: '5 მგ', frequency: 'ღამით', route: 'per os', indication: 'შფოთვა', startDate: '2016-04', status: 'active' },
        { id: 'm3', drug: 'Tramadol', dose: '50 მგ', frequency: 'სამჯერ დღეში', route: 'per os', indication: 'ქრონიკული ტკივილი', startDate: '2022-11', status: 'active' },
        { id: 'm4', drug: 'Sertraline', dose: '50 მგ', frequency: 'დღეში ერთხელ', route: 'per os', indication: 'დეპრესია', startDate: '2021-02', status: 'active' },
        { id: 'm5', drug: 'Omeprazole', dose: '20 მგ', frequency: 'დღეში ერთხელ', route: 'per os', indication: 'ჩვენება ბუნდოვანია', startDate: '2015-01', status: 'active' },
        { id: 'm6', drug: 'Furosemide', dose: '40 მგ', frequency: 'დღეში ერთხელ', route: 'per os', indication: 'გულის უკმარისობა', startDate: '2020-07', status: 'active' },
        { id: 'm7', drug: 'Ibuprofen', dose: '400 მგ', frequency: 'ორჯერ დღეში', route: 'per os', indication: 'ოსტეოართრიტი', startDate: '2023-03', status: 'active' },
        { id: 'm8', drug: 'Atorvastatin', dose: '20 მგ', frequency: 'დღეში ერთხელ', route: 'per os', indication: 'პირველადი პრევენცია', startDate: '2019-05', status: 'active' },
        { id: 'm9', drug: 'Digoxin', dose: '0.25 მგ', frequency: 'დღეში ერთხელ', route: 'per os', indication: 'გულის უკმარისობა', startDate: '2020-07', status: 'active' },
      ],
      labs: [
        { id: 'l1', analyte: 'Creatinine', value: 1.2, unit: 'მგ/დლ', date: '2026-09-09', refLow: 0.5, refHigh: 1.1 },
        { id: 'l2', analyte: 'Sodium', value: 128, unit: 'მმოლ/ლ', date: '2026-09-09', refLow: 135, refHigh: 145 },
        { id: 'l3', analyte: 'Potassium', value: 3.1, unit: 'მმოლ/ლ', date: '2026-09-09', refLow: 3.5, refHigh: 5.1 },
      ],
      timeline: [
        { id: 't1', date: '2026-09-08', category: 'symptom', title: 'დაცემა სახლში', detail: 'ღამით ტუალეტში გასვლისას; მოტეხილობის გარეშე' },
        { id: 't2', date: '2026-09-09', category: 'encounter', title: 'ოჯახის ექიმთან ვიზიტი', detail: 'თავბრუსხვევა, დღის განმავლობაში ძილიანობა, დაბნეულობა' },
      ],
      narrative:
        '77 წლის ქალი დაცემის, თავბრუსხვევისა და კოგნიტური „ნისლის“ ჩივილებით. იღებს 9 მედიკამენტს. ნატრიუმი 128 მმოლ/ლ. ოჯახი აღნიშნავს, რომ ბოლო თვეებში გახდა ძალიან ძილიანი.',
    }),
  },
  {
    id: 'demo-ob',
    titleKa: 'ორსულობა / რეპროდუქციული მედიცინა',
    summaryKa: '34 წლის ქალი IVF-ის შემდეგ, 7 კვირის ორსულობა, მუცლის ტკივილი და მზარდი მუცლის მოცულობა.',
    tag: 'რეპროდუქციული მედიცინა',
    suggestedQuestion: 'რა დიფერენციული დიაგნოზი უნდა განვიხილო და რა არის გადაუდებელი „must not miss“?',
    patient: c({
      label: 'დემო: IVF ორსულობა 34 წ.',
      age: 34,
      sex: 'female',
      pregnant: 'yes',
      weightKg: 66,
      heightCm: 165,
      problems: ['IVF-ის შემდგომი ორსულობა 7 კვირა', 'პოლიკისტოზური საკვერცხის სინდრომი', 'ოვარიული სტიმულაცია 3 კვირის წინ'],
      allergies: [],
      medications: [
        { id: 'm1', drug: 'Progesterone', dose: '600 მგ', frequency: 'დღეში', route: 'ვაგინალური', indication: 'ლუტეინური ფაზის მხარდაჭერა', startDate: '2026-08', status: 'active' },
      ],
      labs: [
        { id: 'l1', analyte: 'Hematocrit', value: 47, unit: '%', date: '2026-09-13', refLow: 36, refHigh: 44 },
        { id: 'l2', analyte: 'Creatinine', value: 0.9, unit: 'მგ/დლ', date: '2026-09-13', refLow: 0.5, refHigh: 1.1 },
      ],
      timeline: [
        { id: 't1', date: '2026-08-22', category: 'procedure', title: 'ემბრიონის გადატანა', detail: 'ერთი ბლასტოცისტა' },
        { id: 't2', date: '2026-09-13', category: 'symptom', title: 'მუცლის შებერილობა და ტკივილი', detail: 'წონის მატება 2 კგ 4 დღეში, შარდის რაოდენობის კლება' },
      ],
      narrative:
        '34 წლის ქალი IVF ციკლის შემდეგ, ორსულობა 7 კვირა. ბოლო 4 დღეა აღნიშნავს მუცლის შებერილობას, ტკივილს და წონის მატებას. ჰემატოკრიტი 47%.',
    }),
  },
  {
    id: 'demo-pain',
    titleKa: 'ქრონიკული ტკივილი / ნევროლოგია',
    summaryKa: '52 წლის მამაკაცი ორმხრივი ფეხების წვით და დისესთეზიით, ღამით გაძლიერებით.',
    tag: 'ნევროლოგია',
    suggestedQuestion: 'რა არის ყველაზე სავარაუდო დიაგნოზი და რომელი კვლევებია დიფერენცირებისთვის საჭირო?',
    patient: c({
      label: 'დემო: ნეიროპათიული ტკივილი 52 წ.',
      age: 52,
      sex: 'male',
      weightKg: 92,
      heightCm: 178,
      creatinineMgDl: 1.0,
      problems: ['ტიპი 2 შაქრიანი დიაბეტი 11 წელი', 'სიმსუქნე', 'ალკოჰოლის რეგულარული მოხმარება'],
      allergies: [],
      medications: [
        { id: 'm1', drug: 'Metformin', dose: '1000 მგ', frequency: 'ორჯერ დღეში', route: 'per os', indication: 'ტიპი 2 დიაბეტი', startDate: '2015-01', status: 'active' },
      ],
      labs: [
        { id: 'l1', analyte: 'HbA1c', value: 9.2, unit: '%', date: '2026-09-05', refLow: 4, refHigh: 5.7 },
        { id: 'l2', analyte: 'Vitamin B12', value: 148, unit: 'პმოლ/ლ', date: '2026-09-05', refLow: 150, refHigh: 700 },
        { id: 'l3', analyte: 'TSH', value: 2.1, unit: 'მიერთ/ლ', date: '2026-09-05', refLow: 0.4, refHigh: 4.0 },
      ],
      timeline: [
        { id: 't1', date: '2026-06', category: 'symptom', title: 'ფეხების წვის შეგრძნება', detail: 'თანდათანობითი დაწყება, სიმეტრიული, დისტალური' },
        { id: 't2', date: '2026-09-05', category: 'investigation', title: 'ლაბორატორიული პანელი', detail: 'HbA1c 9.2%, B12 148 პმოლ/ლ' },
      ],
      narrative:
        '52 წლის მამაკაცი 3 თვეა აღნიშნავს ორივე ფეხის ტერფის წვას და ჩხვლეტას, ღამით გაძლიერებით. დიაბეტი 11 წელია, კონტროლი არადამაკმაყოფილებელი. მიიღებს მეტფორმინს 11 წელია.',
    }),
  },
  {
    id: 'demo-quality',
    titleKa: 'ხარისხის / დეფექტის მიმოხილვა',
    summaryKa: '59 წლის მამაკაცი გულმკერდის ტკივილით გაეწერა ამბულატორიულად; 3 დღის შემდეგ — მიოკარდიუმის ინფარქტი.',
    tag: 'ხარისხი და უსაფრთხოება',
    suggestedQuestion: 'ჩაატარე ამ ქეისის ხარისხის მიმოხილვა და დაადგინე პოტენციური გადახვევები სტანდარტიდან.',
    patient: c({
      label: 'დემო: ხარისხის მიმოხილვა 59 წ.',
      age: 59,
      sex: 'male',
      weightKg: 88,
      heightCm: 176,
      problems: ['არტერიული ჰიპერტენზია', 'მწეველი', 'ოჯახური ანამნეზი: მამა — ინფარქტი 55 წლის ასაკში'],
      allergies: [],
      medications: [{ id: 'm1', drug: 'Amlodipine', dose: '5 მგ', frequency: 'დღეში ერთხელ', route: 'per os', indication: 'ჰიპერტენზია', startDate: '2022-03', status: 'active' }],
      labs: [],
      timeline: [
        { id: 't1', date: '2026-09-06 21:40', category: 'encounter', title: 'მიმართვა გადაუდებელ განყოფილებაში', detail: 'გულმკერდის ტკივილი 40 წუთი, დაწოლის შეგრძნება, ოფლიანობა' },
        { id: 't2', date: '2026-09-06 22:10', category: 'investigation', title: 'ეკგ', detail: 'ჩანაწერში მითითებულია „ცვლილებების გარეშე“; ეკგ-ს ასლი ბარათს არ ერთვის' },
        { id: 't3', date: '2026-09-06 22:30', category: 'document', title: 'გაწერა', detail: 'დიაგნოზი: „კარდიალგია“. ტროპონინი არ ჩატარებულა. განმეორებითი ეკგ არ ჩატარებულა. რეკომენდაცია: ამბულატორიული დაკვირვება.' },
        { id: 't4', date: '2026-09-09 06:15', category: 'encounter', title: 'განმეორებითი მიმართვა', detail: 'STEMI; გადაუდებელი კორონაროგრაფია' },
      ],
      narrative:
        '59 წლის მამაკაცი მიმართა გადაუდებელ განყოფილებაში ტიპური გულმკერდის ტკივილით. ჩატარდა ერთი ეკგ, ტროპონინი არ განსაზღვრულა, განმეორებითი ეკგ არ ჩატარებულა, პაციენტი გაიწერა დიაგნოზით „კარდიალგია“. სამი დღის შემდეგ დადგინდა STEMI. ინფორმირებული თანხმობა გაწერაზე და მიცემული გამაფრთხილებელი რეკომენდაციები ბარათში არ არის დოკუმენტირებული.',
    }),
  },
];

export const demoCaseById = (id: string) => DEMO_CASES.find((d) => d.id === id);
