/**
 * LOW-VALUE MEDICATION REGISTRY
 *
 * The point of the polypharmacy module, in the author's own words:
 * „არასაჭირო პრეპარატების შემცირება — ... დუბლიკაციური, არაეფექტური და
 *  ფუჭი მედიკამენტები, მათ შორის BAD-ები, „ნოოტროპები“,
 *  „ცერებროვასკულარული გამაუმჯობესებლები“ და ა.შ."
 *
 * HOW THIS REGISTRY IS DISCIPLINED
 * This is not a blacklist of opinions. Every entry states:
 *   1. the regulatory fact — is it approved by FDA / EMA, and where is it sold;
 *   2. the evidence grade — what adequately designed research actually shows;
 *   3. the named review or trial behind that grade, with a resolvable link;
 *   4. what has evidence instead.
 *
 * Where no high-quality international review exists, the grade is
 * `no_international_assessment` — NOT "proven useless". Absence of evidence is
 * reported as absence of evidence. That distinction is what separates a
 * clinical instrument from a polemic, and it is also the only way this
 * survives an argument with the physician who prescribed the drug.
 *
 * Every entry carries `liveQuery`, run against Europe PMC at request time, so
 * the clinician sees current literature rather than a frozen verdict.
 */

export type EvidenceGrade =
  | 'no_benefit_shown'
  | 'harm_signal'
  | 'very_low_certainty'
  | 'insufficient_evidence'
  | 'no_international_assessment'
  | 'limited_benefit';

export type LowValueCategory =
  | 'nootropic'
  | 'cerebrovascular'
  | 'metabolic_injectable'
  | 'hepatoprotector'
  | 'supplement'
  | 'joint'
  | 'immune'
  | 'homeopathy'
  | 'antibiotic_misuse'
  | 'other';

export type DeprescribeTier = 'I_stop_now' | 'II_taper' | 'III_monitor' | 'IV_keep';

export type LowValueEntry = {
  id: string;
  inn: string;
  nameKa: string;
  brandsGe: string[];
  category: LowValueCategory;
  claimedKa: string[];
  grade: EvidenceGrade;
  /** Approval status. `false` means not approved for the claimed indication. */
  approval: { fda: boolean; ema: boolean; noteKa?: string };
  evidenceKa: string;
  keyReference: { titleKa: string; citation: string; year: number; url: string } | null;
  harmsKa: string[];
  insteadKa: string[];
  tier: DeprescribeTier;
  liveQuery: string;
  /**
   * The single term to anchor a literature search on. Explicit, because
   * deriving it from the INN gives nonsense for multi-word names:
   * "Deproteinised calf blood extract" → "Deproteinised" matches dentistry.
   */
  evidenceTerm: string;
};

export const GRADE_KA: Record<EvidenceGrade, string> = {
  no_benefit_shown: 'სარგებელი არ დადასტურდა',
  harm_signal: 'სარგებელი არ დადასტურდა + ზიანის სიგნალი',
  very_low_certainty: 'ძალიან დაბალი სანდოობის მტკიცებულება',
  insufficient_evidence: 'მტკიცებულება არასაკმარისია',
  no_international_assessment: 'საერთაშორისო შეფასება არ არსებობს',
  limited_benefit: 'შეზღუდული სარგებელი ვიწრო ჩვენებაში',
};

export const GRADE_TONE: Record<EvidenceGrade, 'critical' | 'high' | 'moderate' | 'low'> = {
  harm_signal: 'critical',
  no_benefit_shown: 'high',
  no_international_assessment: 'moderate',
  insufficient_evidence: 'moderate',
  very_low_certainty: 'moderate',
  limited_benefit: 'low',
};

export const CATEGORY_KA: Record<LowValueCategory, string> = {
  nootropic: 'ნოოტროპები',
  cerebrovascular: '„ცერებროვასკულარული გამაუმჯობესებლები“',
  metabolic_injectable: '„მეტაბოლური“ ინექციები',
  hepatoprotector: 'ჰეპატოპროტექტორები',
  supplement: 'BAD — დიეტური დანამატები',
  joint: 'სახსრების დანამატები',
  immune: '„იმუნომოდულატორები“',
  homeopathy: 'ჰომეოპათია',
  antibiotic_misuse: 'ანტიბიოტიკის არასწორი გამოყენება',
  other: 'სხვა',
};

export const TIER_KA: Record<DeprescribeTier, { labelKa: string; actionKa: string }> = {
  I_stop_now: { labelKa: 'I — დაუყოვნებლივი შეწყვეტა', actionKa: 'შეწყვეტა ან ჩანაცვლება დაუყოვნებლივ, ექიმის კონტროლით' },
  II_taper: { labelKa: 'II — ეტაპობრივი შემცირება', actionKa: 'ტიტრაციის გეგმა (7–30 დღე)' },
  III_monitor: { labelKa: 'III — მონიტორინგით დატოვება', actionKa: 'დარჩება დროებით, კონტროლი ყოველ 30 დღეში' },
  IV_keep: { labelKa: 'IV — შენარჩუნება', actionKa: 'უცვლელი' },
};

const NO_APPROVAL_REGIONAL =
  'არ არის დარეგისტრირებული FDA-ს ან EMA-ს მიერ. იყიდება ძირითადად პოსტსაბჭოთა ქვეყნებში.';

export const LOW_VALUE_MEDS: LowValueEntry[] = [
  // ---------------- „ტვინის მკვებავები“ ----------------
  {
    id: 'cerebrolysin',
    inn: 'Cerebrolysin',
    nameKa: 'ცერებროლიზინი',
    brandsGe: ['Cerebrolysin', 'ცერებროლიზინი'],
    category: 'nootropic',
    claimedKa: ['ინსულტის მკურნალობა', 'დემენცია', 'ტრავმული თავის ტვინის დაზიანება', '„ტვინის კვება“'],
    grade: 'harm_signal',
    approval: { fda: false, ema: false, noteKa: NO_APPROVAL_REGIONAL },
    evidenceKa:
      'მწვავე იშემიურ ინსულტში Cochrane-ის მიმოხილვამ კლინიკური სარგებელი ვერ აღმოაჩინა (საშუალო ხარისხის მტკიცებულება) და დაფიქსირდა სერიოზული გვერდითი მოვლენების შესაძლო ზრდა: 62/589 vs 46/600 (RR 1.37). ვასკულურ დემენციაში 2019 წლის მიმოხილვა იტყობინება კოგნიციის გაუმჯობესებას, მაგრამ GRADE შეფასებით ყველა საბოლოო წერტილისთვის სანდოობა ძალიან დაბალია და ავტორები შედეგს არადეფინიციურად მიიჩნევენ.',
    keyReference: {
      titleKa: 'Cerebrolysin for acute ischaemic stroke — Cochrane',
      citation: 'Ziganshina LE et al. Cochrane Database Syst Rev. CD007026',
      year: 2016,
      url: 'https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD007026.pub4/abstract',
    },
    harmsKa: ['სერიოზული გვერდითი მოვლენების შესაძლო ზრდა მწვავე ინსულტში', 'ყოველდღიური ინექცია — ინვაზიური ტვირთი', 'მაღალი ფასი'],
    insteadKa: ['ინსულტში: დროული რეპერფუზია, ანტითრომბოზული თერაპია, ორგანიზებული ინსულტის განყოფილება, რეაბილიტაცია', 'დემენციაში: მიზეზის დიაგნოსტიკა, რისკ-ფაქტორების მართვა, არამედიკამენტური ინტერვენციები'],
    tier: 'I_stop_now',
    liveQuery: 'cerebrolysin AND (stroke OR dementia)',
    evidenceTerm: 'Cerebrolysin',
  },
  {
    id: 'piracetam',
    inn: 'Piracetam',
    nameKa: 'პირაცეტამი',
    brandsGe: ['Nootropil', 'Lucetam', 'პირაცეტამი', 'ნოოტროპილი'],
    category: 'nootropic',
    claimedKa: ['მეხსიერების გაუმჯობესება', 'დემენცია', 'კოგნიტური დაქვეითება', 'თავბრუსხვევა'],
    grade: 'insufficient_evidence',
    approval: { fda: false, ema: false, noteKa: 'FDA-ს მიერ არ არის დამტკიცებული. აშშ-ში დიეტურ დანამატად გაყიდვაც უკანონოა.' },
    evidenceKa:
      'Cochrane-ის მიმოხილვის დასკვნა: პირაცეტამის ეფექტიანობის მტკიცებულება დემენციისა და კოგნიტური დაქვეითებისთვის არასაკმარისია კლინიკური გამოყენებისთვის. ათწლეულების გამოყენების შემდეგ დამაჯერებელი კლინიკური საბოლოო წერტილი არ დადასტურებულა.',
    keyReference: {
      titleKa: 'Piracetam for dementia or cognitive impairment — Cochrane',
      citation: 'Flicker L, Grimley Evans J. Cochrane Database Syst Rev. CD001011',
      year: 2004,
      url: 'https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD001011/full',
    },
    harmsKa: ['ფსიქომოტორული აგზნებადობა, უძილობა', 'თირკმლის უკმარისობისას დოზის კორექცია საჭიროა', 'ფუჭი ხარჯი'],
    insteadKa: ['კოგნიტური დაქვეითების მიზეზის დიაგნოსტიკა (B12, თიროიდი, დეპრესია, მედიკამენტური)', 'სისხლძარღვოვანი რისკ-ფაქტორების კონტროლი', 'ფიზიკური აქტივობა და კოგნიტური ჩართულობა'],
    tier: 'II_taper',
    liveQuery: 'piracetam AND (dementia OR cognition)',
    evidenceTerm: 'Piracetam',
  },
  {
    id: 'vinpocetine',
    inn: 'Vinpocetine',
    nameKa: 'ვინპოცეტინი',
    brandsGe: ['Cavinton', 'კავინტონი', 'ვინპოცეტინი'],
    category: 'cerebrovascular',
    claimedKa: ['ტვინის სისხლის მიმოქცევის გაუმჯობესება', 'დემენცია', 'თავბრუსხვევა', 'ყურში შუილი'],
    grade: 'insufficient_evidence',
    approval: { fda: false, ema: false, noteKa: 'FDA-მ გააფრთხილა, რომ ვინპოცეტინი არ არის კანონიერი დიეტური დანამატი და საშიშია ორსულობისას.' },
    evidenceKa:
      'Cochrane-ის მიმოხილვის დასკვნა: დემენციის მქონე პაციენტებში ვინპოცეტინის სარგებლის მტკიცებულება არასაკმარისია. „ტვინის სისხლის მიმოქცევის გაუმჯობესება“ არ არის კლინიკური საბოლოო წერტილი — ის სურათია, არა შედეგი.',
    keyReference: {
      titleKa: 'Vinpocetine for cognitive impairment and dementia — Cochrane',
      citation: 'Szatmári S, Whitehouse P. Cochrane Database Syst Rev. CD003119',
      year: 2003,
      url: 'https://www.cochrane.org/evidence/CD003119_insufficient-evidence-benefits-vinpocetine-people-dementia',
    },
    harmsKa: ['ორსულობისას საშიში — FDA-ს გაფრთხილება', 'კუჭ-ნაწლავის დისკომფორტი, თავბრუსხვევა'],
    insteadKa: ['თავბრუსხვევისას: ვესტიბულური დიაგნოსტიკა (BPPV — Dix-Hallpike, Epley-ის მანევრი)', 'სისხლძარღვოვანი რისკის კონტროლი'],
    tier: 'I_stop_now',
    liveQuery: 'vinpocetine AND (dementia OR cognitive OR stroke)',
    evidenceTerm: 'Vinpocetine',
  },
  {
    id: 'actovegin',
    inn: 'Deproteinised calf blood extract',
    nameKa: 'აქტოვეგინი',
    brandsGe: ['Actovegin', 'აქტოვეგინი', 'Solcoseryl'],
    category: 'cerebrovascular',
    claimedKa: ['ინსულტის აღდგენა', 'დიაბეტური პოლინეიროპათია', 'კოგნიტური დარღვევა', 'ჭრილობის შეხორცება'],
    grade: 'no_international_assessment',
    approval: { fda: false, ema: false, noteKa: 'არ არის დამტკიცებული FDA-ს ან EMA-ს მიერ. ხბოს სისხლის დეპროტეინიზებული ექსტრაქტი — სტანდარტიზებული აქტიური ნივთიერება არ არის განსაზღვრული.' },
    evidenceKa:
      'პრეპარატის აქტიური შემადგენლობა ზუსტად დახასიათებული არ არის, რაც დოზა-პასუხის დადგენას შეუძლებელს ხდის. მაღალი ხარისხის დამოუკიდებელი მიმოხილვა, რომელიც კლინიკურ სარგებელს დაადასტურებდა, არ არსებობს. ეს არ ნიშნავს დადასტურებულ უეფექტურობას — ნიშნავს, რომ მტკიცებულება არ არის წარმოდგენილი.',
    keyReference: null,
    harmsKa: ['ანაფილაქსიური რეაქციის რისკი (ბიოლოგიური წარმოშობის პრეპარატი)', 'ყოველდღიური ინფუზიის ტვირთი', 'მაღალი ფასი'],
    insteadKa: ['დიაბეტური ნეიროპათიისას: გლიკემიური კონტროლი, ტკივილის მართვა დადასტურებული აგენტებით (დულოქსეტინი, გაბაპენტინოიდები)', 'ჭრილობისას: სტანდარტული ჭრილობის მოვლა, ინფექციის კონტროლი, განტვირთვა'],
    tier: 'I_stop_now',
    liveQuery: 'actovegin OR "deproteinised calf blood"',
    evidenceTerm: 'Actovegin',
  },
  {
    id: 'citicoline',
    inn: 'Citicoline',
    nameKa: 'ციტიკოლინი',
    brandsGe: ['Ceraxon', 'Somazina', 'ციტიკოლინი'],
    category: 'nootropic',
    claimedKa: ['ინსულტის აღდგენა', 'კოგნიტური დაქვეითება'],
    grade: 'no_benefit_shown',
    approval: { fda: false, ema: false, noteKa: 'ევროპის ნაწილში რეგისტრირებულია; აშშ-ში მხოლოდ დანამატად.' },
    evidenceKa:
      'ICTUS — დიდი რანდომიზებული კონტროლირებადი კვლევა მწვავე იშემიურ ინსულტში — არ აჩვენა სარგებელი ფუნქციურ გამოსავალზე პლაცებოსთან შედარებით. ეს ზუსტად ის სიტუაციაა, როცა მცირე დადებითი კვლევები ადეკვატურად დაგეგმილი კვლევით არ დადასტურდა.',
    keyReference: {
      titleKa: 'Citicoline in acute ischaemic stroke (ICTUS) — randomised trial',
      citation: 'Dávalos A et al. Lancet',
      year: 2012,
      url: 'https://europepmc.org/search?query=ICTUS%20citicoline%20stroke',
    },
    harmsKa: ['ფუჭი ხარჯი', 'რეაბილიტაციისგან ყურადღების გადატანა'],
    insteadKa: ['ორგანიზებული ინსულტის მოვლა და ადრეული რეაბილიტაცია — დადასტურებული ეფექტით'],
    tier: 'II_taper',
    liveQuery: 'citicoline AND stroke',
    evidenceTerm: 'Citicoline',
  },
  {
    id: 'choline-alfoscerate',
    inn: 'Choline alfoscerate',
    nameKa: 'ქოლინის ალფოსცერატი',
    brandsGe: ['Gliatilin', 'Cereton', 'გლიატილინი'],
    category: 'nootropic',
    claimedKa: ['დემენცია', 'ინსულტის შემდგომი კოგნიტური დარღვევა'],
    grade: 'insufficient_evidence',
    approval: { fda: false, ema: false, noteKa: NO_APPROVAL_REGIONAL },
    evidenceKa:
      'მტკიცებულება შემოიფარგლება მცირე ზომის კვლევებით; მაღალი ხარისხის დამოუკიდებელი დადასტურება არ არსებობს. ზოგიერთმა დიდმა დაკვირვებით კვლევამ ინსულტის რისკის შესაძლო ზრდაზეც მიუთითა — ეს სიგნალი საჭიროებს დამოუკიდებელ შეფასებას.',
    keyReference: null,
    harmsKa: ['ხანგრძლივი უსაფრთხოების მონაცემები არასაკმარისია', 'ფუჭი ხარჯი'],
    insteadKa: ['დემენციის ტიპის დიაგნოსტიკა და მიზნობრივი მკურნალობა', 'მომვლელის მხარდაჭერა და გარემოს ადაპტაცია'],
    tier: 'II_taper',
    liveQuery: '"choline alfoscerate" AND (dementia OR stroke)',
    evidenceTerm: 'choline alfoscerate',
  },
  {
    id: 'mexidol',
    inn: 'Ethylmethylhydroxypyridine succinate',
    nameKa: 'მექსიდოლი',
    brandsGe: ['Mexidol', 'მექსიდოლი'],
    category: 'metabolic_injectable',
    claimedKa: ['ანტიჰიპოქსიური/ანტიოქსიდანტური მოქმედება', 'ინსულტი', 'ენცეფალოპათია'],
    grade: 'no_international_assessment',
    approval: { fda: false, ema: false, noteKa: NO_APPROVAL_REGIONAL },
    evidenceKa:
      'პრეპარატის კლინიკური მტკიცებულება თითქმის მთლიანად რეგიონული პუბლიკაციებით შემოიფარგლება. დამოუკიდებელი, საერთაშორისო რეცენზირებული, ადეკვატურად დაგეგმილი კვლევა, რომელიც კლინიკურ საბოლოო წერტილზე ეფექტს აჩვენებდა, არ არის ხელმისაწვდომი.',
    keyReference: null,
    harmsKa: ['ინექციური ტვირთი', 'ფუჭი ხარჯი', 'დადასტურებული თერაპიის დაგვიანება'],
    insteadKa: ['ინსულტში: დადასტურებული მწვავე და მეორადი პრევენციის პროტოკოლი'],
    tier: 'I_stop_now',
    liveQuery: 'mexidol OR "ethylmethylhydroxypyridine succinate"',
    evidenceTerm: 'Mexidol',
  },
  {
    id: 'meldonium',
    inn: 'Meldonium',
    nameKa: 'მელდონიუმი',
    brandsGe: ['Mildronate', 'მილდრონატი', 'მელდონიუმი'],
    category: 'metabolic_injectable',
    claimedKa: ['„მეტაბოლური მხარდაჭერა“', 'გულის იშემიური დაავადება', 'გამძლეობის ზრდა'],
    grade: 'no_international_assessment',
    approval: { fda: false, ema: false, noteKa: 'არ არის დამტკიცებული FDA-ს ან EMA-ს მიერ. WADA-ს აკრძალულ ნივთიერებათა სიაშია 2016 წლიდან.' },
    evidenceKa: 'კარდიოლოგიურ საბოლოო წერტილებზე დამოუკიდებელი მაღალი ხარისხის მტკიცებულება არ არსებობს.',
    keyReference: null,
    harmsKa: ['დოპინგის სტატუსი — სპორტსმენებისთვის დისკვალიფიკაცია', 'ფუჭი ხარჯი'],
    insteadKa: ['გულის იშემიურ დაავადებაში: სტატინი, ანტიაგრეგანტი, β-ბლოკერი/ACE-ინჰიბიტორი ჩვენების მიხედვით, რევასკულარიზაცია'],
    tier: 'I_stop_now',
    liveQuery: 'meldonium OR mildronate',
    evidenceTerm: 'Meldonium',
  },
  {
    id: 'ginkgo',
    inn: 'Ginkgo biloba extract',
    nameKa: 'გინკგო ბილობა',
    brandsGe: ['Tanakan', 'Bilobil', 'Memoplant', 'გინკგო'],
    category: 'supplement',
    claimedKa: ['დემენციის პრევენცია', 'მეხსიერების გაუმჯობესება', 'ყურში შუილი'],
    grade: 'no_benefit_shown',
    approval: { fda: false, ema: false, noteKa: 'დიეტური დანამატი, არა წამალი.' },
    evidenceKa:
      'GEM (Ginkgo Evaluation of Memory) — 3 000-ზე მეტი ხანდაზმულის რანდომიზებული კვლევა — აჩვენა, რომ გინკგო ბილობა არ ამცირებს დემენციისა და ალცჰაიმერის დაავადების განვითარების რისკს. ეს სწორედ იმ ზომისა და ხარისხის კვლევაა, რომელიც საკითხს ხურავს პრევენციისთვის.',
    keyReference: {
      titleKa: 'Ginkgo biloba for Prevention of Dementia (GEM) — randomised controlled trial',
      citation: 'DeKosky ST et al. JAMA. 2008;300(19):2253-2262',
      year: 2008,
      url: 'https://jamanetwork.com/journals/jama/fullarticle/182920',
    },
    harmsKa: ['სისხლდენის რისკის შესაძლო ზრდა ანტიკოაგულანტებთან/ანტიაგრეგანტებთან ერთად', 'ფუჭი ხარჯი'],
    insteadKa: ['სისხლძარღვოვანი რისკ-ფაქტორების კონტროლი — ერთადერთი დადასტურებული გზა კოგნიტური დაქვეითების რისკის შემცირებისთვის', 'სმენის კორექცია, ფიზიკური აქტივობა, სოციალური ჩართულობა'],
    tier: 'I_stop_now',
    liveQuery: '"ginkgo biloba" AND (dementia OR cognition)',
    evidenceTerm: 'Ginkgo biloba',
  },
  {
    id: 'phenibut',
    inn: 'Phenibut',
    nameKa: 'ფენიბუტი',
    brandsGe: ['Phenibut', 'Noofen', 'ფენიბუტი'],
    category: 'nootropic',
    claimedKa: ['შფოთვა', 'უძილობა', 'ბავშვებში ტიკები და ენურეზი'],
    grade: 'no_international_assessment',
    approval: { fda: false, ema: false, noteKa: 'არ არის დამტკიცებული არც ერთ დასავლურ რეგულატორის მიერ.' },
    evidenceKa:
      'კონტროლირებადი კლინიკური მტკიცებულება არ არსებობს. GABA-B აგონისტია დამოკიდებულებისა და მოხსნის სინდრომის დოკუმენტირებული რისკით — უცხოურ ტოქსიკოლოგიურ ლიტერატურაში აღწერილია მძიმე მოხსნის შემთხვევები.',
    keyReference: null,
    harmsKa: ['დამოკიდებულება და მოხსნის სინდრომი', 'სედაცია, დაცემის რისკი ხანდაზმულებში', 'ბავშვებში უსაფრთხოების მონაცემები არ არსებობს'],
    insteadKa: ['შფოთვისას: CBT, SSRI ჩვენების მიხედვით', 'უძილობისას: ძილის ჰიგიენა, CBT-I — პირველი რიგის არჩევანი'],
    tier: 'II_taper',
    liveQuery: 'phenibut AND (anxiety OR withdrawal OR dependence)',
    evidenceTerm: 'Phenibut',
  },
  // ---------------- სახსრები ----------------
  {
    id: 'glucosamine-chondroitin',
    inn: 'Glucosamine / Chondroitin sulfate',
    nameKa: 'გლუკოზამინი / ქონდროიტინი',
    brandsGe: ['Dona', 'Teraflex', 'Structum', 'Artra'],
    category: 'joint',
    claimedKa: ['სახსრის ხრტილის აღდგენა', 'ოსტეოართრიტის ტკივილი'],
    grade: 'no_benefit_shown',
    approval: { fda: false, ema: false, noteKa: 'აშშ-ში დიეტური დანამატი.' },
    evidenceKa:
      'GAIT — NIH-ის მიერ დაფინანსებული რანდომიზებული კვლევა (1 583 პაციენტი) — გლუკოზამინმა და ქონდროიტინმა, ცალ-ცალკე ან კომბინაციაში, არ აჩვენა სტატისტიკურად მნიშვნელოვანი უპირატესობა პლაცებოსთან შედარებით მუხლის ოსტეოართრიტის ტკივილის შემცირებაში მთლიან პოპულაციაში. „ხრტილის აღდგენა“ არ არის დადასტურებული.',
    keyReference: {
      titleKa: 'Glucosamine, Chondroitin Sulfate, and the Two in Combination for Painful Knee Osteoarthritis (GAIT)',
      citation: 'Clegg DO et al. N Engl J Med. 2006;354:795-808',
      year: 2006,
      url: 'https://www.nejm.org/doi/full/10.1056/NEJMoa052771',
    },
    harmsKa: ['ფუჭი ხარჯი — ხშირად მრავალთვიანი კურსი', 'რეალური ინტერვენციის დაგვიანება'],
    insteadKa: ['წონის შემცირება — ყველაზე ძლიერი ეფექტი მუხლის ოსტეოართრიტში', 'სავარჯიშო თერაპია (კვადრიცეპსის გაძლიერება)', 'ტკივილის მართვა: ტოპიკური NSAID პირველ რიგში ხანდაზმულებში'],
    tier: 'I_stop_now',
    liveQuery: '(glucosamine OR chondroitin) AND osteoarthritis',
    evidenceTerm: 'Glucosamine',
  },
  // ---------------- ჰეპატოპროტექტორები ----------------
  {
    id: 'essential-phospholipids',
    inn: 'Essential phospholipids',
    nameKa: 'ესენციური ფოსფოლიპიდები',
    brandsGe: ['Essentiale', 'ესენციალე'],
    category: 'hepatoprotector',
    claimedKa: ['ღვიძლის „დაცვა“', 'ცხიმოვანი ჰეპატოზი', 'ჰეპატიტი'],
    grade: 'insufficient_evidence',
    approval: { fda: false, ema: false, noteKa: NO_APPROVAL_REGIONAL },
    evidenceKa:
      '„ჰეპატოპროტექცია“ არ არის რეგულატორულად აღიარებული კლინიკური კატეგორია. მყარი საბოლოო წერტილებზე (ფიბროზის პროგრესირება, დეკომპენსაცია, სიკვდილობა) სარგებელი დადასტურებული არ არის.',
    keyReference: null,
    harmsKa: ['ფუჭი ხარჯი', 'პაციენტში შთაბეჭდილების შექმნა, რომ ღვიძლი „დაცულია“ და ალკოჰოლის/წონის კორექცია საჭირო არ არის'],
    insteadKa: ['MASLD/ცხიმოვანი ღვიძლისას: წონის 7–10%-იანი შემცირება — ერთადერთი დადასტურებული ეფექტური ინტერვენცია', 'ალკოჰოლის შეწყვეტა', 'მეტაბოლური სინდრომის კომპონენტების მართვა'],
    tier: 'I_stop_now',
    liveQuery: '"essential phospholipids" AND (liver OR hepatic OR steatosis)',
    evidenceTerm: 'essential phospholipids',
  },
  // ---------------- „მეტაბოლური“ ინექციები ----------------
  {
    id: 'metabolic-injectables',
    inn: 'ATP / Cocarboxylase / Inosine (riboxin)',
    nameKa: 'ATP / კოკარბოქსილაზა / რიბოქსინი',
    brandsGe: ['Riboxin', 'Cocarboxylase', 'ATP'],
    category: 'metabolic_injectable',
    claimedKa: ['„მეტაბოლური მხარდაჭერა“', 'გულის კუნთის „კვება“', 'ასთენია'],
    grade: 'no_international_assessment',
    approval: { fda: false, ema: false, noteKa: NO_APPROVAL_REGIONAL },
    evidenceKa:
      'არ არსებობს კონტროლირებადი მტკიცებულება კლინიკურ საბოლოო წერტილებზე. ეს აგენტები თანამედროვე საერთაშორისო გაიდლაინებში არ არის მოხსენიებული — არც როგორც რეკომენდაცია, არც როგორც ალტერნატივა.',
    keyReference: null,
    harmsKa: ['ინექციასთან დაკავშირებული ინფექციის რისკი', 'ფუჭი ხარჯი', 'პოლიფარმაციის ზრდა'],
    insteadKa: ['ასთენიის მიზეზის დიაგნოსტიკა: ანემია, თიროიდი, დეპრესია, ძილის აპნოე, მედიკამენტური გვერდითი ეფექტი'],
    tier: 'I_stop_now',
    liveQuery: '(riboxin OR inosine OR cocarboxylase) AND clinical',
    evidenceTerm: 'Inosine',
  },
  // ---------------- ჰომეოპათია ----------------
  {
    id: 'homeopathy',
    inn: 'Homeopathic preparations',
    nameKa: 'ჰომეოპათიური საშუალებები',
    brandsGe: ['Oscillococcinum', 'Traumeel', 'Lymphomyosot', 'Engystol', 'Anaferon', 'Ergoferon', 'ოსცილოკოკცინუმი', 'ტრაუმელი', 'ანაფერონი', 'ერგოფერონი'],
    category: 'homeopathy',
    claimedKa: ['გრიპი და ციება', 'ტრავმა და ანთება', 'ლიმფური დრენაჟი', 'იმუნიტეტის გაძლიერება'],
    grade: 'no_benefit_shown',
    approval: { fda: false, ema: false, noteKa: 'ეფექტიანობის მტკიცებულების გარეშე რეგისტრირებული პროდუქტები.' },
    evidenceKa:
      'ჰომეოპათიის ეფექტი კლინიკურ მდგომარეობებზე პლაცებოსგან განსხვავებული არ არის — ეს დასკვნა არაერთი ნაციონალური ჯანდაცვის ორგანოს სისტემური შეფასებითაა გაკეთებული. განზავების საფეხურებზე აქტიური ნივთიერება პრაქტიკულად არ რჩება.',
    keyReference: null,
    harmsKa: ['დადასტურებული მკურნალობის დაგვიანება — მთავარი რისკი', 'ფუჭი ხარჯი'],
    insteadKa: ['ვირუსული ინფექციისას: სიმპტომური მკურნალობა და წითელი დროშების ცოდნა', 'ტრავმისას: დატვირთვის კონტროლი, ტოპიკური NSAID, რეაბილიტაცია'],
    tier: 'I_stop_now',
    liveQuery: 'homeopathy AND (efficacy OR placebo) AND systematic',
    evidenceTerm: 'Homeopathy',
  },
  // ---------------- „იმუნომოდულატორები“ ----------------
  {
    id: 'immunostimulants',
    inn: 'Oral "immunostimulants"',
    nameKa: '„იმუნომოდულატორები“',
    brandsGe: ['Imudon', 'Ismigen', 'Cycloferon', 'Groprinosin', 'Echinacea', 'Arbidol', 'Kagocel', 'Ingavirin', 'იმუდონი', 'ისმიჟენი', 'ციკლოფერონი', 'გროპრინოზინი', 'ექინაცეა', 'არბიდოლი', 'კაგოცელი', 'ინგავირინი'],
    category: 'immune',
    claimedKa: ['იმუნიტეტის გაძლიერება', 'განმეორებადი რესპირაციული ინფექციების პრევენცია', 'ვირუსის მკურნალობა'],
    grade: 'insufficient_evidence',
    approval: { fda: false, ema: false, noteKa: 'უმეტესობა არ არის დამტკიცებული FDA-ს ან EMA-ს მიერ ამ ჩვენებით.' },
    evidenceKa:
      '„იმუნიტეტის გაძლიერება“ არ არის გაზომვადი კლინიკური საბოლოო წერტილი. ამ ჯგუფისთვის მყარ შედეგებზე (ჰოსპიტალიზაცია, ანტიბიოტიკის საჭიროება, გართულება) დამაჯერებელი მტკიცებულება არ არსებობს.',
    keyReference: null,
    harmsKa: ['ფუჭი ხარჯი', 'ალერგიული რეაქციები', 'ყალბი დაცულობის განცდა'],
    insteadKa: ['ვაქცინაცია (გრიპი, პნევმოკოკი, COVID-19) — დადასტურებული პრევენცია', 'განმეორებადი ინფექციებისას: იმუნოდეფიციტის გამორიცხვა და მიზეზის დიაგნოსტიკა'],
    tier: 'I_stop_now',
    liveQuery: '(immunostimulant OR echinacea) AND respiratory AND infection AND prevention',
    evidenceTerm: 'Echinacea',
  },
  {
    id: 'systemic-enzymes',
    inn: 'Systemic enzyme preparations',
    nameKa: 'სისტემური ფერმენტები',
    brandsGe: ['Wobenzym', 'Serrapeptase'],
    category: 'other',
    claimedKa: ['ანთების საწინააღმდეგო', 'შეშუპების მოხსნა', 'პოსტოპერაციული აღდგენა'],
    grade: 'insufficient_evidence',
    approval: { fda: false, ema: false, noteKa: 'დიეტური დანამატი.' },
    evidenceKa: 'პერორალურად მიღებული ფერმენტები კუჭ-ნაწლავში იშლება; სისტემური ანთების საწინააღმდეგო ეფექტის კლინიკური მტკიცებულება არ არსებობს.',
    keyReference: null,
    harmsKa: ['ფუჭი ხარჯი', 'ხშირად მრავალთვიანი კურსი'],
    insteadKa: ['ანთებისას: ჩვენების მიხედვით NSAID, ფიზიკური თერაპია, მიზეზობრივი მკურნალობა'],
    tier: 'I_stop_now',
    liveQuery: '(wobenzym OR serrapeptase OR "systemic enzyme") AND inflammation',
    evidenceTerm: 'Serrapeptase',
  },
  // ---------------- BAD ზოგადად ----------------
  {
    id: 'multivitamins-healthy',
    inn: 'Multivitamins (in the absence of deficiency)',
    nameKa: 'მულტივიტამინები დეფიციტის გარეშე',
    brandsGe: ['სხვადასხვა BAD'],
    category: 'supplement',
    claimedKa: ['ზოგადი ჯანმრთელობა', 'ენერგია', 'ქრონიკული დაავადებების პრევენცია'],
    grade: 'no_benefit_shown',
    approval: { fda: false, ema: false, noteKa: 'დიეტური დანამატი, არა წამალი.' },
    evidenceKa:
      'დოკუმენტირებული დეფიციტის გარეშე მულტივიტამინები არ ამცირებენ კარდიოვასკულური დაავადების, კიბოს ან სიკვდილობის რისკს — ეს დასკვნა დიდი რანდომიზებული კვლევებისა და პრევენციული სამსახურების სისტემური მიმოხილვების საფუძველზეა გაკეთებული.',
    keyReference: null,
    harmsKa: ['ფუჭი ხარჯი', 'ზოგიერთი ვიტამინის ჭარბი მიღების რისკი (A, D, B6)', 'პოლიფარმაციის ზრდა'],
    insteadKa: ['დეფიციტის მიზნობრივი დიაგნოსტიკა და მხოლოდ დადასტურებული დეფიციტის კორექცია', 'კვების ხარისხის შეფასება'],
    tier: 'III_monitor',
    liveQuery: 'multivitamin AND (mortality OR prevention) AND randomized',
    evidenceTerm: 'Multivitamin',
  },
  {
    id: 'omega3-primary-prevention',
    inn: 'Omega-3 (primary cardiovascular prevention)',
    nameKa: 'ომეგა-3 პირველადი პრევენციისთვის',
    brandsGe: ['თევზის ქონის BAD-ები'],
    category: 'supplement',
    claimedKa: ['გულის შეტევის პრევენცია', 'ქოლესტერინის კორექცია'],
    grade: 'no_benefit_shown',
    approval: { fda: false, ema: false, noteKa: 'რეცეპტით გაცემული იკოსაპენტ ეთილი განსხვავებული პრეპარატია და მას ცალკე ჩვენება აქვს.' },
    evidenceKa:
      'პირველადი პრევენციისთვის დიდმა რანდომიზებულმა კვლევებმა (მათ შორის VITAL და ASCEND) კარდიოვასკულური სარგებელი ვერ აჩვენა. ეს არ ეხება მაღალი დოზის რეცეპტულ იკოსაპენტ ეთილს მაღალი ტრიგლიცერიდების მქონე პაციენტებში — სადაც ცალკე მტკიცებულება არსებობს.',
    keyReference: null,
    harmsKa: ['ფუჭი ხარჯი', 'წინაგულების ფიბრილაციის რისკის შესაძლო ზრდა მაღალ დოზებზე'],
    insteadKa: ['სტატინი ჩვენების მიხედვით — დადასტურებული რისკის შემცირება', 'არტერიული წნევის კონტროლი, თამბაქოს შეწყვეტა'],
    tier: 'III_monitor',
    liveQuery: '"omega-3" AND cardiovascular AND prevention AND randomized',
    evidenceTerm: 'omega-3 fatty acids',
  },
  // ---------------- ანტიბიოტიკი ----------------
  {
    id: 'antibiotics-viral-uri',
    inn: 'Antibiotics for viral upper respiratory infection',
    nameKa: 'ანტიბიოტიკი ვირუსული ინფექციისას',
    brandsGe: ['ამოქსიცილინი', 'აზითრომიცინი', 'ცეფიქსიმი და სხვ.'],
    category: 'antibiotic_misuse',
    claimedKa: ['„გართულების პრევენცია“', 'ციება და ყელის ტკივილი', 'მწვავე ბრონქიტი'],
    grade: 'no_benefit_shown',
    approval: { fda: true, ema: true, noteKa: 'პრეპარატები დამტკიცებულია — არასწორია ჩვენება, არა წამალი.' },
    evidenceKa:
      'ვირუსულ ზედა სასუნთქი გზების ინფექციასა და გაურთულებელ მწვავე ბრონქიტში ანტიბიოტიკი არ ამცირებს სიმპტომების ხანგრძლივობას და არ ახდენს გართულების პრევენციას. ეს არის პოლიფარმაციისა და რეზისტენტობის ერთ-ერთი მთავარი წყარო ამბულატორიულ პრაქტიკაში.',
    keyReference: null,
    harmsKa: ['ანტიმიკრობული რეზისტენტობა', 'C. difficile კოლიტი', 'ალერგიული რეაქციები', 'მიკრობიომის დარღვევა'],
    insteadKa: ['სიმპტომური მკურნალობა და პაციენტის ინფორმირება ბუნებრივ მიმდინარეობაზე', 'Centor/McIsaac კრიტერიუმები სტრეპტოკოკური ფარინგიტის შესაფასებლად', 'წითელი დროშების მკაფიო ინსტრუქცია'],
    tier: 'I_stop_now',
    liveQuery: 'antibiotics AND (common cold OR acute bronchitis) AND randomized',
    evidenceTerm: 'common cold antibiotics',
  },
  // ---------------- საქართველოში გავრცელებული კომბინაციები (2026-10-19) ----------------
  {
    id: 'cerebrovin',
    inn: 'GABA + Ginkgo biloba + 5-HTP + B vitamins (combination)',
    nameKa: 'ცერებროვინი',
    brandsGe: ['Cerebrovin', 'ცერებროვინი'],
    category: 'nootropic',
    claimedKa: ['მეხსიერებისა და კონცენტრაციის გაუმჯობესება', '„თავის ტვინის სისხლის მიმოქცევის გაუმჯობესება“', 'შფოთვა და ძილი'],
    grade: 'no_international_assessment',
    approval: { fda: false, ema: false, noteKa: 'კომბინირებული პრეპარატი; აშშ-სა და ევროკავშირში წამლად რეგისტრირებული არ არის და საერთაშორისო რეგულატორის შეფასება არ აქვს.' },
    evidenceKa:
      'კომბინაციის ეფექტიანობის ხარისხიანი კლინიკური კვლევა ჩვენთვის ცნობილი არ არის. შემადგენელი ნივთიერებებიდან ყველაზე კარგად შესწავლილია გინკგო ბილობა: დიდმა რანდომიზებულმა კვლევამ (GEM, 3 000-ზე მეტი ხანდაზმული) აჩვენა, რომ ის დემენციის განვითარებას არ აფერხებს. პერორალური GABA-ს (გამა-ამინოერბოს მჟავა) თავის ტვინში მოხვედრა და მეხსიერებაზე ეფექტი დადასტურებული არ არის. B ვიტამინები სასარგებლოა მხოლოდ მათი დეფიციტისას, რაც ანალიზით დგინდება.',
    keyReference: {
      titleKa: 'Ginkgo biloba for Prevention of Dementia (GEM) — რანდომიზებული კვლევა',
      citation: 'DeKosky ST et al. JAMA. 2008;300(19):2253-2262',
      year: 2008,
      url: 'https://jamanetwork.com/journals/jama/fullarticle/182920',
    },
    harmsKa: ['გინკგო — სისხლდენის რისკის ზრდა ანტიკოაგულანტებთან ან ასპირინთან ერთად', '5-HTP — ანტიდეპრესანტებთან (SSRI/SNRI, მაგ. დულოქსეტინი) ერთად სეროტონინის სინდრომის რისკი', 'ფუჭი ხარჯი და რეალური მიზეზის დიაგნოსტიკის გადავადება'],
    insteadKa: ['მეხსიერების გაუარესებისას — ექიმის შეფასება: ფარისებრი ჯირკვალი, B12, დეპრესია, ძილი, წამლების გვერდითი ეფექტი', 'წნევის, შაქრის, ქოლესტერინის კონტროლი, ფიზიკური აქტივობა, სმენის კორექცია — დადასტურებული გზა', 'შფოთვა/უძილობა — კოგნიტურ-ქცევითი თერაპია და ძილის ჰიგიენა'],
    tier: 'I_stop_now',
    liveQuery: 'cerebrovin OR ("ginkgo biloba" AND dementia AND randomized)',
    evidenceTerm: 'Ginkgo biloba',
  },
  {
    id: 'novopassit',
    inn: 'Guaifenesin + herbal dry extract (incl. valerian, St John\'s wort)',
    nameKa: 'ნოვო-პასიტი',
    brandsGe: ['Novo-Passit', 'Novopassit', 'ნოვოპასიტი', 'ნოვო-პასიტი'],
    category: 'supplement',
    claimedKa: ['შფოთვა და ნერვიულობა', 'უძილობა', '„ნერვების დამშვიდება“'],
    grade: 'insufficient_evidence',
    approval: { fda: false, ema: false, noteKa: 'მცენარეული კომბინაცია; ზოგ ევროპულ ქვეყანაში (მაგ. ჩეხეთი) ეროვნულ დონეზეა რეგისტრირებული, ევროპის მედიკამენტების სააგენტოს (EMA) ცენტრალური შეფასება არ აქვს.' },
    evidenceKa:
      'კომბინაციის ხარისხიანი რანდომიზებული კვლევა ჩვენთვის ცნობილი არ არის. ყველაზე კარგად შესწავლილი კომპონენტი — ვალერიანა: Cochrane-ის მიმოხილვის მიხედვით, შფოთვაზე მისი ეფექტიანობისა და უსაფრთხოების შესახებ დასკვნის გასაკეთებლად მტკიცებულება არასაკმარისია.',
    keyReference: {
      titleKa: 'Valerian for anxiety disorders — Cochrane სისტემური მიმოხილვა',
      citation: 'Miyasaka LS, Atallah ÁN, Soares B. Cochrane Database Syst Rev. 2006;(4):CD004515',
      year: 2006,
      url: 'https://www.cochrane.org/evidence/CD004515_valerian-anxiety-disorders',
    },
    harmsKa: ['შეიცავს კრაზანას (St John\'s wort), რომელიც ცნობილია სხვა წამლების მოქმედების შესუსტებით: ორალური კონტრაცეპტივები, ვარფარინი, ციკლოსპორინი და სხვ.', 'ანტიდეპრესანტებთან (SSRI/SNRI) ერთად — სეროტონინის სინდრომის რისკი', 'ძილიანობა — სიფრთხილე მანქანის მართვისას'],
    insteadKa: ['შფოთვა — კოგნიტურ-ქცევითი თერაპია; საჭიროებისას მკურნალობა ექიმის დანიშნულებით', 'უძილობა — უძილობის კოგნიტურ-ქცევითი თერაპია (CBT-I) და ძილის ჰიგიენა'],
    tier: 'I_stop_now',
    liveQuery: 'valerian AND (anxiety OR insomnia) AND randomized',
    evidenceTerm: 'Valerian',
  },
  {
    id: 'corvalol',
    inn: 'Phenobarbital + ethyl bromisovalerate (+ peppermint oil)',
    nameKa: 'კორვალოლი / ვალოკორდინი',
    brandsGe: ['Corvalol', 'Valocordin', 'Corvaldin', 'კორვალოლი', 'ვალოკორდინი', 'კორვალდინი'],
    category: 'other',
    claimedKa: ['„გულის ტკივილი“, გულის ფრიალი', 'შფოთვა, ნერვიულობა', 'უძილობა'],
    grade: 'harm_signal',
    approval: { fda: false, ema: false, noteKa: 'შეიცავს ფენობარბიტალს (ბარბიტურატი) და ბრომის ნაერთს. გულის ტკივილის, რითმის დარღვევის ან შფოთვის სამკურნალოდ თანამედროვე გაიდლაინები ამ კომბინაციას არ იყენებს.' },
    evidenceKa:
      'ამ ჩვენებებით (გულის ტკივილი, ფრიალი, შფოთვა) კომბინაციის ეფექტიანობის კლინიკური კვლევები ჩვენთვის ცნობილი არ არის. ზიანი კი აღწერილია: ფენობარბიტალი იწვევს დამოკიდებულებას, ბრომი ხანგრძლივი მიღებისას გროვდება ორგანიზმში. ყველაზე სახიფათო ის არის, რომ გულმკერდის ტკივილისას წვეთების დალევა ინფარქტის დროულ დიაგნოზს აყოვნებს.',
    keyReference: null,
    harmsKa: ['დამოკიდებულება და მოხსნის სინდრომი (ფენობარბიტალი)', 'ბრომის დაგროვება — ძილიანობა, დაბნეულობა, მოძრაობის დარღვევა', 'ხანდაზმულებში დაცემის რისკი', 'ალკოჰოლთან და სხვა დამამშვიდებლებთან ერთად — სუნთქვის დათრგუნვა', 'გულმკერდის ტკივილისას 112-ზე დარეკვის გადავადება'],
    insteadKa: ['გულმკერდის ტკივილი — 112 და ექიმის შეფასება, არა წვეთები', 'გულის ფრიალი — ეკგ და მიზეზის დადგენა', 'შფოთვა/უძილობა — კოგნიტურ-ქცევითი თერაპია, ძილის ჰიგიენა'],
    tier: 'II_taper',
    liveQuery: 'corvalol OR valocordin OR (phenobarbital AND bromisoval)',
    evidenceTerm: 'Phenobarbital',
  },
  {
    id: 'pentoxifylline-cerebral',
    inn: 'Pentoxifylline',
    nameKa: 'პენტოქსიფილინი (ტრენტალი)',
    brandsGe: ['Trental', 'ტრენტალი', 'Pentoxifylline', 'პენტოქსიფილინი', 'ვაზონიტი', 'Vasonit'],
    category: 'cerebrovascular',
    claimedKa: ['„თავის ტვინის სისხლის მიმოქცევის გაუმჯობესება“', 'თავბრუსხვევა, ყურის შუილი', 'ინსულტის შემდეგ აღდგენა'],
    grade: 'limited_benefit',
    approval: { fda: false, ema: false, noteKa: 'აშშ-ში დამტკიცებულია მხოლოდ წყვეტილი კოჭლობისთვის (ფეხის არტერიების დაავადება). თავის ტვინის სისხლის მიმოქცევის, თავბრუსხვევის ან ყურის შუილის ჩვენებით — არა.' },
    evidenceKa:
      'Cochrane-ის 2020 წლის მიმოხილვის მიხედვით, წყვეტილი კოჭლობის დროსაც კი მაღალი სანდოობის მტკიცებულება არ არსებობს — ეფექტი მცირე და გაურკვეველია. თავის ტვინის სისხლის მიმოქცევის, დემენციის, თავბრუსხვევის ან ყურის შუილის სამკურნალოდ სარგებელი დადასტურებული არ არის.',
    keyReference: {
      titleKa: 'Pentoxifylline for intermittent claudication — Cochrane სისტემური მიმოხილვა',
      citation: 'Cochrane Database Syst Rev. 2020;(10):CD005262',
      year: 2020,
      url: 'https://www.cochrane.org/evidence/CD005262_how-well-does-pentoxifylline-treat-intermittent-claudication',
    },
    harmsKa: ['გულისრევა, თავბრუსხვევა, გულის ფრიალი', 'სისხლდენის რისკი ანტიკოაგულანტებთან ერთად'],
    insteadKa: ['ინსულტის პრევენცია — წნევის კონტროლი, ანტიაგრეგანტი ან ანტიკოაგულანტი ჩვენებით, სტატინი', 'წყვეტილი კოჭლობა — ზედამხედველობითი სიარულის პროგრამა, თამბაქოზე უარი, სტატინი'],
    tier: 'III_monitor',
    liveQuery: 'pentoxifylline AND (cerebrovascular OR dementia OR claudication) AND randomized',
    evidenceTerm: 'Pentoxifylline',
  },
];

export const LOW_VALUE_BY_ID = new Map(LOW_VALUE_MEDS.map((e) => [e.id, e]));

/** Normalises for matching: lowercase, strip punctuation, Latin+Georgian. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const SEARCH_INDEX = LOW_VALUE_MEDS.map((entry) => ({
  entry,
  terms: [entry.inn, entry.nameKa, ...entry.brandsGe].map(norm).filter((t) => t.length >= 4),
}));

/**
 * Georgian declines nouns, so a drug appears as ცერებროლიზინი, ცერებროლიზინს,
 * ცერებროლიზინით, ცერებროლიზინზე … Matching on the citation form alone missed
 * every mention inside a real sentence, which is how clinicians actually write.
 * Each token is reduced to a stem before comparison.
 */
const KA_ENDINGS = ['ისთვის', 'ებისა', 'ებზე', 'ებში', 'ებით', 'ებს', 'ების', 'ებმა', 'ებიც', 'ისა', 'ით', 'ზე', 'ში', 'თან', 'დან', 'ად', 'მა', 'ის', 'ებ', 'ს', 'ი'];

function stem(token: string): string {
  let t = token;
  for (const suffix of KA_ENDINGS) {
    if (t.length > suffix.length + 3 && t.endsWith(suffix)) {
      t = t.slice(0, -suffix.length);
      break;
    }
  }
  return t;
}

/** Latin brand names also carry Georgian endings: "Teraflex-ს", "Essentiale-ით". */
function tokenize(text: string): string[] {
  return norm(text)
    .split(' ')
    .filter(Boolean)
    .flatMap((tok) => {
      const stemmed = stem(tok);
      return stemmed === tok ? [tok] : [tok, stemmed];
    });
}

/**
 * Finds low-value entries named anywhere in a free-text medication list or in
 * ordinary prose. A term matches when one of its stems equals a token stem, so
 * a short fragment never matches an unrelated drug.
 */
export function screenMedicationList(text: string): { entry: LowValueEntry; matched: string }[] {
  const tokens = new Set(tokenize(text));
  const out: { entry: LowValueEntry; matched: string }[] = [];

  for (const { entry, terms } of SEARCH_INDEX) {
    let hit: string | undefined;
    for (const term of terms) {
      // Multi-word terms (e.g. "essential phospholipids") match as a phrase.
      if (term.includes(' ')) {
        if (` ${norm(text)} `.includes(` ${term} `)) { hit = term; break; }
        continue;
      }
      const termStem = stem(term);
      if (tokens.has(term) || tokens.has(termStem)) { hit = term; break; }
    }
    if (hit) out.push({ entry, matched: hit });
  }

  const order: Record<DeprescribeTier, number> = { I_stop_now: 0, II_taper: 1, III_monitor: 2, IV_keep: 3 };
  return out.sort((a, b) => order[a.entry.tier] - order[b.entry.tier]);
}

/** Tapering schedules from the author's polypharmacy programme (Table 1). */
export type TaperSchedule = {
  groupKa: string;
  startKa: string;
  rateKa: string;
  durationKa: string;
  noteKa: string;
  matchTerms: string[];
};

export const TAPER_SCHEDULES: TaperSchedule[] = [
  {
    groupKa: 'SSRI / SNRI',
    startKa: 'სრული დოზა',
    rateKa: '–25% ყოველ 2 კვირაში',
    durationKa: '4–8 კვირა',
    noteKa: 'ზედამხედველობა withdrawal სიმპტომებზე',
    matchTerms: ['sertralin', 'სერტრალინ', 'fluoxetin', 'ფლუოქსეტინ', 'paroxetin', 'პაროქსეტინ', 'escitalopram', 'ესციტალოპრამ', 'venlafaxin', 'ვენლაფაქსინ', 'duloxetin', 'დულოქსეტინ'],
  },
  {
    groupKa: 'ბენზოდიაზეპინები',
    startKa: 'სრული დოზა',
    rateKa: '–10–20% ყოველ 1–2 კვირაში',
    durationKa: '8–12 კვირა',
    noteKa: 'ალტერნატივა: CBT, მელატონინი',
    matchTerms: ['diazepam', 'დიაზეპამ', 'alprazolam', 'ალპრაზოლამ', 'clonazepam', 'კლონაზეპამ', 'lorazepam', 'ლორაზეპამ', 'bromazepam', 'ბრომაზეპამ'],
  },
  {
    groupKa: 'პროტონული ტუმბოს ინჰიბიტორები (PPI)',
    startKa: 'სრული დოზა',
    rateKa: '–50% ყოველ 2 კვირაში',
    durationKa: '4 კვირა',
    noteKa: 'შემდეგ „as needed“ რეჟიმზე',
    matchTerms: ['omeprazol', 'ომეპრაზოლ', 'pantoprazol', 'პანტოპრაზოლ', 'esomeprazol', 'ეზომეპრაზოლ', 'lansoprazol', 'ლანსოპრაზოლ'],
  },
  {
    groupKa: 'NSAID',
    startKa: 'ყოველდღიური მიღება',
    rateKa: 'დოზის შემცირება ½ ტაბლეტამდე',
    durationKa: '2–3 კვირა',
    noteKa: 'არაერთდროულად ორი NSAID',
    matchTerms: ['ibuprofen', 'იბუპროფენ', 'diclofenac', 'დიკლოფენაკ', 'naproxen', 'ნაპროქსენ', 'meloxicam', 'მელოქსიკამ', 'ketoprofen', 'კეტოპროფენ', 'nimesulid', 'ნიმესულიდ'],
  },
  {
    groupKa: 'ანტიფსიქოტიკები',
    startKa: 'სრული დოზა',
    rateKa: '–10% ყოველ 2 კვირაში',
    durationKa: '6–12 კვირა',
    noteKa: 'ექიმის კონტროლი აუცილებელია',
    matchTerms: ['quetiapin', 'კვეტიაპინ', 'risperidon', 'რისპერიდონ', 'olanzapin', 'ოლანზაპინ', 'haloperidol', 'ჰალოპერიდოლ'],
  },
];

export function taperFor(text: string): TaperSchedule[] {
  const h = norm(text);
  return TAPER_SCHEDULES.filter((s) => s.matchTerms.some((t) => h.includes(norm(t))));
}

export const LOW_VALUE_STATS = {
  entries: LOW_VALUE_MEDS.length,
  categories: new Set(LOW_VALUE_MEDS.map((e) => e.category)).size,
  withNamedReference: LOW_VALUE_MEDS.filter((e) => e.keyReference).length,
  notApprovedFdaEma: LOW_VALUE_MEDS.filter((e) => !e.approval.fda && !e.approval.ema).length,
  taperSchedules: TAPER_SCHEDULES.length,
};
