import type { PatientContext } from '@/schemas/clinical';

/** DOCUMENTATION TEMPLATES — Georgian clinical and governance documents. */

export type DocTemplate = {
  id: string;
  nameKa: string;
  nameEn: string;
  audience: 'clinician' | 'patient' | 'institution' | 'regulator' | 'insurer';
  sections: string[];
  requiresSignature: boolean;
  noteKa: string;
};

export const DOC_TEMPLATES: DocTemplate[] = [
  { id: 'form100', nameKa: 'ფორმა N IV-100/ა — ჯანმრთელობის მდგომარეობის შესახებ ცნობა', nameEn: 'Form 100', audience: 'clinician', requiresSignature: true, noteKa: 'მინიმალური სრულყოფილება: იდენტიფიკაცია, ანამნეზი, ობიექტური სტატუსი, კვლევები, დიაგნოზი ICD-10 კოდით, მკურნალობა, რეკომენდაციები, ხელმოწერა.', sections: ['პაციენტის მონაცემები', 'მიმართვის მიზეზი', 'ანამნეზი', 'ობიექტური სტატუსი', 'ჩატარებული კვლევები', 'დიაგნოზი (ICD-10)', 'ჩატარებული მკურნალობა', 'რეკომენდაციები', 'შრომისუნარიანობა', 'ექიმი და დაწესებულება'] },
  { id: 'consultation', nameKa: 'კონსულტაციის ჩანაწერი', nameEn: 'Consultation note', audience: 'clinician', requiresSignature: true, noteKa: 'კლინიკური არგუმენტაცია სავალდებულოა — არა მხოლოდ დასკვნა, არამედ მისი საფუძველი.', sections: ['ჩივილები', 'დაავადების ანამნეზი', 'ცხოვრების ანამნეზი და ალერგია', 'მიმდინარე მედიკამენტები', 'ობიექტური სტატუსი', 'დამატებითი კვლევები', 'დიაგნოზი და მისი დასაბუთება', 'დიფერენციული დიაგნოზი', 'დანიშნულება', 'განმეორებითი ვიზიტის კრიტერიუმები'] },
  { id: 'referral', nameKa: 'მიმართვა სპეციალისტთან', nameEn: 'Referral', audience: 'clinician', requiresSignature: true, noteKa: 'მიმართვის დრო და მიზეზი უნდა იყოს დოკუმენტირებული — ეს ხარისხის აუდიტის კრიტიკული ელემენტია.', sections: ['პაციენტის მონაცემები', 'მიმართვის მიზეზი და გადაუდებლობა', 'მოკლე კლინიკური რეზიუმე', 'ჩატარებული კვლევები', 'სამუშაო დიაგნოზი', 'კონკრეტული კითხვა სპეციალისტისთვის', 'მიმართვის თარიღი და დრო'] },
  { id: 'discharge', nameKa: 'ეპიკრიზი / გაწერის დასკვნა', nameEn: 'Discharge summary', audience: 'clinician', requiresSignature: true, noteKa: 'გაწერისას პაციენტმა უნდა იცოდეს რა შემთხვევაში დაბრუნდეს — „გაუარესებისას“ საკმარისი არ არის.', sections: ['ჰოსპიტალიზაციის მიზეზი', 'ძირითადი და თანმხლები დიაგნოზები', 'კლინიკური მიმდინარეობა', 'ჩატარებული კვლევები და პროცედურები', 'ჩატარებული მკურნალობა', 'მდგომარეობა გაწერისას', 'გაწერის დანიშნულებები', 'დაბრუნების კრიტერიუმები', 'შემდგომი დაკვირვების გეგმა'] },
  { id: 'prescription', nameKa: 'დანიშნულების მონახაზი', nameEn: 'Prescription draft', audience: 'clinician', requiresSignature: true, noteKa: 'მონახაზი არ არის რეცეპტი — საჭიროა ექიმის დადასტურება და ხელმოწერა.', sections: ['პაციენტის მონაცემები', 'დიაგნოზი / ჩვენება', 'პრეპარატი (გენერიკული დასახელება)', 'დოზა, სიხშირე, ხანგრძლივობა', 'მიღების წესი', 'მონიტორინგი', 'გაფრთხილებები პაციენტისთვის'] },
  { id: 'certificate', nameKa: 'სამედიცინო ცნობა', nameEn: 'Medical certificate', audience: 'institution', requiresSignature: true, noteKa: 'ცნობა შეიცავს მხოლოდ იმ ინფორმაციას, რაც აუცილებელია მისი დანიშნულებისთვის.', sections: ['პაციენტის მონაცემები', 'ცნობის დანიშნულება', 'დადგენილი ფაქტები', 'შეზღუდვები ან რეკომენდაციები', 'მოქმედების ვადა', 'ექიმი და დაწესებულება'] },
  { id: 'second-opinion', nameKa: 'მეორე აზრის დასკვნა', nameEn: 'Second opinion', audience: 'clinician', requiresSignature: true, noteKa: 'მეორე აზრი აღწერს დამოუკიდებელ შეფასებას და არა პირველი დასკვნის კრიტიკას.', sections: ['მოწოდებული დოკუმენტაცია', 'დამოუკიდებელი კლინიკური რეზიუმე', 'დამოუკიდებელი შეფასება', 'თანხვედრა და განსხვავება', 'დამატებითი რეკომენდებული კვლევები', 'მტკიცებულებითი საფუძველი', 'შეზღუდვები'] },
  { id: 'insurance', nameKa: 'სადაზღვევო დასაბუთება', nameEn: 'Insurance justification', audience: 'insurer', requiresSignature: true, noteKa: 'დასაბუთება ეყრდნობა დოკუმენტირებულ კლინიკურ ფაქტებს და მოქმედ სტანდარტს.', sections: ['პაციენტი და პოლისი', 'დიაგნოზი და მისი დადასტურება', 'მოთხოვნილი მომსახურება', 'კლინიკური აუცილებლობის დასაბუთება', 'განხილული ალტერნატივები', 'მოქმედი სტანდარტის მითითება', 'მოსალოდნელი შედეგი'] },
  { id: 'procedure', nameKa: 'პროცედურის ჩანაწერი', nameEn: 'Procedure note', audience: 'clinician', requiresSignature: true, noteKa: 'ჩანაწერი უნდა იძლეოდეს პროცედურის რეკონსტრუქციის საშუალებას.', sections: ['ჩვენება', 'ინფორმირებული თანხმობა', 'პრეპროცედურული შემოწმება', 'ანესთეზია', 'პროცედურის აღწერა', 'გართულებები', 'პროცედურის შემდგომი გეგმა'] },
  { id: 'operative', nameKa: 'ოპერაციული ჩანაწერის მონახაზი', nameEn: 'Operative note', audience: 'clinician', requiresSignature: true, noteKa: 'ოპერაციული ჩანაწერი ერთდროულად კლინიკური და სამართლებრივი დოკუმენტია.', sections: ['წინაოპერაციული და პოსტოპერაციული დიაგნოზი', 'ჩატარებული ოპერაცია', 'ქირურგიული ბრიგადა', 'ანესთეზიის ტიპი', 'ოპერაციის აღწერა ეტაპობრივად', 'სისხლდენა და გამოყენებული მასალა', 'გართულებები', 'პოსტოპერაციული გეგმა'] },
  { id: 'patient-instructions', nameKa: 'პაციენტის ინსტრუქცია', nameEn: 'Patient instructions', audience: 'patient', requiresSignature: false, noteKa: 'ენა უნდა იყოს მარტივი; დაბრუნების კრიტერიუმები — კონკრეტული.', sections: ['რა დაგიდგინდათ', 'რა უნდა გააკეთოთ', 'მედიკამენტები და მათი მიღება', 'რა შემთხვევაში მიმართოთ სასწრაფოდ', 'შემდეგი ვიზიტი', 'რა კითხვები დაუსვათ ექიმს'] },
  { id: 'sop', nameKa: 'სტანდარტული ოპერაციული პროცედურა (SOP)', nameEn: 'SOP', audience: 'institution', requiresSignature: true, noteKa: 'SOP შეიცავს: სათაურს, სარეგისტრაციო ნომერს, ვერსიას, გამოცემის თარიღს, ძალაში შესვლის თარიღს, შემდეგი განხილვის თარიღს და დამტკიცების ველს.', sections: ['სათაური და სარეგისტრაციო ნომერი', 'ვერსია, გამოცემის და ძალაში შესვლის თარიღი', 'მიზანი', 'გამოყენების სფერო', 'ტერმინები და განმარტებები', 'პასუხისმგებლობები', 'პროცედურის აღწერა ეტაპობრივად', 'ჩანაწერები და ფორმები', 'ინდიკატორები და მონიტორინგი', 'დანართები', 'შემდეგი განხილვის თარიღი', 'დამტკიცება'] },
  { id: 'protocol', nameKa: 'კლინიკური პროტოკოლი', nameEn: 'Clinical protocol', audience: 'institution', requiresSignature: true, noteKa: 'პროტოკოლი განსხვავდება რეკომენდაციისგან: იგი სავალდებულოა დაწესებულების შიგნით.', sections: ['სათაური და ვერსია', 'მიზანი და სამიზნე პოპულაცია', 'ჩვენებები და უკუჩვენებები', 'ალგორითმი ეტაპობრივად', 'პასუხისმგებელი პირები', 'დროითი სტანდარტები', 'დოკუმენტირების მოთხოვნები', 'ხარისხის ინდიკატორები', 'მტკიცებულებითი საფუძველი', 'დამტკიცება'] },
  { id: 'algorithm', nameKa: 'კლინიკური ალგორითმი', nameEn: 'Clinical algorithm', audience: 'clinician', requiresSignature: true, noteKa: 'ალგორითმი უნდა იყოს ცალსახა: ყოველ ნაბიჯზე გადაწყვეტილების კრიტერიუმი განსაზღვრული.', sections: ['საწყისი წერტილი და ტრიგერი', 'შეფასების ნაბიჯები', 'გადაწყვეტილების წერტილები და კრიტერიუმები', 'ესკალაციის წესი', 'დროითი ზღვრები', 'დოკუმენტირება', 'გამონაკლისები'] },
  { id: 'guideline-draft', nameKa: 'გაიდლაინის მონახაზი', nameEn: 'Guideline draft', audience: 'institution', requiresSignature: true, noteKa: 'ყოველი რეკომენდაცია საჭიროებს მტკიცებულების დონისა და ძალის მითითებას.', sections: ['სფერო და კითხვები', 'მეთოდოლოგია', 'რეკომენდაციები მტკიცებულების დონით', 'დასაბუთება', 'იმპლემენტაციის საკითხები', 'ინდიკატორები', 'განახლების ვადა', 'ავტორები და ინტერესთა კონფლიქტი'] },
];

export const templateById = (id: string) => DOC_TEMPLATES.find((t) => t.id === id);

const line = (label: string, value: string) => `${label}: ${value || '—'}`;

export function renderDocument(template: DocTemplate, patient: PatientContext, extra: { clinicalData: string; author: string; institution: string; date: string }): string {
  const header = [
    `# ${template.nameKa}`,
    '',
    line('დაწესებულება', extra.institution),
    line('თარიღი', extra.date),
    line('ქეისი', patient.label),
    '',
    '---',
    '',
  ];

  const snapshot = [
    '## პაციენტის მონაცემები',
    line('ასაკი', patient.age !== null ? `${patient.age} წელი` : ''),
    line('სქესი', patient.sex === 'male' ? 'მამრობითი' : patient.sex === 'female' ? 'მდედრობითი' : ''),
    line('ალერგიები', patient.allergies.join(', ')),
    line('აქტიური პრობლემები', patient.problems.join('; ')),
    line('მიმდინარე მედიკამენტები', patient.medications.filter((m) => m.status === 'active').map((m) => `${m.drug} ${m.dose} ${m.frequency}`.trim()).join('; ')),
    '',
  ];

  const body = template.sections.map((s) => `## ${s}\n${s.includes('პაციენტის მონაცემები') ? '' : '_შესავსებია_'}\n`);

  const clinical = extra.clinicalData.trim() ? ['## კლინიკური მონაცემები (შეყვანილი)', extra.clinicalData.trim(), ''] : [];

  const isSop = template.id === 'sop' || template.id === 'protocol' || template.id === 'guideline-draft' || template.id === 'algorithm';
  const governance = isSop
    ? ['---', '', line('სარეგისტრაციო ნომერი', `${template.id.toUpperCase()}-001`), line('ვერსია', '1.0'), line('გამოცემის თარიღი', '01/09/2024'), line('ძალაში შესვლის თარიღი', '01/09/2024'), line('შემდეგი განხილვის თარიღი', '01/09/2026'), '', 'დაამტკიცა: Davit Barabadze', '']
    : [];

  const footer = [
    '---',
    '',
    template.requiresSignature ? `ექიმი: ${extra.author || '________________'}\nხელმოწერა: ________________   თარიღი: ${extra.date}` : '',
    '',
    `_${template.noteKa}_`,
    '',
    '_დოკუმენტი მომზადებულია კლინიკური გადაწყვეტილების მხარდაჭერის სისტემით და ძალაშია მხოლოდ პასუხისმგებელი ექიმის დადასტურებით._',
  ];

  return [...header, ...snapshot, ...clinical, ...body, ...governance, ...footer].join('\n');
}
