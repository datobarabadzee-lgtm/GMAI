/**
 * CLINICAL CALCULATOR REGISTRY — deterministic TypeScript only.
 * No LLM arithmetic is ever used for a score, dose or threshold (master spec §29).
 */

export type CalcFieldType = 'number' | 'boolean' | 'select';

export type CalcField = {
  key: string;
  labelKa: string;
  type: CalcFieldType;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; labelKa: string; points?: number }[];
  help?: string;
};

export type CalcResult = {
  value: number;
  display: string;
  unit?: string;
  interpretationKa: string;
  severity: 'low' | 'moderate' | 'high' | 'critical' | 'info';
  breakdown: { labelKa: string; points: number }[];
  caveatsKa: string[];
};

export type Calculator = {
  id: string;
  name: string;
  nameKa: string;
  category: 'cardiology' | 'neurology' | 'respiratory' | 'critical_care' | 'hepatology' | 'nephrology' | 'general' | 'haematology';
  purposeKa: string;
  formulaKa: string;
  sourceIds: string[];
  fields: CalcField[];
  compute: (input: Record<string, number | boolean | string>) => CalcResult;
};

const n = (v: unknown, d = 0): number => {
  const x = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : v === true ? 1 : 0;
  return Number.isFinite(x) ? (x as number) : d;
};
const b = (v: unknown): boolean => v === true || v === 'true' || v === 1;
const round = (x: number, dp = 1) => Math.round(x * 10 ** dp) / 10 ** dp;

const sum = (parts: { labelKa: string; points: number }[]) => parts.reduce((a, p) => a + p.points, 0);

export const CALCULATORS: Calculator[] = [
  {
    id: 'cha2ds2-vasc',
    name: 'CHA2DS2-VASc',
    nameKa: 'CHA₂DS₂-VASc — ინსულტის რისკი AF-ში',
    category: 'cardiology',
    purposeKa: 'თრომბოემბოლიური რისკის სტრატიფიკაცია არავალვულურ წინაგულების ფიბრილაციაში.',
    formulaKa: 'C(1) + H(1) + A₂(2, ასაკი ≥75) + D(1) + S₂(2, ინსულტი/TIA/თრომბოემბოლია) + V(1) + A(1, ასაკი 65–74) + Sc(1, მდედრობითი სქესი)',
    sourceIds: ['SRC-LIP-CHADSVASC-2010', 'SRC-ACC-AHA-AF-2023', 'SRC-ESC-AF-2024'],
    fields: [
      { key: 'chf', labelKa: 'გულის შეგუბებითი უკმარისობა / მარცხენა პარკუჭის დისფუნქცია', type: 'boolean' },
      { key: 'htn', labelKa: 'არტერიული ჰიპერტენზია', type: 'boolean' },
      { key: 'age', labelKa: 'ასაკი', type: 'number', unit: 'წელი', min: 0, max: 120 },
      { key: 'dm', labelKa: 'შაქრიანი დიაბეტი', type: 'boolean' },
      { key: 'stroke', labelKa: 'ინსულტი / TIA / თრომბოემბოლია ანამნეზში', type: 'boolean' },
      { key: 'vascular', labelKa: 'სისხლძარღვოვანი დაავადება (MI, PAD, აორტის ფოლაქი)', type: 'boolean' },
      { key: 'female', labelKa: 'მდედრობითი სქესი', type: 'boolean' },
    ],
    compute: (i) => {
      const age = n(i.age);
      const parts = [
        { labelKa: 'გულის უკმარისობა', points: b(i.chf) ? 1 : 0 },
        { labelKa: 'ჰიპერტენზია', points: b(i.htn) ? 1 : 0 },
        { labelKa: 'ასაკი ≥75', points: age >= 75 ? 2 : 0 },
        { labelKa: 'ასაკი 65–74', points: age >= 65 && age < 75 ? 1 : 0 },
        { labelKa: 'დიაბეტი', points: b(i.dm) ? 1 : 0 },
        { labelKa: 'ინსულტი / TIA / თრომბოემბოლია', points: b(i.stroke) ? 2 : 0 },
        { labelKa: 'სისხლძარღვოვანი დაავადება', points: b(i.vascular) ? 1 : 0 },
        { labelKa: 'მდედრობითი სქესი', points: b(i.female) ? 1 : 0 },
      ];
      const total = sum(parts);
      const female = b(i.female);
      const threshold = female ? 3 : 2;
      const severity = total >= threshold ? 'high' : total === threshold - 1 ? 'moderate' : 'low';
      return {
        value: total,
        display: String(total),
        interpretationKa:
          total >= threshold
            ? `ქულა ${total} — ორალური ანტიკოაგულაცია რეკომენდებულია, თუ არ არსებობს უკუჩვენება.`
            : total === threshold - 1
              ? `ქულა ${total} — ანტიკოაგულაცია განიხილება ინდივიდუალური რისკ-სარგებლის შეფასებით.`
              : `ქულა ${total} — თრომბოემბოლიური რისკი დაბალია; ანტიკოაგულაცია ჩვეულებრივ არ არის ნაჩვენები.`,
        severity,
        breakdown: parts.filter((p) => p.points > 0),
        caveatsKa: [
          'ქულა არ ვრცელდება მექანიკურ სარქველზე და საშუალო/მძიმე მიტრალურ სტენოზზე — იქ ანტიკოაგულაცია დამოუკიდებლად არის ნაჩვენები.',
          'ESC 2024 იყენებს CHA₂DS₂-VA მიდგომას სქესის კომპონენტის გარეშე; შედეგი ინტერპრეტირდეს არჩეული გაიდლაინის მიხედვით.',
        ],
      };
    },
  },
  {
    id: 'has-bled',
    name: 'HAS-BLED',
    nameKa: 'HAS-BLED — სისხლდენის რისკი',
    category: 'cardiology',
    purposeKa: 'მნიშვნელოვანი სისხლდენის 1-წლიანი რისკის შეფასება ანტიკოაგულირებულ AF პაციენტში.',
    formulaKa: 'Hypertension + Abnormal renal/liver + Stroke + Bleeding + Labile INR + Elderly(>65) + Drugs/alcohol — თითო 1 ქულა',
    sourceIds: ['SRC-PISTERS-HASBLED-2010'],
    fields: [
      { key: 'htn', labelKa: 'არაკონტროლირებადი ჰიპერტენზია (სისტოლური >160)', type: 'boolean' },
      { key: 'renal', labelKa: 'თირკმლის ფუნქციის დარღვევა', type: 'boolean' },
      { key: 'liver', labelKa: 'ღვიძლის ფუნქციის დარღვევა', type: 'boolean' },
      { key: 'stroke', labelKa: 'ინსულტი ანამნეზში', type: 'boolean' },
      { key: 'bleed', labelKa: 'სისხლდენა ანამნეზში ან წინასწარგანწყობა', type: 'boolean' },
      { key: 'inr', labelKa: 'არასტაბილური INR', type: 'boolean' },
      { key: 'elderly', labelKa: 'ასაკი >65 წელი', type: 'boolean' },
      { key: 'drugs', labelKa: 'სისხლდენის რისკის წამლები (NSAID/ანტითრომბოციტული)', type: 'boolean' },
      { key: 'alcohol', labelKa: 'ალკოჰოლის ჭარბი მოხმარება', type: 'boolean' },
    ],
    compute: (i) => {
      const parts = [
        { labelKa: 'ჰიპერტენზია', points: b(i.htn) ? 1 : 0 },
        { labelKa: 'თირკმლის დარღვევა', points: b(i.renal) ? 1 : 0 },
        { labelKa: 'ღვიძლის დარღვევა', points: b(i.liver) ? 1 : 0 },
        { labelKa: 'ინსულტი', points: b(i.stroke) ? 1 : 0 },
        { labelKa: 'სისხლდენა', points: b(i.bleed) ? 1 : 0 },
        { labelKa: 'არასტაბილური INR', points: b(i.inr) ? 1 : 0 },
        { labelKa: 'ასაკი >65', points: b(i.elderly) ? 1 : 0 },
        { labelKa: 'წამლები', points: b(i.drugs) ? 1 : 0 },
        { labelKa: 'ალკოჰოლი', points: b(i.alcohol) ? 1 : 0 },
      ];
      const total = sum(parts);
      return {
        value: total,
        display: String(total),
        interpretationKa:
          total >= 3
            ? `ქულა ${total} — სისხლდენის მაღალი რისკი. ეს არ არის ანტიკოაგულაციაზე უარის საფუძველი: საჭიროა მოდიფიცირებადი ფაქტორების კორექცია და უფრო ხშირი მიმოხილვა.`
            : `ქულა ${total} — სისხლდენის რისკი დაბალი/საშუალოა; მოდიფიცირებადი ფაქტორები მაინც უნდა გასწორდეს.`,
        severity: total >= 3 ? 'high' : total === 2 ? 'moderate' : 'low',
        breakdown: parts.filter((p) => p.points > 0),
        caveatsKa: ['მაღალი HAS-BLED ქულა ანტიკოაგულაციის უკუჩვენება არ არის (ორიგინალური პუბლიკაცია).'],
      };
    },
  },
  {
    id: 'wells-dvt',
    name: 'Wells DVT',
    nameKa: 'Wells — ღრმა ვენების თრომბოზი',
    category: 'haematology',
    purposeKa: 'DVT-ის კლინიკური ალბათობის შეფასება.',
    formulaKa: 'კლინიკური კრიტერიუმები თითო +1; ალტერნატიული დიაგნოზი უფრო სავარაუდო −2',
    sourceIds: [],
    fields: [
      { key: 'cancer', labelKa: 'აქტიური სიმსივნე', type: 'boolean' },
      { key: 'paralysis', labelKa: 'დამბლა/პარეზი ან ქვედა კიდურის იმობილიზაცია', type: 'boolean' },
      { key: 'bedridden', labelKa: 'ლოგინში ≥3 დღე ან დიდი ოპერაცია ბოლო 12 კვირაში', type: 'boolean' },
      { key: 'tenderness', labelKa: 'ლოკალური მტკივნეულობა ღრმა ვენების გასწვრივ', type: 'boolean' },
      { key: 'swelling', labelKa: 'მთელი ფეხის შეშუპება', type: 'boolean' },
      { key: 'calf', labelKa: 'წვივის გარშემოწერილობა >3 სმ-ით მეტი', type: 'boolean' },
      { key: 'pitting', labelKa: 'ორმოიანი შეშუპება სიმპტომურ ფეხზე', type: 'boolean' },
      { key: 'collateral', labelKa: 'კოლატერალური ზედაპირული ვენები', type: 'boolean' },
      { key: 'priorDvt', labelKa: 'წინა დოკუმენტირებული DVT', type: 'boolean' },
      { key: 'alternative', labelKa: 'ალტერნატიული დიაგნოზი ისეთივე ან უფრო სავარაუდოა', type: 'boolean' },
    ],
    compute: (i) => {
      const parts = [
        { labelKa: 'აქტიური სიმსივნე', points: b(i.cancer) ? 1 : 0 },
        { labelKa: 'დამბლა/იმობილიზაცია', points: b(i.paralysis) ? 1 : 0 },
        { labelKa: 'ლოგინში/ოპერაცია', points: b(i.bedridden) ? 1 : 0 },
        { labelKa: 'ლოკალური მტკივნეულობა', points: b(i.tenderness) ? 1 : 0 },
        { labelKa: 'მთელი ფეხის შეშუპება', points: b(i.swelling) ? 1 : 0 },
        { labelKa: 'წვივის გარშემოწერილობა', points: b(i.calf) ? 1 : 0 },
        { labelKa: 'ორმოიანი შეშუპება', points: b(i.pitting) ? 1 : 0 },
        { labelKa: 'კოლატერალური ვენები', points: b(i.collateral) ? 1 : 0 },
        { labelKa: 'წინა DVT', points: b(i.priorDvt) ? 1 : 0 },
        { labelKa: 'ალტერნატიული დიაგნოზი', points: b(i.alternative) ? -2 : 0 },
      ];
      const total = sum(parts);
      return {
        value: total,
        display: String(total),
        interpretationKa:
          total >= 3
            ? `ქულა ${total} — მაღალი კლინიკური ალბათობა: ნაჩვენებია კომპრესიული ულტრასონოგრაფია.`
            : total >= 1
              ? `ქულა ${total} — საშუალო ალბათობა: D-დიმერი და/ან ულტრასონოგრაფია ლოკალური ალგორითმის მიხედვით.`
              : `ქულა ${total} — დაბალი ალბათობა: უარყოფითი მაღალმგრძნობიარე D-დიმერი ჩვეულებრივ გამორიცხავს DVT-ს.`,
        severity: total >= 3 ? 'high' : total >= 1 ? 'moderate' : 'low',
        breakdown: parts.filter((p) => p.points !== 0),
        caveatsKa: ['ქულა კლინიკური ალბათობის ინსტრუმენტია და არ ცვლის ვიზუალიზაციას მაღალი ალბათობისას.'],
      };
    },
  },
  {
    id: 'wells-pe',
    name: 'Wells PE',
    nameKa: 'Wells — ფილტვის არტერიის თრომბოემბოლია',
    category: 'respiratory',
    purposeKa: 'PE-ის კლინიკური ალბათობის შეფასება.',
    formulaKa: 'DVT ნიშნები 3 + PE ყველაზე სავარაუდო 3 + ტაქიკარდია 1.5 + იმობილიზაცია/ოპერაცია 1.5 + წინა VTE 1.5 + ჰემოპტოე 1 + სიმსივნე 1',
    sourceIds: [],
    fields: [
      { key: 'dvtSigns', labelKa: 'DVT-ის კლინიკური ნიშნები', type: 'boolean' },
      { key: 'peLikely', labelKa: 'PE ალტერნატიულ დიაგნოზზე უფრო სავარაუდოა', type: 'boolean' },
      { key: 'hr', labelKa: 'გულისცემა', type: 'number', unit: '/წთ', min: 20, max: 250 },
      { key: 'immob', labelKa: 'იმობილიზაცია ≥3 დღე ან ოპერაცია ბოლო 4 კვირაში', type: 'boolean' },
      { key: 'priorVte', labelKa: 'წინა DVT/PE', type: 'boolean' },
      { key: 'hemoptysis', labelKa: 'ჰემოპტოე', type: 'boolean' },
      { key: 'cancer', labelKa: 'აქტიური სიმსივნე', type: 'boolean' },
    ],
    compute: (i) => {
      const parts = [
        { labelKa: 'DVT ნიშნები', points: b(i.dvtSigns) ? 3 : 0 },
        { labelKa: 'PE ყველაზე სავარაუდო', points: b(i.peLikely) ? 3 : 0 },
        { labelKa: 'გულისცემა >100/წთ', points: n(i.hr) > 100 ? 1.5 : 0 },
        { labelKa: 'იმობილიზაცია/ოპერაცია', points: b(i.immob) ? 1.5 : 0 },
        { labelKa: 'წინა VTE', points: b(i.priorVte) ? 1.5 : 0 },
        { labelKa: 'ჰემოპტოე', points: b(i.hemoptysis) ? 1 : 0 },
        { labelKa: 'აქტიური სიმსივნე', points: b(i.cancer) ? 1 : 0 },
      ];
      const total = round(sum(parts), 1);
      return {
        value: total,
        display: String(total),
        interpretationKa:
          total > 6
            ? `ქულა ${total} — მაღალი ალბათობა: ნაჩვენებია CT ფილტვის ანგიოგრაფია (D-დიმერზე დაყრდნობის გარეშე).`
            : total >= 2
              ? `ქულა ${total} — საშუალო ალბათობა: მაღალმგრძნობიარე D-დიმერი, შემდეგ ვიზუალიზაცია საჭიროებისას.`
              : `ქულა ${total} — დაბალი ალბათობა: განიხილე PERC წესი ან D-დიმერი.`,
        severity: total > 6 ? 'high' : total >= 2 ? 'moderate' : 'low',
        breakdown: parts.filter((p) => p.points > 0),
        caveatsKa: ['ორსულობაში ალგორითმი განსხვავებულია — გამოიყენე ორსულობისთვის ვალიდირებული მიდგომა.'],
      };
    },
  },
  {
    id: 'perc',
    name: 'PERC',
    nameKa: 'PERC — PE-ის გამორიცხვის კრიტერიუმები',
    category: 'respiratory',
    purposeKa: 'დაბალი ალბათობის პაციენტში PE-ის გამორიცხვა დამატებითი კვლევის გარეშე.',
    formulaKa: 'ყველა 8 კრიტერიუმი უარყოფითი უნდა იყოს (PERC negative).',
    sourceIds: [],
    fields: [
      { key: 'age', labelKa: 'ასაკი', type: 'number', unit: 'წელი', min: 0, max: 120 },
      { key: 'hr', labelKa: 'გულისცემა', type: 'number', unit: '/წთ', min: 20, max: 250 },
      { key: 'spo2', labelKa: 'SpO₂ ჰაერზე', type: 'number', unit: '%', min: 50, max: 100 },
      { key: 'hemoptysis', labelKa: 'ჰემოპტოე', type: 'boolean' },
      { key: 'estrogen', labelKa: 'ესტროგენის მიღება', type: 'boolean' },
      { key: 'priorVte', labelKa: 'წინა DVT/PE', type: 'boolean' },
      { key: 'surgery', labelKa: 'ოპერაცია/ტრავმა ბოლო 4 კვირაში', type: 'boolean' },
      { key: 'legSwelling', labelKa: 'ცალმხრივი ფეხის შეშუპება', type: 'boolean' },
    ],
    compute: (i) => {
      const fails = [
        { labelKa: 'ასაკი ≥50', points: n(i.age) >= 50 ? 1 : 0 },
        { labelKa: 'გულისცემა ≥100/წთ', points: n(i.hr) >= 100 ? 1 : 0 },
        { labelKa: 'SpO₂ <95%', points: n(i.spo2, 100) < 95 ? 1 : 0 },
        { labelKa: 'ჰემოპტოე', points: b(i.hemoptysis) ? 1 : 0 },
        { labelKa: 'ესტროგენი', points: b(i.estrogen) ? 1 : 0 },
        { labelKa: 'წინა VTE', points: b(i.priorVte) ? 1 : 0 },
        { labelKa: 'ოპერაცია/ტრავმა', points: b(i.surgery) ? 1 : 0 },
        { labelKa: 'ცალმხრივი ფეხის შეშუპება', points: b(i.legSwelling) ? 1 : 0 },
      ];
      const total = sum(fails);
      return {
        value: total,
        display: total === 0 ? 'PERC უარყოფითი' : `PERC დადებითი (${total} კრიტერიუმი)`,
        interpretationKa:
          total === 0
            ? 'ყველა კრიტერიუმი უარყოფითია. დაბალი კლინიკური ალბათობის პირობებში PE-ს შემდგომი გამოკვლევა ჩვეულებრივ არ ესაჭიროება.'
            : `${total} კრიტერიუმი დადებითია — PERC ვერ გამორიცხავს PE-ს; საჭიროა D-დიმერი ან ვიზუალიზაცია.`,
        severity: total === 0 ? 'low' : 'moderate',
        breakdown: fails.filter((p) => p.points > 0),
        caveatsKa: ['PERC გამოიყენება მხოლოდ მაშინ, როცა კლინიკური ალბათობა უკვე დაბალია.'],
      };
    },
  },
  {
    id: 'curb-65',
    name: 'CURB-65',
    nameKa: 'CURB-65 — პნევმონიის სიმძიმე',
    category: 'respiratory',
    purposeKa: 'საზოგადოებაში შეძენილი პნევმონიის სიმძიმისა და მოვლის ადგილის განსაზღვრა.',
    formulaKa: 'Confusion + Urea >7 მმოლ/ლ + RR ≥30 + BP (სისტოლური <90 ან დიასტოლური ≤60) + ასაკი ≥65 — თითო 1 ქულა',
    sourceIds: ['SRC-LIM-CURB65-2003'],
    fields: [
      { key: 'confusion', labelKa: 'ცნობიერების დაბინდვა / დეზორიენტაცია', type: 'boolean' },
      { key: 'urea', labelKa: 'შარდოვანა', type: 'number', unit: 'მმოლ/ლ', min: 0, max: 60, step: 0.1 },
      { key: 'rr', labelKa: 'სუნთქვის სიხშირე', type: 'number', unit: '/წთ', min: 5, max: 60 },
      { key: 'sbp', labelKa: 'სისტოლური წნევა', type: 'number', unit: 'მმვწყ', min: 40, max: 260 },
      { key: 'dbp', labelKa: 'დიასტოლური წნევა', type: 'number', unit: 'მმვწყ', min: 20, max: 160 },
      { key: 'age', labelKa: 'ასაკი', type: 'number', unit: 'წელი', min: 0, max: 120 },
    ],
    compute: (i) => {
      const parts = [
        { labelKa: 'ცნობიერების დაბინდვა', points: b(i.confusion) ? 1 : 0 },
        { labelKa: 'შარდოვანა >7 მმოლ/ლ', points: n(i.urea) > 7 ? 1 : 0 },
        { labelKa: 'სუნთქვის სიხშირე ≥30', points: n(i.rr) >= 30 ? 1 : 0 },
        { labelKa: 'არტერიული წნევა დაბალი', points: n(i.sbp, 120) < 90 || n(i.dbp, 80) <= 60 ? 1 : 0 },
        { labelKa: 'ასაკი ≥65', points: n(i.age) >= 65 ? 1 : 0 },
      ];
      const total = sum(parts);
      return {
        value: total,
        display: String(total),
        interpretationKa:
          total >= 3
            ? `ქულა ${total} — მძიმე პნევმონია: ჰოსპიტალიზაცია და ინტენსიური მოვლის განხილვა.`
            : total === 2
              ? `ქულა ${total} — საშუალო რისკი: განიხილე ჰოსპიტალიზაცია ან მჭიდრო ამბულატორიული დაკვირვება.`
              : `ქულა ${total} — დაბალი რისკი: ამბულატორიული მკურნალობა ხშირად შესაძლებელია.`,
        severity: total >= 3 ? 'critical' : total === 2 ? 'high' : 'low',
        breakdown: parts.filter((p) => p.points > 0),
        caveatsKa: ['ქულა არ ითვალისწინებს სოციალურ ფაქტორებს, ჟანგბადის საჭიროებას და თანმხლებ დაავადებებს.'],
      };
    },
  },
  {
    id: 'gcs',
    name: 'Glasgow Coma Scale',
    nameKa: 'GCS — გლაზგოს კომის შკალა',
    category: 'neurology',
    purposeKa: 'ცნობიერების დონის სტანდარტიზებული შეფასება.',
    formulaKa: 'თვალის გახელა (1–4) + სიტყვიერი პასუხი (1–5) + მოტორული პასუხი (1–6)',
    sourceIds: ['SRC-TEASDALE-GCS-1974'],
    fields: [
      {
        key: 'eye',
        labelKa: 'თვალის გახელა',
        type: 'select',
        options: [
          { value: '4', labelKa: 'სპონტანური (4)' },
          { value: '3', labelKa: 'ხმაზე (3)' },
          { value: '2', labelKa: 'ტკივილზე (2)' },
          { value: '1', labelKa: 'არ ახელს (1)' },
        ],
      },
      {
        key: 'verbal',
        labelKa: 'სიტყვიერი პასუხი',
        type: 'select',
        options: [
          { value: '5', labelKa: 'ორიენტირებული (5)' },
          { value: '4', labelKa: 'დაბნეული (4)' },
          { value: '3', labelKa: 'არაადეკვატური სიტყვები (3)' },
          { value: '2', labelKa: 'გაუგებარი ბგერები (2)' },
          { value: '1', labelKa: 'პასუხი არ არის (1)' },
        ],
      },
      {
        key: 'motor',
        labelKa: 'მოტორული პასუხი',
        type: 'select',
        options: [
          { value: '6', labelKa: 'ასრულებს ბრძანებას (6)' },
          { value: '5', labelKa: 'ლოკალიზებს ტკივილს (5)' },
          { value: '4', labelKa: 'გაქცევითი რეაქცია (4)' },
          { value: '3', labelKa: 'პათოლოგიური მოხრა (3)' },
          { value: '2', labelKa: 'პათოლოგიური გაშლა (2)' },
          { value: '1', labelKa: 'პასუხი არ არის (1)' },
        ],
      },
    ],
    compute: (i) => {
      const e = n(i.eye, 4);
      const v = n(i.verbal, 5);
      const m = n(i.motor, 6);
      const total = e + v + m;
      return {
        value: total,
        display: `${total} (E${e} V${v} M${m})`,
        interpretationKa:
          total <= 8
            ? `GCS ${total} — მძიმე დარღვევა; სასუნთქი გზების დაცვა უნდა შეფასდეს დაუყოვნებლივ.`
            : total <= 12
              ? `GCS ${total} — საშუალო სიმძიმის დარღვევა; საჭიროა მჭიდრო ნევროლოგიური მონიტორინგი.`
              : `GCS ${total} — მსუბუქი დარღვევა ან ნორმა.`,
        severity: total <= 8 ? 'critical' : total <= 12 ? 'high' : 'low',
        breakdown: [
          { labelKa: 'თვალი (E)', points: e },
          { labelKa: 'სიტყვიერი (V)', points: v },
          { labelKa: 'მოტორული (M)', points: m },
        ],
        caveatsKa: ['ინტუბირებულ პაციენტში სიტყვიერი კომპონენტი არ ფასდება — ჩაიწერება როგორც "VT".'],
      };
    },
  },
  {
    id: 'nihss',
    name: 'NIHSS',
    nameKa: 'NIHSS — ინსულტის სიმძიმის შკალა',
    category: 'neurology',
    purposeKa: 'მწვავე ინსულტის ნევროლოგიური დეფიციტის რაოდენობრივი შეფასება.',
    formulaKa: '11 დომენის ჯამი (0–42)',
    sourceIds: ['SRC-AHA-ASA-AIS-2019'],
    fields: [
      { key: 'loc', labelKa: '1a. ცნობიერების დონე (0–3)', type: 'number', min: 0, max: 3 },
      { key: 'locQ', labelKa: '1b. კითხვები (0–2)', type: 'number', min: 0, max: 2 },
      { key: 'locC', labelKa: '1c. ბრძანებები (0–2)', type: 'number', min: 0, max: 2 },
      { key: 'gaze', labelKa: '2. მზერა (0–2)', type: 'number', min: 0, max: 2 },
      { key: 'visual', labelKa: '3. მხედველობის ველები (0–3)', type: 'number', min: 0, max: 3 },
      { key: 'facial', labelKa: '4. სახის პარეზი (0–3)', type: 'number', min: 0, max: 3 },
      { key: 'arm', labelKa: '5. ხელის მოტორიკა — ორივე მხარე ჯამში (0–8)', type: 'number', min: 0, max: 8 },
      { key: 'leg', labelKa: '6. ფეხის მოტორიკა — ორივე მხარე ჯამში (0–8)', type: 'number', min: 0, max: 8 },
      { key: 'ataxia', labelKa: '7. კიდურების ატაქსია (0–2)', type: 'number', min: 0, max: 2 },
      { key: 'sensory', labelKa: '8. სენსორული (0–2)', type: 'number', min: 0, max: 2 },
      { key: 'language', labelKa: '9. ენა / აფაზია (0–3)', type: 'number', min: 0, max: 3 },
      { key: 'dysarthria', labelKa: '10. დიზართრია (0–2)', type: 'number', min: 0, max: 2 },
      { key: 'neglect', labelKa: '11. უგულებელყოფა (0–2)', type: 'number', min: 0, max: 2 },
    ],
    compute: (i) => {
      const keys = ['loc', 'locQ', 'locC', 'gaze', 'visual', 'facial', 'arm', 'leg', 'ataxia', 'sensory', 'language', 'dysarthria', 'neglect'];
      const parts = keys.map((k) => ({ labelKa: k, points: n(i[k]) }));
      const total = sum(parts);
      return {
        value: total,
        display: String(total),
        interpretationKa:
          total === 0
            ? 'NIHSS 0 — ნევროლოგიური დეფიციტი არ ფიქსირდება.'
            : total <= 4
              ? `NIHSS ${total} — მცირე ინსულტი.`
              : total <= 15
                ? `NIHSS ${total} — საშუალო სიმძიმის ინსულტი.`
                : total <= 20
                  ? `NIHSS ${total} — საშუალო-მძიმე ინსულტი.`
                  : `NIHSS ${total} — მძიმე ინსულტი.`,
        severity: total >= 16 ? 'critical' : total >= 5 ? 'high' : total >= 1 ? 'moderate' : 'low',
        breakdown: parts.filter((p) => p.points > 0),
        caveatsKa: ['NIHSS ნაკლებად მგრძნობიარეა მარჯვენა ჰემისფეროსა და უკანა ცირკულაციის ინსულტებისთვის.'],
      };
    },
  },
  {
    id: 'sofa',
    name: 'SOFA',
    nameKa: 'SOFA — ორგანოთა დისფუნქციის შკალა',
    category: 'critical_care',
    purposeKa: 'ორგანოთა ექვსი სისტემის დისფუნქციის შეფასება ინტენსიურ თერაპიაში.',
    formulaKa: 'რესპირატორული + კოაგულაცია + ღვიძლი + კარდიოვასკულური + ცნს + თირკმელი (თითო 0–4)',
    sourceIds: ['SRC-VINCENT-SOFA-1996'],
    fields: [
      { key: 'resp', labelKa: 'რესპირატორული (PaO₂/FiO₂) 0–4', type: 'number', min: 0, max: 4 },
      { key: 'coag', labelKa: 'კოაგულაცია (თრომბოციტები) 0–4', type: 'number', min: 0, max: 4 },
      { key: 'liver', labelKa: 'ღვიძლი (ბილირუბინი) 0–4', type: 'number', min: 0, max: 4 },
      { key: 'cardio', labelKa: 'კარდიოვასკულური (MAP/ვაზოპრესორები) 0–4', type: 'number', min: 0, max: 4 },
      { key: 'cns', labelKa: 'ცნს (GCS) 0–4', type: 'number', min: 0, max: 4 },
      { key: 'renal', labelKa: 'თირკმელი (კრეატინინი/დიურეზი) 0–4', type: 'number', min: 0, max: 4 },
    ],
    compute: (i) => {
      const parts = [
        { labelKa: 'რესპირატორული', points: n(i.resp) },
        { labelKa: 'კოაგულაცია', points: n(i.coag) },
        { labelKa: 'ღვიძლი', points: n(i.liver) },
        { labelKa: 'კარდიოვასკულური', points: n(i.cardio) },
        { labelKa: 'ცნს', points: n(i.cns) },
        { labelKa: 'თირკმელი', points: n(i.renal) },
      ];
      const total = sum(parts);
      return {
        value: total,
        display: String(total),
        interpretationKa:
          total >= 11
            ? `SOFA ${total} — ორგანოთა მძიმე დისფუნქცია; სიკვდილობის მაღალი რისკი.`
            : total >= 6
              ? `SOFA ${total} — მნიშვნელოვანი ორგანოთა დისფუნქცია.`
              : `SOFA ${total} — შედარებით დაბალი ორგანული დისფუნქცია.`,
        severity: total >= 11 ? 'critical' : total >= 6 ? 'high' : 'moderate',
        breakdown: parts.filter((p) => p.points > 0),
        caveatsKa: ['სეფსისის დიაგნოსტიკისთვის მნიშვნელოვანია SOFA-ს ცვლილება საწყისიდან ≥2 ქულით.'],
      };
    },
  },
  {
    id: 'meld',
    name: 'MELD',
    nameKa: 'MELD — ღვიძლის ტერმინალური დაავადების მოდელი',
    category: 'hepatology',
    purposeKa: 'მოკლევადიანი სიკვდილობის პროგნოზირება ღვიძლის ქრონიკული დაავადებისას.',
    formulaKa: 'MELD = 3.78×ln(ბილირუბინი მგ/დლ) + 11.2×ln(INR) + 9.57×ln(კრეატინინი მგ/დლ) + 6.43 (მნიშვნელობები <1 მრგვალდება 1-მდე; კრეატინინი ≤4)',
    sourceIds: ['SRC-KAMATH-MELD-2001'],
    fields: [
      { key: 'bili', labelKa: 'ბილირუბინი', type: 'number', unit: 'მგ/დლ', min: 0.1, max: 60, step: 0.1 },
      { key: 'inr', labelKa: 'INR', type: 'number', min: 0.5, max: 12, step: 0.1 },
      { key: 'creat', labelKa: 'კრეატინინი', type: 'number', unit: 'მგ/დლ', min: 0.1, max: 15, step: 0.1 },
      { key: 'dialysis', labelKa: 'დიალიზი ბოლო კვირაში (≥2-ჯერ)', type: 'boolean' },
    ],
    compute: (i) => {
      const clamp = (x: number) => Math.max(1, x);
      const bili = clamp(n(i.bili, 1));
      const inr = clamp(n(i.inr, 1));
      let creat = clamp(n(i.creat, 1));
      if (b(i.dialysis) || creat > 4) creat = 4;
      const raw = 3.78 * Math.log(bili) + 11.2 * Math.log(inr) + 9.57 * Math.log(creat) + 6.43;
      const total = Math.min(40, Math.max(6, Math.round(raw)));
      return {
        value: total,
        display: String(total),
        interpretationKa:
          total >= 30
            ? `MELD ${total} — ძალიან მაღალი მოკლევადიანი სიკვდილობის რისკი; ტრანსპლანტაციის ცენტრთან კონსულტაცია.`
            : total >= 20
              ? `MELD ${total} — მაღალი რისკი; საჭიროა სპეციალიზებული ჰეპატოლოგიური მართვა.`
              : `MELD ${total} — შედარებით დაბალი მოკლევადიანი რისკი.`,
        severity: total >= 30 ? 'critical' : total >= 20 ? 'high' : total >= 15 ? 'moderate' : 'low',
        breakdown: [
          { labelKa: 'ბილირუბინი (გამოყენებული)', points: round(bili, 2) },
          { labelKa: 'INR (გამოყენებული)', points: round(inr, 2) },
          { labelKa: 'კრეატინინი (გამოყენებული)', points: round(creat, 2) },
        ],
        caveatsKa: ['ეს არის ორიგინალური MELD; ალოკაციისთვის ხშირად გამოიყენება MELD-Na ან MELD 3.0 — შეამოწმე ლოკალური სტანდარტი.'],
      };
    },
  },
  {
    id: 'child-pugh',
    name: 'Child-Pugh',
    nameKa: 'Child-Pugh — ღვიძლის ფუნქციური რეზერვი',
    category: 'hepatology',
    purposeKa: 'ციროზის სიმძიმის კლასიფიკაცია (A/B/C).',
    formulaKa: 'ბილირუბინი + ალბუმინი + INR + ასციტი + ენცეფალოპათია (თითო 1–3 ქულა)',
    sourceIds: ['SRC-PUGH-1973'],
    fields: [
      { key: 'bili', labelKa: 'ბილირუბინი', type: 'number', unit: 'მგ/დლ', min: 0.1, max: 40, step: 0.1 },
      { key: 'alb', labelKa: 'ალბუმინი', type: 'number', unit: 'გ/დლ', min: 1, max: 6, step: 0.1 },
      { key: 'inr', labelKa: 'INR', type: 'number', min: 0.5, max: 8, step: 0.1 },
      {
        key: 'ascites',
        labelKa: 'ასციტი',
        type: 'select',
        options: [
          { value: '1', labelKa: 'არ არის (1)' },
          { value: '2', labelKa: 'მსუბუქი / კონტროლირებადი (2)' },
          { value: '3', labelKa: 'საშუალო-მძიმე / რეფრაქტერული (3)' },
        ],
      },
      {
        key: 'enceph',
        labelKa: 'ენცეფალოპათია',
        type: 'select',
        options: [
          { value: '1', labelKa: 'არ არის (1)' },
          { value: '2', labelKa: 'ხარისხი I–II (2)' },
          { value: '3', labelKa: 'ხარისხი III–IV (3)' },
        ],
      },
    ],
    compute: (i) => {
      const bili = n(i.bili, 1);
      const alb = n(i.alb, 4);
      const inr = n(i.inr, 1);
      const pBili = bili < 2 ? 1 : bili <= 3 ? 2 : 3;
      const pAlb = alb > 3.5 ? 1 : alb >= 2.8 ? 2 : 3;
      const pInr = inr < 1.7 ? 1 : inr <= 2.3 ? 2 : 3;
      const pAsc = n(i.ascites, 1);
      const pEnc = n(i.enceph, 1);
      const total = pBili + pAlb + pInr + pAsc + pEnc;
      const cls = total <= 6 ? 'A' : total <= 9 ? 'B' : 'C';
      return {
        value: total,
        display: `${total} ქულა — კლასი ${cls}`,
        interpretationKa:
          cls === 'A'
            ? `კლასი A (${total}) — კომპენსირებული ციროზი.`
            : cls === 'B'
              ? `კლასი B (${total}) — მნიშვნელოვანი ფუნქციური დარღვევა; წამლის დოზირება გადასახედია.`
              : `კლასი C (${total}) — დეკომპენსირებული ციროზი; მრავალი მედიკამენტი უკუნაჩვენებია.`,
        severity: cls === 'C' ? 'critical' : cls === 'B' ? 'high' : 'low',
        breakdown: [
          { labelKa: 'ბილირუბინი', points: pBili },
          { labelKa: 'ალბუმინი', points: pAlb },
          { labelKa: 'INR', points: pInr },
          { labelKa: 'ასციტი', points: pAsc },
          { labelKa: 'ენცეფალოპათია', points: pEnc },
        ],
        caveatsKa: ['პირველადი ბილიარული ქოლანგიტისას ბილირუბინის ზღვრები განსხვავებულია.'],
      };
    },
  },
  {
    id: 'crcl',
    name: 'Cockcroft-Gault CrCl',
    nameKa: 'კრეატინინის კლირენსი (Cockcroft-Gault)',
    category: 'nephrology',
    purposeKa: 'წამლის დოზირებისთვის საჭირო კრეატინინის კლირენსის შეფასება.',
    formulaKa: 'CrCl = [(140 − ასაკი) × წონა(კგ) × (0.85 ქალისთვის)] / (72 × კრეატინინი მგ/დლ)',
    sourceIds: ['SRC-COCKCROFT-1976'],
    fields: [
      { key: 'age', labelKa: 'ასაკი', type: 'number', unit: 'წელი', min: 18, max: 120 },
      { key: 'weight', labelKa: 'წონა', type: 'number', unit: 'კგ', min: 20, max: 250, step: 0.5 },
      { key: 'creat', labelKa: 'შრატის კრეატინინი', type: 'number', unit: 'მგ/დლ', min: 0.1, max: 20, step: 0.01 },
      { key: 'female', labelKa: 'მდედრობითი სქესი', type: 'boolean' },
    ],
    compute: (i) => {
      const age = n(i.age, 50);
      const wt = n(i.weight, 70);
      const cr = Math.max(0.1, n(i.creat, 1));
      const crcl = ((140 - age) * wt * (b(i.female) ? 0.85 : 1)) / (72 * cr);
      const v = round(crcl, 1);
      return {
        value: v,
        display: `${v}`,
        unit: 'მლ/წთ',
        interpretationKa:
          v < 15
            ? `CrCl ${v} მლ/წთ — ტერმინალური თირკმლის უკმარისობა; ბევრი წამალი უკუნაჩვენებია.`
            : v < 30
              ? `CrCl ${v} მლ/წთ — მძიმე დაქვეითება; საჭიროა დოზის მნიშვნელოვანი კორექცია.`
              : v < 60
                ? `CrCl ${v} მლ/წთ — ზომიერი დაქვეითება; შეამოწმე თითოეული წამლის ზღვარი.`
                : `CrCl ${v} მლ/წთ — ჩვეულებრივ სტანდარტული დოზირება.`,
        severity: v < 30 ? 'high' : v < 60 ? 'moderate' : 'low',
        breakdown: [
          { labelKa: 'ასაკი', points: age },
          { labelKa: 'წონა (კგ)', points: wt },
          { labelKa: 'კრეატინინი (მგ/დლ)', points: cr },
        ],
        caveatsKa: [
          'სიმსუქნის ან კახექსიის დროს განიხილე კორექტირებული ან იდეალური სხეულის მასა.',
          'წამლის ეტიკეტების უმეტესობა Cockcroft-Gault-ზეა დაფუძნებული, არა eGFR-ზე.',
        ],
      };
    },
  },
  {
    id: 'egfr',
    name: 'eGFR (CKD-EPI 2021)',
    nameKa: 'eGFR — CKD-EPI 2021 (კრეატინინი)',
    category: 'nephrology',
    purposeKa: 'გლომერულური ფილტრაციის სიჩქარის შეფასება რასის კოეფიციენტის გარეშე.',
    formulaKa: 'eGFR = 142 × min(Scr/κ,1)^α × max(Scr/κ,1)^(−1.200) × 0.9938^ასაკი × 1.012 (ქალი); κ=0.7 ქალი / 0.9 კაცი; α=−0.241 ქალი / −0.302 კაცი',
    sourceIds: ['SRC-INKER-CKDEPI-2021'],
    fields: [
      { key: 'age', labelKa: 'ასაკი', type: 'number', unit: 'წელი', min: 18, max: 120 },
      { key: 'creat', labelKa: 'შრატის კრეატინინი', type: 'number', unit: 'მგ/დლ', min: 0.1, max: 20, step: 0.01 },
      { key: 'female', labelKa: 'მდედრობითი სქესი', type: 'boolean' },
    ],
    compute: (i) => {
      const age = n(i.age, 50);
      const scr = Math.max(0.1, n(i.creat, 1));
      const female = b(i.female);
      const k = female ? 0.7 : 0.9;
      const a = female ? -0.241 : -0.302;
      const e = 142 * Math.min(scr / k, 1) ** a * Math.max(scr / k, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1);
      const v = round(e, 1);
      const stage = v >= 90 ? 'G1' : v >= 60 ? 'G2' : v >= 45 ? 'G3a' : v >= 30 ? 'G3b' : v >= 15 ? 'G4' : 'G5';
      return {
        value: v,
        display: `${v}`,
        unit: 'მლ/წთ/1.73მ²',
        interpretationKa: `eGFR ${v} მლ/წთ/1.73მ² — CKD სტადია ${stage}. ${v < 30 ? 'მრავალი წამალი მოითხოვს კორექციას ან უკუნაჩვენებია.' : v < 60 ? 'საჭიროა დოზირების გადამოწმება.' : 'ჩვეულებრივ სტანდარტული დოზირება.'}`,
        severity: v < 30 ? 'high' : v < 60 ? 'moderate' : 'low',
        breakdown: [
          { labelKa: 'კრეატინინი (მგ/დლ)', points: scr },
          { labelKa: 'ასაკი', points: age },
        ],
        caveatsKa: ['eGFR არ არის ვალიდური არასტაბილური თირკმლის ფუნქციისას (AKI).', 'წამლის დოზირებისთვის ხშირად საჭიროა Cockcroft-Gault.'],
      };
    },
  },
  {
    id: 'corrected-calcium',
    name: 'Corrected calcium',
    nameKa: 'კორექტირებული კალციუმი',
    category: 'general',
    purposeKa: 'საერთო კალციუმის კორექცია ჰიპოალბუმინემიისას.',
    formulaKa: 'კორექტირებული Ca (მგ/დლ) = გაზომილი Ca + 0.8 × (4.0 − ალბუმინი გ/დლ)',
    sourceIds: [],
    fields: [
      { key: 'ca', labelKa: 'საერთო კალციუმი', type: 'number', unit: 'მგ/დლ', min: 3, max: 20, step: 0.1 },
      { key: 'alb', labelKa: 'ალბუმინი', type: 'number', unit: 'გ/დლ', min: 0.5, max: 6, step: 0.1 },
    ],
    compute: (i) => {
      const ca = n(i.ca, 9);
      const alb = n(i.alb, 4);
      const v = round(ca + 0.8 * (4 - alb), 2);
      return {
        value: v,
        display: String(v),
        unit: 'მგ/დლ',
        interpretationKa:
          v > 10.5 ? `კორექტირებული კალციუმი ${v} მგ/დლ — ჰიპერკალციემია.` : v < 8.5 ? `კორექტირებული კალციუმი ${v} მგ/დლ — ჰიპოკალციემია.` : `კორექტირებული კალციუმი ${v} მგ/დლ — ნორმის ფარგლებში.`,
        severity: v > 12 || v < 7 ? 'critical' : v > 10.5 || v < 8.5 ? 'moderate' : 'low',
        breakdown: [
          { labelKa: 'გაზომილი Ca', points: ca },
          { labelKa: 'ალბუმინი', points: alb },
        ],
        caveatsKa: ['კრიტიკულ პაციენტში იონიზირებული კალციუმი უფრო სანდოა.'],
      };
    },
  },
  {
    id: 'anion-gap',
    name: 'Anion gap',
    nameKa: 'ანიონური სხვაობა',
    category: 'general',
    purposeKa: 'მეტაბოლური აციდოზის დიფერენცირება.',
    formulaKa: 'AG = Na⁺ − (Cl⁻ + HCO₃⁻); ალბუმინზე კორექცია: AG + 2.5 × (4.0 − ალბუმინი გ/დლ)',
    sourceIds: [],
    fields: [
      { key: 'na', labelKa: 'ნატრიუმი', type: 'number', unit: 'მმოლ/ლ', min: 100, max: 180 },
      { key: 'cl', labelKa: 'ქლორი', type: 'number', unit: 'მმოლ/ლ', min: 60, max: 140 },
      { key: 'hco3', labelKa: 'ბიკარბონატი', type: 'number', unit: 'მმოლ/ლ', min: 2, max: 45 },
      { key: 'alb', labelKa: 'ალბუმინი (არასავალდებულო)', type: 'number', unit: 'გ/დლ', min: 0.5, max: 6, step: 0.1 },
    ],
    compute: (i) => {
      const ag = n(i.na, 140) - (n(i.cl, 102) + n(i.hco3, 24));
      const alb = n(i.alb, 4);
      const corrected = round(ag + 2.5 * (4 - alb), 1);
      const v = round(ag, 1);
      return {
        value: v,
        display: `${v} (ალბუმინზე კორექტირებული ${corrected})`,
        unit: 'მმოლ/ლ',
        interpretationKa:
          corrected > 16
            ? `კორექტირებული AG ${corrected} — მაღალი ანიონური სხვაობის აციდოზი: განიხილე ლაქტატაციდოზი, კეტოაციდოზი, თირკმლის უკმარისობა, ტოქსინები.`
            : corrected < 8
              ? `კორექტირებული AG ${corrected} — დაბალი; განიხილე ჰიპოალბუმინემია ან პარაპროტეინემია.`
              : `კორექტირებული AG ${corrected} — ნორმის ფარგლებში.`,
        severity: corrected > 20 ? 'critical' : corrected > 16 ? 'high' : 'low',
        breakdown: [
          { labelKa: 'უკორექციო AG', points: v },
          { labelKa: 'ალბუმინზე კორექტირებული', points: corrected },
        ],
        caveatsKa: ['ჰიპოალბუმინემია ნიღბავს მაღალ ანიონურ სხვაობას — კორექცია აუცილებელია.'],
      };
    },
  },
  {
    id: 'qtc',
    name: 'QTc',
    nameKa: 'QTc — კორექტირებული QT ინტერვალი',
    category: 'cardiology',
    purposeKa: 'QT-ის კორექცია გულისცემაზე; torsades-ის რისკის შეფასება.',
    formulaKa: 'Bazett: QTc = QT / √RR; Fridericia: QTc = QT / RR^(1/3); RR = 60 / HR',
    sourceIds: ['SRC-BAZETT-1920'],
    fields: [
      { key: 'qt', labelKa: 'QT ინტერვალი', type: 'number', unit: 'მწმ', min: 200, max: 800 },
      { key: 'hr', labelKa: 'გულისცემა', type: 'number', unit: '/წთ', min: 20, max: 250 },
      { key: 'female', labelKa: 'მდედრობითი სქესი', type: 'boolean' },
    ],
    compute: (i) => {
      const qt = n(i.qt, 400);
      const hr = Math.max(20, n(i.hr, 60));
      const rr = 60 / hr;
      const bazett = round(qt / Math.sqrt(rr), 0);
      const frid = round(qt / Math.cbrt(rr), 0);
      const threshold = b(i.female) ? 470 : 450;
      return {
        value: bazett,
        display: `Bazett ${bazett} მწმ · Fridericia ${frid} მწმ`,
        unit: 'მწმ',
        interpretationKa:
          bazett >= 500
            ? `QTc ${bazett} მწმ — მკვეთრად გახანგრძლივებული; torsades de pointes-ის მაღალი რისკი. გადახედე ყველა QT-გამახანგრძლივებელ მედიკამენტს და ელექტროლიტებს.`
            : bazett > threshold
              ? `QTc ${bazett} მწმ — გახანგრძლივებულია (ზღვარი ${threshold} მწმ). საჭიროა მედიკამენტების და ელექტროლიტების მიმოხილვა.`
              : `QTc ${bazett} მწმ — ნორმის ფარგლებში.`,
        severity: bazett >= 500 ? 'critical' : bazett > threshold ? 'high' : 'low',
        breakdown: [
          { labelKa: 'QT (მწმ)', points: qt },
          { labelKa: 'HR (/წთ)', points: hr },
        ],
        caveatsKa: ['Bazett ზედმეტად აკორექტირებს ტაქიკარდიისას და ნაკლებად — ბრადიკარდიისას; ამ შემთხვევებში Fridericia უფრო სანდოა.'],
      };
    },
  },
  {
    id: 'bmi',
    name: 'BMI',
    nameKa: 'სხეულის მასის ინდექსი',
    category: 'general',
    purposeKa: 'წონისა და სიმაღლის თანაფარდობის შეფასება.',
    formulaKa: 'BMI = წონა(კგ) / სიმაღლე(მ)²',
    sourceIds: [],
    fields: [
      { key: 'weight', labelKa: 'წონა', type: 'number', unit: 'კგ', min: 10, max: 300, step: 0.1 },
      { key: 'height', labelKa: 'სიმაღლე', type: 'number', unit: 'სმ', min: 80, max: 230, step: 0.5 },
    ],
    compute: (i) => {
      const w = n(i.weight, 70);
      const h = Math.max(50, n(i.height, 170)) / 100;
      const v = round(w / (h * h), 1);
      return {
        value: v,
        display: String(v),
        unit: 'კგ/მ²',
        interpretationKa:
          v < 18.5 ? `BMI ${v} — წონის დეფიციტი.` : v < 25 ? `BMI ${v} — ნორმა.` : v < 30 ? `BMI ${v} — ჭარბი წონა.` : v < 35 ? `BMI ${v} — I ხარისხის სიმსუქნე.` : v < 40 ? `BMI ${v} — II ხარისხის სიმსუქნე.` : `BMI ${v} — III ხარისხის სიმსუქნე.`,
        severity: v >= 35 || v < 16 ? 'high' : v >= 30 || v < 18.5 ? 'moderate' : 'low',
        breakdown: [
          { labelKa: 'წონა (კგ)', points: w },
          { labelKa: 'სიმაღლე (სმ)', points: round(h * 100, 1) },
        ],
        caveatsKa: ['BMI არ განასხვავებს კუნთოვან და ცხიმოვან მასას.'],
      };
    },
  },
  {
    id: 'bsa',
    name: 'BSA (Mosteller)',
    nameKa: 'სხეულის ზედაპირის ფართობი (Mosteller)',
    category: 'general',
    purposeKa: 'დოზირებისთვის საჭირო სხეულის ზედაპირის ფართობის გამოთვლა.',
    formulaKa: 'BSA (მ²) = √(სიმაღლე[სმ] × წონა[კგ] / 3600)',
    sourceIds: ['SRC-MOSTELLER-1987'],
    fields: [
      { key: 'weight', labelKa: 'წონა', type: 'number', unit: 'კგ', min: 2, max: 300, step: 0.1 },
      { key: 'height', labelKa: 'სიმაღლე', type: 'number', unit: 'სმ', min: 30, max: 230, step: 0.5 },
    ],
    compute: (i) => {
      const w = n(i.weight, 70);
      const h = n(i.height, 170);
      const v = round(Math.sqrt((h * w) / 3600), 2);
      return {
        value: v,
        display: String(v),
        unit: 'მ²',
        interpretationKa: `BSA ${v} მ². გამოიყენება ქიმიოთერაპიული და სხვა ზედაპირზე დაფუძნებული დოზირებისთვის.`,
        severity: 'info',
        breakdown: [
          { labelKa: 'წონა (კგ)', points: w },
          { labelKa: 'სიმაღლე (სმ)', points: h },
        ],
        caveatsKa: ['მძიმე სიმსუქნისას ზოგიერთი პროტოკოლი ზღუდავს BSA-ს 2.0 მ²-ით.'],
      };
    },
  },
];

export const calculatorById = (id: string) => CALCULATORS.find((c) => c.id === id);

/** Suggest calculators relevant to free-text clinical content. */
export function suggestCalculators(text: string): Calculator[] {
  const t = text.toLowerCase();
  const map: Record<string, string[]> = {
    'cha2ds2-vasc': ['fibrillation', 'ფიბრილაცია', 'af', 'ანტიკოაგულ', 'ინსულტის რისკ'],
    'has-bled': ['სისხლდენ', 'bleeding', 'ანტიკოაგულ'],
    'wells-dvt': ['dvt', 'ღრმა ვენ', 'ფეხის შეშუპ'],
    'wells-pe': ['pe', 'თრომბოემბოლ', 'ქოშინ', 'ფილტვის არტერ'],
    perc: ['pe', 'თრომბოემბოლ'],
    'curb-65': ['პნევმონ', 'pneumonia', 'ხველ'],
    gcs: ['ცნობიერებ', 'კომა', 'ტრავმ', 'consciousness'],
    nihss: ['ინსულტ', 'stroke', 'tia', 'ჰემიპარ'],
    sofa: ['სეფსის', 'sepsis', 'icu', 'ინტენსიურ'],
    meld: ['ციროზ', 'ღვიძლ', 'cirrhosis'],
    'child-pugh': ['ციროზ', 'ღვიძლ'],
    crcl: ['თირკმ', 'renal', 'დოზ', 'კრეატინინ'],
    egfr: ['თირკმ', 'egfr', 'ckd', 'კრეატინინ'],
    qtc: ['qt', 'არითმ', 'ეკგ'],
    'corrected-calcium': ['კალციუმ', 'calcium'],
    'anion-gap': ['აციდოზ', 'acidosis', 'ბიკარბონატ'],
    bmi: ['წონ', 'სიმსუქნ', 'obesity'],
    bsa: ['ქიმიოთერაპ', 'დოზ'],
  };
  const ids = Object.entries(map)
    .filter(([, kws]) => kws.some((k) => t.includes(k)))
    .map(([id]) => id);
  return CALCULATORS.filter((c) => ids.includes(c.id));
}
