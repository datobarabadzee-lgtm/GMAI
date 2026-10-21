/**
 * IMAGING REPORT ANALYSIS — deterministic, text only.
 *
 * Reads a radiology report as written (Georgian or English) and returns its
 * structure: what is critical, what is incidental and needs a follow-up rule,
 * what is explicitly negative, and which phrases are hedged and need the
 * radiologist to commit. It never looks at images and never adds a finding
 * that is not in the text.
 *
 * Follow-up rules are the published ones, quoted at the level of detail the
 * guideline itself gives, with their applicability limits stated:
 *   - Fleischner Society 2017 — incidental pulmonary nodules (MacMahon, Radiology 2017)
 *   - ACR Incidental Findings Committee — thyroid (Hoang, JACR 2015)
 *   - ACR 2017 adrenal white paper; ESE/ENSAT 2023 adrenal incidentaloma guideline
 *   - ESVS 2024 — abdominal aortic aneurysm
 *   - Bosniak classification v2019 — cystic renal masses
 */

export type FindingKind = 'critical' | 'significant' | 'incidental' | 'negative' | 'other';

export type ImagingFinding = {
  text: string;
  kind: FindingKind;
  hedged: boolean;
  laterality: 'მარჯვენა' | 'მარცხენა' | 'ორმხრივი' | null;
  largestMm: number | null;
  labelKa: string | null;
  followUpKa: string | null;
};

export type ImagingAnalysis = {
  modality: string | null;
  hasImpression: boolean;
  impression: string[];
  findings: ImagingFinding[];
  critical: ImagingFinding[];
  incidental: ImagingFinding[];
  hedged: ImagingFinding[];
  negatives: ImagingFinding[];
  recommendations: string[];
  contrastWarnings: string[];
};

const MODALITIES: { re: RegExp; ka: string }[] = [
  { re: /პეტ|pet[\s/-]?ct|\bpet\b/i, ka: 'PET/CT' },
  { re: /მრტ|მაგნიტურ.?რეზონანს|\bmri\b|\bmr\b/i, ka: 'მრტ' },
  { re: /კტ|კომპიუტერულ.?ტომოგრაფ|\bct\b|\bcta\b/i, ka: 'კტ' },
  { re: /მამოგრაფ|mammogra/i, ka: 'მამოგრაფია' },
  { re: /ულტრაბგერ|ეხოსკოპ|(?<![ა-ჰ])(ექო|ეხო)(?![ა-ჰ])|ultrasound|\bus\b|doppler|დოპლერ/i, ka: 'ულტრაბგერა' },
  { re: /რენტგენ|x-ray|radiograph|\bcxr\b/i, ka: 'რენტგენოგრაფია' },
];

const NEGATION =
  /არ\s+(აღინიშნება|ვლინდება|ვიზუალიზდება|ისახება|არის|გამოვლინდა|დაფიქსირდა|შეინიშნება)|არ\s+აღინიშნა|ნიშნები\s+არ|გამოირიცხა|არ\s+ჩანს|\bno\b|\bwithout\b|negative for|unremarkable|\bnormal\b|\bnot seen\b|\babsent\b|ნორმის ფარგლებში|პათოლოგიის გარეშე|თავისებურებების გარეშე/i;

// "Cannot be excluded" is a hedge, not a negation — checked first.
const HEDGE =
  /არ\s+გამოირიცხება|ვერ\s+გამოირიცხება|გამორიცხვა\s+შეუძლებელია|შესაძლო|სავარაუდო|საეჭვო|სავარაუდოდ|შესაძლოა|ეჭვი|ნიშნები\s+მიუთითებს|cannot be (excluded|ruled out)|can(no|')t be excluded|possibl|probabl|likely|suspicious|suggest|questionable|equivocal|indeterminate|may represent|versus|vs\.?/i;

type Pattern = { re: RegExp; labelKa: string };

/** Findings that require immediate communication (ACR practice parameter on communication). */
const CRITICAL: Pattern[] = [
  { re: /პნევმოთორაქს|pneumothorax/i, labelKa: 'პნევმოთორაქსი' },
  { re: /ინტრაკრანიულ.{0,20}(სისხლჩაქცევ|ჰემორაგ)|ქალასშიდა.{0,15}სისხლჩაქცევ|სუბდურულ|ეპიდურულ.{0,10}ჰემატომ|სუბარაქნოიდ|intracranial (hemorrhage|haemorrhage)|subdural|epidural hematoma|subarachnoid/i, labelKa: 'ქალასშიდა სისხლჩაქცევა' },
  { re: /შუა\s+ხაზის.{0,15}(ცდომ|გადაადგილ|დისლოკაც)|midline shift|ჩაჭედ|herniation/i, labelKa: 'შუა ხაზის ცდომა / ჩაჭედვა' },
  { re: /ფილტვის.{0,20}(არტერიის\s+)?თრომბოემბოლ|თრომბოემბოლი|pulmonary embol/i, labelKa: 'ფილტვის არტერიის თრომბოემბოლია' },
  { re: /დისექცი|dissection/i, labelKa: 'არტერიის დისექცია' },
  { re: /თავისუფალი\s+(ჰაერი|გაზი)|პნევმოპერიტონეუმ|free (intraperitoneal )?air|pneumoperitoneum/i, labelKa: 'თავისუფალი ჰაერი მუცლის ღრუში' },
  { re: /ნაწლავის\s+გაუვალობ|bowel obstruction|ileus/i, labelKa: 'ნაწლავის გაუვალობა' },
  { re: /ტორსი|torsion/i, labelKa: 'ორგანოს ტორსია' },
  { re: /ზურგის\s+ტვინის.{0,15}კომპრეს|cord compression|cauda equina/i, labelKa: 'ზურგის ტვინის კომპრესია' },
  { re: /(ანევრიზმ|aneurysm).{0,25}(გასკდ|რუპტურ|rupture)|(rupture|გასკდ).{0,25}(aneurysm|ანევრიზმ)/i, labelKa: 'გასკდომილი ანევრიზმა' },
  { re: /მწვავე.{0,15}(იშემიურ|ინფარქტ)|acute (ischemic )?(infarct|stroke)|(dwi|დიფუზი).{0,25}(რესტრიქც|შეზღუდ)|diffusion restriction/i, labelKa: 'მწვავე იშემია / ინფარქტი' },
  { re: /ექტოპიურ|ectopic pregnancy/i, labelKa: 'ექტოპიური ორსულობა' },
  { re: /პორტულ.{0,10}ვენ.{0,15}(გაზ|ჰაერ)|portal venous gas|pneumatosis/i, labelKa: 'პორტული ვენის აირი / პნევმატოზი' },
];

const SIGNIFICANT: Pattern[] = [
  { re: /სიმსივნ|წარმონაქმნ|მასა(?![ა-ჰ])|mass\b|tumou?r|neoplas|კარცინომ|carcinoma|მეტასტაზ|metasta/i, labelKa: 'მოცულობითი წარმონაქმნი' },
  { re: /პნევმონი|ინფილტრაც|კონსოლიდაც|pneumonia|consolidation|infiltrat/i, labelKa: 'ფილტვის ინფილტრაცია / კონსოლიდაცია' },
  { re: /პლევრულ.{0,10}(გამონაჟონ|სითხ)|pleural effusion/i, labelKa: 'პლევრული გამონაჟონი' },
  { re: /მოტეხილობ|fracture/i, labelKa: 'მოტეხილობა' },
  { re: /თრომბ(?!ოემბოლ)|thrombus|thrombosis/i, labelKa: 'თრომბოზი' },
  { re: /აბსცეს|abscess/i, labelKa: 'აბსცესი' },
  { re: /ჰიდრონეფროზ|hydronephros/i, labelKa: 'ჰიდრონეფროზი' },
  { re: /ჰიდროცეფალ|hydrocephal/i, labelKa: 'ჰიდროცეფალია' },
  { re: /სტენოზ|stenosis/i, labelKa: 'სტენოზი' },
  { re: /ასციტ|ascites/i, labelKa: 'ასციტი' },
];

const MEASURE = /(\d+(?:[.,]\d+)?)\s*(?:[x×*]\s*(\d+(?:[.,]\d+)?)\s*)?(?:[x×*]\s*(\d+(?:[.,]\d+)?)\s*)?(მმ|mm|სმ|cm)(?![a-zა-ჰ])/gi;

export function largestMm(text: string): number | null {
  let max: number | null = null;
  for (const m of text.matchAll(MEASURE)) {
    const factor = /სმ|cm/i.test(m[4]) ? 10 : 1;
    for (const v of [m[1], m[2], m[3]]) {
      if (!v) continue;
      const mm = Number(v.replace(',', '.')) * factor;
      if (Number.isFinite(mm) && (max === null || mm > max)) max = mm;
    }
  }
  return max;
}

function laterality(t: string): ImagingFinding['laterality'] {
  if (/ორმხრივ|bilateral/i.test(t)) return 'ორმხრივი';
  const r = /მარჯვ|\bright\b/i.test(t);
  const l = /მარცხ|\bleft\b/i.test(t);
  if (r && l) return 'ორმხრივი';
  if (r) return 'მარჯვენა';
  if (l) return 'მარცხენა';
  return null;
}

type Incidental = { re: RegExp; labelKa: string; rule: (mm: number | null, age: number | null, sex: string) => string };

const INCIDENTAL: Incidental[] = [
  {
    re: /(ფილტვ|ფილტვის|lung|pulmonary).{0,40}(კვანძ|nodule)|(კვანძ|nodule).{0,40}(ფილტვ|lung|pulmonary)/i,
    labelKa: 'ფილტვის კვანძი',
    rule: (mm) => {
      const base = 'Fleischner 2017 (შემთხვევითი, მყარი, ერთეული კვანძი; ≥35 წ., არა ონკოლოგიური/იმუნოსუპრესიული პაციენტი): ';
      if (mm === null) return base + 'ზომა ტექსტში არ არის — გადაწყვეტილებისთვის აუცილებელია საშუალო დიამეტრი მმ-ში.';
      if (mm < 6) return base + `<6 მმ — დაბალი რისკისას რუტინული დაკვირვება არ არის საჭირო; მაღალი რისკისას — არჩევითი კტ 12 თვეში. (ზომა: ${mm} მმ)`;
      if (mm <= 8) return base + `6–8 მმ — კტ 6–12 თვეში; მაღალი რისკისას შემდეგ 18–24 თვეშიც. (ზომა: ${mm} მმ)`;
      return base + `>8 მმ — განიხილეთ კტ 3 თვეში, PET/CT ან ბიოფსია. (ზომა: ${mm} მმ)`;
    },
  },
  {
    re: /ფარისებრ.{0,40}(კვანძ|წარმონაქმნ)|thyroid.{0,20}nodule/i,
    labelKa: 'ფარისებრი ჯირკვლის კვანძი',
    rule: (mm, age) => {
      const base = 'ACR (Hoang 2015, კტ/მრტ-ზე შემთხვევითი კვანძი): ';
      if (mm === null) return base + 'ზომა არ არის მითითებული. ულტრაბგერა ნაჩვენებია ზომის მიუხედავად, თუ არის საეჭვო ნიშნები (ინვაზია, პათოლოგიური ლიმფური კვანძები).';
      const threshold = age !== null && age < 35 ? 10 : 15;
      return base + (mm >= threshold
        ? `${mm} მმ ≥ ${threshold} მმ — ნაჩვენებია ფარისებრი ჯირკვლის ულტრაბგერა.`
        : `${mm} მმ < ${threshold} მმ — საეჭვო ნიშნების გარეშე დამატებითი შეფასება არ არის საჭირო.`) + (age === null ? ' (ზღვარი ასაკზეა დამოკიდებული: <35 წ. — 10 მმ, ≥35 — 15 მმ; ასაკი უცნობია)' : '');
    },
  },
  {
    re: /თირკმელზედა|ადრენალ|adrenal/i,
    labelKa: 'თირკმელზედა ჯირკვლის წარმონაქმნი',
    rule: (mm) =>
      'ACR 2017 / ESE–ENSAT 2023: ' +
      (mm !== null && mm < 10 ? `${mm} მმ (<10 მმ) — ჩვეულებრივ დამატებითი შეფასება არ საჭიროებს. ` : '') +
      'ჰორმონული სკრინინგი (1 მგ დექსამეტაზონის სუპრესიის ტესტი) — ყველა ინციდენტალომაზე; ჰიპერტენზიისას — ალდოსტერონ/რენინიც. არაკონტრასტულ კტ-ზე ≤10 HU, ერთგვაროვანი, <4 სმ — კეთილთვისებიანი, დამატებითი ვიზუალიზაცია არ არის საჭირო.',
  },
  {
    re: /(მუცლის|აბდომინურ|ინფრარენულ|abdominal|infrarenal).{0,25}(აორტ|aort)|(აორტ|aort).{0,25}(ანევრიზმ|aneurysm|გაფართოებ|dilat)/i,
    labelKa: 'აორტის გაფართოება / ანევრიზმა',
    rule: (mm, _age, sex) => {
      const base = 'ESVS 2024: ';
      if (mm === null) return base + 'დიამეტრი არ არის მითითებული — ≥30 მმ განიხილება ანევრიზმად.';
      if (mm < 30) return base + `${mm} მმ — ანევრიზმის კრიტერიუმს (≥30 მმ) არ აკმაყოფილებს.`;
      const repair = sex === 'female' ? 50 : 55;
      const interval = mm < 40 ? 'დაკვირვება ~3 წელიწადში' : mm < 50 ? 'დაკვირვება ყოველწლიურად' : 'დაკვირვება 3–6 თვეში';
      return base + `${mm} მმ — ანევრიზმა; ${interval}. ოპერაციული მკურნალობის ზღვარი: ${repair} მმ${sex === 'unspecified' ? ' (მამაკაცი 55, ქალი 50)' : ''}. სისხლძარღვთა ქირურგთან კონსულტაცია ${mm >= repair ? 'ახლავე' : 'დაგეგმილად'}.`;
    },
  },
  {
    re: /(თირკმ|renal|kidney).{0,30}(კისტ|cyst)|(კისტ|cyst).{0,30}(თირკმ|renal|kidney)/i,
    labelKa: 'თირკმლის კისტა',
    rule: () =>
      'Bosniak v2019: მარტივი კისტა (Bosniak I–II) დაკვირვებას არ საჭიროებს. ძგიდეები, გასქელებული კედელი, კალციფიკაცია ან კონტრასტის დაგროვება — საჭიროებს Bosniak კლასიფიკაციას და უროლოგის შეფასებას.',
  },
];

const RECOMMEND = /რეკომენდ|მიზანშეწონილ|საჭიროა|ნაჩვენებია|შემდგომი\s+(კვლევ|დაკვირვებ)|recommend|suggest(ed)? (follow|correlation)|follow-?up|advised|correlat/i;
const IMPRESSION_HEAD = /^(დასკვნა|შეჯამება|დასკვნითი|impression|conclusion|summary|opinion)\s*[:：-]/i;

function splitSentences(report: string): string[] {
  return report
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.;!?])\s+(?=[A-ZА-Яა-ჰ0-9])/)
    .flatMap((s) => s.split(/;\s*/))
    .map((s) => s.replace(/^\s*[-•*\d.)]+\s*/, '').replace(/^(აღწერა|დასკვნა|შეჯამება|findings|impression|conclusion|technique|ტექნიკა)\s*[:：-]\s*/i, '').trim())
    .filter((s) => s.length > 6);
}

export function analyzeImagingReport(
  report: string,
  patient: { age: number | null; sex: string; egfr: number | null } = { age: null, sex: 'unspecified', egfr: null },
): ImagingAnalysis {
  const modality = MODALITIES.find((m) => m.re.test(report))?.ka ?? null;

  // Impression: the block after a heading such as "დასკვნა:" up to the next heading.
  const lines = report.split(/\n/);
  const impression: string[] = [];
  let inImp = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    if (IMPRESSION_HEAD.test(l)) {
      inImp = true;
      const rest = l.replace(IMPRESSION_HEAD, '').trim();
      if (rest) impression.push(rest);
      continue;
    }
    if (inImp && /^[ა-ჰA-Za-z ]{3,25}[:：]\s*$/.test(l)) break;
    if (inImp) impression.push(l);
  }

  const findings: ImagingFinding[] = splitSentences(report).map((text) => {
    const hedged = HEDGE.test(text);
    const negated = !hedged && NEGATION.test(text);
    const crit = CRITICAL.find((p) => p.re.test(text));
    const inc = INCIDENTAL.find((p) => p.re.test(text));
    const sig = SIGNIFICANT.find((p) => p.re.test(text));
    const mm = largestMm(text);
    let kind: FindingKind = 'other';
    let labelKa: string | null = null;
    let followUpKa: string | null = null;
    if (negated && !crit && !inc && !sig) kind = 'negative';
    else if (negated) kind = 'negative';
    else if (crit) { kind = 'critical'; labelKa = crit.labelKa; }
    else if (inc) { kind = 'incidental'; labelKa = inc.labelKa; followUpKa = inc.rule(mm, patient.age, patient.sex); }
    else if (sig) { kind = 'significant'; labelKa = sig.labelKa; }
    if (negated && (crit || sig || inc)) labelKa = (crit ?? inc ?? sig)!.labelKa;
    return { text, kind, hedged, laterality: laterality(text), largestMm: mm, labelKa, followUpKa };
  });

  const recommendations = findings.filter((f) => RECOMMEND.test(f.text)).map((f) => f.text);

  const contrastWarnings: string[] = [];
  const mentionsContrast = /კონტრასტ|contrast|გადოლინ|gadolin|angiograph|ანგიოგრაფ|\bcta\b/i.test(recommendations.join(' '));
  if (mentionsContrast && patient.egfr !== null && patient.egfr < 30) {
    contrastWarnings.push(`რეკომენდებულია კონტრასტული კვლევა, პაციენტის eGFR ${patient.egfr} მლ/წთ — საჭიროა თირკმლის ფუნქციის გათვალისწინება (იოდშემცველი კონტრასტი: ჰიდრატაცია/ალტერნატივა; გადოლინიუმი: მაკროციკლური აგენტი, NSF-ის რისკის შეფასება).`);
  }

  return {
    modality,
    hasImpression: impression.length > 0,
    impression,
    findings,
    critical: findings.filter((f) => f.kind === 'critical'),
    incidental: findings.filter((f) => f.kind === 'incidental'),
    hedged: findings.filter((f) => f.hedged && f.kind !== 'negative'),
    negatives: findings.filter((f) => f.kind === 'negative'),
    recommendations,
    contrastWarnings,
  };
}

/** True when free text reads like a radiology report rather than a question about one. */
export function looksLikeImagingReport(text: string): boolean {
  if (text.trim().length < 60) return false;
  const modality = MODALITIES.some((m) => m.re.test(text));
  const anatomy = /ფილტვ|ღვიძლ|თირკმ|ტვინ|ხერხემ|აორტ|გულ|მუცლ|მენჯ|lung|liver|kidney|brain|spine|aorta|abdomen|pelvis/i.test(text);
  const reportish = /აღინიშნება|ვიზუალიზდება|ვლინდება|დასკვნა|impression|findings|is seen|are seen|noted/i.test(text);
  return modality && anatomy && reportish;
}
