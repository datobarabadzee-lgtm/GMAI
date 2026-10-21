/** Guideline Comparator dataset (Blueprint §8.3). Positions are paraphrased and always source-linked. */

export type GuidelineBody = {
  id: string;
  shortName: string;
  fullName: string;
  sourceId: string;
  jurisdiction: string;
  year: number;
};

export const GUIDELINE_BODIES: GuidelineBody[] = [
  { id: 'esc', shortName: 'ESC 2024', fullName: 'European Society of Cardiology — AF Guidelines', sourceId: 'SRC-ESC-AF-2024', jurisdiction: 'EU', year: 2024 },
  { id: 'acc', shortName: 'ACC/AHA 2023', fullName: 'ACC/AHA/ACCP/HRS AF Guideline', sourceId: 'SRC-ACC-AHA-AF-2023', jurisdiction: 'US', year: 2023 },
  { id: 'nice', shortName: 'NICE NG196', fullName: 'NICE Atrial fibrillation NG196', sourceId: 'SRC-NICE-NG196', jurisdiction: 'UK', year: 2021 },
  { id: 'ahaasa', shortName: 'AHA/ASA 2021', fullName: 'AHA/ASA Secondary Stroke Prevention', sourceId: 'SRC-AHA-ASA-SECONDARY-2021', jurisdiction: 'US', year: 2021 },
  { id: 'ags', shortName: 'AGS Beers 2023', fullName: 'AGS Beers Criteria 2023', sourceId: 'SRC-BEERS-2023', jurisdiction: 'US', year: 2023 },
  { id: 'stopp', shortName: 'STOPP/START v3', fullName: 'STOPP/START criteria version 3', sourceId: 'SRC-STOPPSTART-V3', jurisdiction: 'EU', year: 2023 },
  { id: 'ssc', shortName: 'SSC 2021', fullName: 'Surviving Sepsis Campaign 2021', sourceId: 'SRC-SURVIVING-SEPSIS-2021', jurisdiction: 'International', year: 2021 },
];

export type ComparisonTopic = {
  id: string;
  questionKa: string;
  questionEn: string;
  keywords: string[];
  bodies: string[];
  positions: Record<string, string>;
  consensus: string[];
  differences: string[];
  reasonForDisagreement: string;
  applicableGroups: string;
  georgiaContext: string;
  newestUpdate: string;
};

export const COMPARISON_TOPICS: ComparisonTopic[] = [
  {
    id: 'CMP-AF-OAC',
    questionKa: 'როდის იწყება ორალური ანტიკოაგულაცია არავალვულურ წინაგულების ფიბრილაციაში?',
    questionEn: 'When should oral anticoagulation be initiated in non-valvular atrial fibrillation?',
    keywords: ['ანტიკოაგულაცია', 'anticoagulation', 'AF', 'წინაგულების ფიბრილაცია', 'CHA2DS2', 'DOAC', 'ინსულტის პრევენცია'],
    bodies: ['esc', 'acc', 'nice'],
    positions: {
      esc: 'AF-CARE ჩარჩოში ანტიკოაგულაცია რეკომენდებულია თრომბოემბოლიური რისკის ამაღლებისას; 2024 ვერსია იყენებს CHA2DS2-VA მიდგომას (სქესის კომპონენტის მოხსნით) და ხაზს უსვამს რისკის დინამიკურ გადაფასებას.',
      acc: 'ანტიკოაგულაციის გადაწყვეტილება ეყრდნობა CHA2DS2-VASc-ს; ≥2 (მამაკაცი) ან ≥3 (ქალი) — რეკომენდებულია; 1 (მამაკაცი) / 2 (ქალი) — გონივრულია ინდივიდუალური შეფასებით. აქცენტი AF-ის სტადიაზე და რისკ-ფაქტორების მოდიფიკაციაზე.',
      nice: 'DOAC შეთავაზებული უნდა იყოს CHA2DS2-VASc ≥2-ის შემთხვევაში; მამაკაცებში ქულით 1 — განიხილება. სისხლდენის რისკი ფასდება ORBIT-ით, არა HAS-BLED-ით.',
    },
    consensus: [
      'ანტიკოაგულაციის გადაწყვეტილება არ არის დამოკიდებული რითმის ან სიხშირის კონტროლის სტრატეგიაზე.',
      'DOAC უპირატესია ვარფარინზე არავალვულურ AF-ში, გარდა მექანიკური სარქვლისა და საშუალო/მძიმე მიტრალური სტენოზისა.',
      'სისხლდენის მაღალი რისკი არ არის ანტიკოაგულაციაზე უარის თქმის ავტომატური საფუძველი — იგი მოდიფიცირებადი რისკების კორექციას მოითხოვს.',
    ],
    differences: [
      'ESC 2024 გადავიდა CHA2DS2-VA-ზე; ACC/AHA და NICE ინარჩუნებენ CHA2DS2-VASc-ს სქესის კომპონენტით.',
      'სისხლდენის რისკის ინსტრუმენტი: NICE — ORBIT; ESC/ACC — მოდიფიცირებადი რისკ-ფაქტორების შეფასება HAS-BLED-ის ისტორიული როლით.',
      'ზღვრული ქულების ფორმულირება (≥2 vs „elevated risk“) განსხვავებულია.',
    ],
    reasonForDisagreement:
      'განსხვავება ძირითადად გამოწვეულია პუბლიკაციის წლით, სქესის, როგორც დამოუკიდებელი რისკ-ფაქტორის, ხელახალი ინტერპრეტაციით და ეროვნული ჯანდაცვის სისტემის რესურსული კონტექსტით.',
    applicableGroups: 'არავალვულური AF მქონე მოზრდილები. არ ვრცელდება მექანიკურ სარქველზე და საშუალო/მძიმე მიტრალურ სტენოზზე.',
    georgiaContext:
      'DOAC-ები ხელმისაწვდომია, თუმცა ღირებულება რჩება დამყოლობის მნიშვნელოვან ფაქტორად. ვარფარინის გამოყენებისას რეგიონებში INR-ის რეგულარული კონტროლის უზრუნველყოფა ცალკე დაგეგმვას მოითხოვს — ეს არჩევანზე რეალურად მოქმედი ლოკალური ფაქტორია.',
    newestUpdate: 'ESC 2024 (ყველაზე ახალი ამ თემაზე ამ რეესტრში)',
  },
  {
    id: 'CMP-TIA-DAPT',
    questionKa: 'უნდა დაიწყოს თუ არა ორმაგი ანტითრომბოციტული თერაპია მაღალი რისკის TIA-ს ან მცირე ინსულტის შემდეგ?',
    questionEn: 'Should dual antiplatelet therapy be started after high-risk TIA or minor stroke?',
    keywords: ['TIA', 'DAPT', 'ინსულტი', 'stroke', 'ანტითრომბოციტული', 'clopidogrel', 'aspirin'],
    bodies: ['ahaasa', 'nice'],
    positions: {
      ahaasa: 'შერჩეულ პაციენტებში მცირე არაკარდიოემბოლიური ინსულტით ან მაღალი რისკის TIA-თი მოკლევადიანი ორმაგი ანტითრომბოციტული თერაპია განიხილება ადრეულ პერიოდში, ხანმოკლე ხანგრძლივობით სისხლდენის რისკის გამო.',
      nice: 'ანტითრომბოციტული სტრატეგია განისაზღვრება ეროვნული ინსულტის გზამკვლევის ფარგლებში; ხაზგასმულია სწრაფი სპეციალიზებული შეფასება TIA-ს შემდეგ და ეტიოლოგიის დადგენა.',
    },
    consensus: [
      'TIA არ არის „მსუბუქი“ მოვლენა — იგი მოითხოვს გადაუდებელ შეფასებას და მეორადი პრევენციის დაუყოვნებლივ დაწყებას.',
      'ეტიოლოგიის დადგენა (კარდიოემბოლიური vs ათეროსკლეროზული vs მცირე სისხლძარღვოვანი) განსაზღვრავს პრევენციულ სტრატეგიას.',
      'თუ დადგინდა AF, ანტიკოაგულაცია, და არა ანტითრომბოციტული თერაპია, არის ინსულტის პრევენციის საფუძველი.',
    ],
    differences: [
      'DAPT-ის ხანგრძლივობის ფორმულირება და პაციენტის შერჩევის კრიტერიუმები განსხვავებულად არის გაწერილი.',
      'ბრიტანული მიდგომა უფრო მეტად არის სერვისის ორგანიზებაზე (24-საათიანი TIA კლინიკა) ორიენტირებული.',
    ],
    reasonForDisagreement: 'განსხვავებული პუბლიკაციის წლები და განსხვავებული ჯანდაცვის სერვისის მოდელი.',
    applicableGroups: 'მცირე არაკარდიოემბოლიური ინსულტი ან მაღალი რისკის TIA; არ ვრცელდება სისხლდენის მაღალი რისკის მქონე პაციენტებზე შეფასების გარეშე.',
    georgiaContext:
      '24/7 TIA-კლინიკის მოდელი საქართველოში სისტემურად დანერგილი არ არის. პრაქტიკული შედეგი: მეორადი პრევენციის დაწყება ხშირად პირველადი კონტაქტის ექიმზეა დამოკიდებული, ამიტომ დოკუმენტაციაში რისკის სტრატიფიკაციისა და გადამისამართების დროის ჩაწერა ხარისხის კრიტიკული ელემენტია.',
    newestUpdate: 'AHA/ASA 2021',
  },
  {
    id: 'CMP-PIM-ELDERLY',
    questionKa: 'როგორ უნდა შეფასდეს პოტენციურად არაადეკვატური მედიკამენტები ხანდაზმულ პაციენტში?',
    questionEn: 'How should potentially inappropriate medications be assessed in older adults?',
    keywords: ['Beers', 'STOPP', 'პოლიფარმაცია', 'ხანდაზმული', 'deprescribing', 'polypharmacy'],
    bodies: ['ags', 'stopp'],
    positions: {
      ags: 'ჩამონათვალზე დაფუძნებული მიდგომა: მედიკამენტები, რომლებსაც ხანდაზმულებში თავი უნდა ავარიდოთ, ან რომლებიც გარკვეულ მდგომარეობებში უკუნაჩვენებია (ბენზოდიაზეპინები, ანტიქოლინერგულები, ხანგრძლივი NSAID და სხვ.).',
      stopp: 'ორმხრივი მიდგომა: STOPP — შესაწყვეტი დანიშნულებები; START — გამოტოვებული, ინდიცირებული დანიშნულებები. ვერსია 3 აფართოებს წამალი-დაავადება ურთიერთქმედების კრიტერიუმებს.',
    },
    consensus: [
      'ხანდაზმულებში ანტიქოლინერგული და სედაციური ტვირთი დამოუკიდებელი რისკია დაცემის, დელირიუმისა და კოგნიტური დაქვეითებისთვის.',
      'ბენზოდიაზეპინები არ არის უძილობის ან აგზნების პირველი რიგის მკურნალობა ხანდაზმულებში.',
      'ყოველი დანიშნულება უნდა იყოს დაკავშირებული აქტუალურ ჩვენებასთან.',
    ],
    differences: [
      'Beers ძირითადად „რა არ უნდა დაინიშნოს“; STOPP/START ასევე ფარავს „რა არის გამოტოვებული“.',
      'გეოგრაფიული და ბაზრის სპეციფიკა: Beers ორიენტირებულია აშშ-ს ფორმულარზე, STOPP/START — ევროპულზე.',
    ],
    reasonForDisagreement: 'განსხვავებული მეთოდოლოგია (ექსპერტული კონსენსუსის პროცესი) და განსხვავებული ბაზრის მედიკამენტური სპექტრი.',
    applicableGroups: '65+ ასაკის პაციენტები; კრიტერიუმები საორიენტაციოა და არ ცვლის ინდივიდუალურ კლინიკურ შეფასებას.',
    georgiaContext:
      'საქართველოში ურეცეპტოდ ხელმისაწვდომი NSAID-ებისა და ბენზოდიაზეპინების არაფორმალური მოხმარება ზრდის რეალურ ექსპოზიციას, რომელიც სამედიცინო ბარათში არ ჩანს. მედიკამენტების შეჯერებისას აუცილებელია პირდაპირი კითხვა თვითმკურნალობაზე და მცენარეულ/დანამატ საშუალებებზე.',
    newestUpdate: 'AGS Beers 2023 / STOPP-START v3 (2023)',
  },
];

export function findComparisonTopics(q: string): ComparisonTopic[] {
  const n = q.toLowerCase().trim();
  if (!n) return COMPARISON_TOPICS;
  return COMPARISON_TOPICS.filter(
    (t) => t.questionKa.toLowerCase().includes(n) || t.questionEn.toLowerCase().includes(n) || t.keywords.some((k) => n.includes(k.toLowerCase()) || k.toLowerCase().includes(n)),
  );
}
