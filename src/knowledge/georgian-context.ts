/**
 * GEORGIAN MEDICAL LAYER (Blueprint §15)
 * Not a translation layer — a local clinical intelligence layer.
 * Global evidence and Georgian context are never merged in the UI.
 */

export type GeorgianTerm = {
  preferred_ka: string;
  english: string;
  synonyms_ka: string[];
  deprecated_ka: string[];
  abbreviation: string;
  specialty: string;
  icd10?: string;
  atc?: string;
  loinc?: string;
  definition_ka: string;
  version: string;
  status: 'approved' | 'draft' | 'under_review';
};

export const GEORGIAN_TERMS: GeorgianTerm[] = [
  {
    preferred_ka: 'წინაგულების ფიბრილაცია',
    english: 'Atrial fibrillation',
    synonyms_ka: ['წინაგულთა ფიბრილაცია', 'ფიბრილაცია წინაგულებისა'],
    deprecated_ka: ['მოციმციმე არითმია'],
    abbreviation: 'AF / წფ',
    specialty: 'კარდიოლოგია',
    icd10: 'I48',
    definition_ka: 'სუპრავენტრიკულური ტაქიარითმია წინაგულების არაკოორდინირებული ელექტრული აქტივაციით და არაეფექტური წინაგულოვანი შეკუმშვით.',
    version: '1.0',
    status: 'approved',
  },
  {
    preferred_ka: 'გარდამავალი იშემიური შეტევა',
    english: 'Transient ischaemic attack',
    synonyms_ka: ['ტრანზიტორული იშემიური შეტევა'],
    deprecated_ka: ['მიკროინსულტი'],
    abbreviation: 'TIA',
    specialty: 'ნევროლოგია',
    icd10: 'G45',
    definition_ka: 'ფოკალური ნევროლოგიური დეფიციტის გარდამავალი ეპიზოდი იშემიის გამო, ქსოვილოვანი ინფარქტის გარეშე.',
    version: '1.0',
    status: 'approved',
  },
  {
    preferred_ka: 'იშემიური ინსულტი',
    english: 'Ischaemic stroke',
    synonyms_ka: ['თავის ტვინის ინფარქტი'],
    deprecated_ka: ['ინსულტი დაზუსტების გარეშე'],
    abbreviation: 'AIS',
    specialty: 'ნევროლოგია',
    icd10: 'I63',
    definition_ka: 'თავის ტვინის ქსოვილის ინფარქტი არტერიული სისხლმომარაგების მწვავე დარღვევის შედეგად.',
    version: '1.0',
    status: 'approved',
  },
  {
    preferred_ka: 'პოლიფარმაცია',
    english: 'Polypharmacy',
    synonyms_ka: ['მრავალწამლიანი თერაპია'],
    deprecated_ka: [],
    abbreviation: '—',
    specialty: 'გერიატრია / კლინიკური ფარმაკოლოგია',
    definition_ka: 'ხუთი ან მეტი მედიკამენტის ერთდროული მიღება; კლინიკურად მნიშვნელოვანია არა რაოდენობა, არამედ თითოეული დანიშნულების გამართლებულობა.',
    version: '1.0',
    status: 'approved',
  },
  {
    preferred_ka: 'დანიშნულების შეწყვეტა / დეპრესკრაიბინგი',
    english: 'Deprescribing',
    synonyms_ka: ['მედიკამენტის დასაბუთებული მოხსნა'],
    deprecated_ka: [],
    abbreviation: '—',
    specialty: 'კლინიკური ფარმაკოლოგია',
    definition_ka: 'დაგეგმილი, ზედამხედველობითი პროცესი პოტენციურად არაადეკვატური მედიკამენტის დოზის შემცირების ან შეწყვეტისთვის.',
    version: '1.0',
    status: 'approved',
  },
  {
    preferred_ka: 'ინფორმირებული თანხმობა',
    english: 'Informed consent',
    synonyms_ka: ['ინფორმირებული ნებართვა'],
    deprecated_ka: ['თანხმობის ფორმა'],
    abbreviation: 'IC',
    specialty: 'სამედიცინო სამართალი / ხარისხი',
    definition_ka: 'პაციენტის ნებაყოფლობითი გადაწყვეტილება ჩარევაზე, მიღებული ალტერნატივების, რისკებისა და შედეგების გასაგები ახსნის შემდეგ.',
    version: '1.0',
    status: 'approved',
  },
  {
    preferred_ka: 'სამედიცინო დახმარების დეფექტი',
    english: 'Defect of medical care',
    synonyms_ka: ['დახმარების ხარვეზი'],
    deprecated_ka: ['სამედიცინო შეცდომა'],
    abbreviation: '—',
    specialty: 'ხარისხი და უსაფრთხოება',
    definition_ka: 'გადახვევა მოცემული დროისთვის მოქმედი პროფესიული სტანდარტიდან, რომელიც დადგენილია დოკუმენტირებული ფაქტების საფუძველზე; დეფექტის კონსტატაცია არ არის ბრალეულობის დადგენა.',
    version: '1.0',
    status: 'approved',
  },
  {
    preferred_ka: 'ოვარიული ჰიპერსტიმულაციის სინდრომი',
    english: 'Ovarian hyperstimulation syndrome',
    synonyms_ka: ['საკვერცხეების ჰიპერსტიმულაციის სინდრომი'],
    deprecated_ka: [],
    abbreviation: 'OHSS',
    specialty: 'რეპროდუქციული მედიცინა',
    definition_ka: 'ოვარიული სტიმულაციის იატროგენული გართულება სისხლძარღვთა გამტარებლობის მომატებით, ასციტით და ჰემოკონცენტრაციით.',
    version: '1.0',
    status: 'approved',
  },
];

export type GeorgianContextNote = {
  id: string;
  topic: string;
  keywords: string[];
  note: string;
  category: 'documentation' | 'availability' | 'legal' | 'practice' | 'quality';
  confidence: 'high' | 'moderate' | 'verify_locally';
};

export const GEORGIAN_CONTEXT_NOTES: GeorgianContextNote[] = [
  {
    id: 'GEO-DOC-001',
    topic: 'ფორმა N IV-100/ა',
    keywords: ['ფორმა 100', 'form 100', 'ცნობა', 'დოკუმენტაცია', 'referral', 'მიმართვა'],
    note: 'ჯანმრთელობის მდგომარეობის შესახებ ცნობა (ფორმა N IV-100/ა) რჩება საქართველოში ძირითად გადამისამართების და დამადასტურებელ დოკუმენტად. მინიმალური სრულყოფილება: პაციენტის იდენტიფიკაცია, ანამნეზი, ობიექტური სტატუსი, კვლევები, დიაგნოზი ICD-10 კოდით, ჩატარებული მკურნალობა, რეკომენდაციები, ექიმის ხელმოწერა და დაწესებულების რეკვიზიტები. არასრული ფორმა 100 ხარისხის აუდიტში ტიპური დოკუმენტაციური დეფექტია.',
    category: 'documentation',
    confidence: 'high',
  },
  {
    id: 'GEO-LEG-001',
    topic: 'ინფორმირებული თანხმობა',
    keywords: ['თანხმობა', 'consent', 'უფლებები', 'პაციენტის უფლებები'],
    note: 'პაციენტის უფლებების შესახებ კანონმდებლობა მოითხოვს ჩარევამდე ინფორმირებულ თანხმობას გასაგებ ენაზე, ალტერნატივებისა და რისკების ახსნით. ხარისხის აუდიტისთვის მნიშვნელოვანია არა მხოლოდ ხელმოწერილი ფორმის არსებობა, არამედ ის, არის თუ არა დოკუმენტირებული კონკრეტული ჩარევის შესახებ განმარტების ფაქტი.',
    category: 'legal',
    confidence: 'high',
  },
  {
    id: 'GEO-LEG-002',
    topic: 'ჯანმრთელობის მონაცემთა დაცვა',
    keywords: ['პერსონალური მონაცემები', 'კონფიდენციალობა', 'privacy', 'data'],
    note: 'ჯანმრთელობის შესახებ მონაცემი განსაკუთრებული კატეგორიის მონაცემია. AI სისტემაში პაციენტის პირდაპირი იდენტიფიკატორების შეყვანა მინიმუმამდე უნდა იყოს დაყვანილი; ამ პლატფორმაზე ქეისი ნაგულისხმევად სესიაშია და სერვერზე არ ინახება.',
    category: 'legal',
    confidence: 'high',
  },
  {
    id: 'GEO-AVL-001',
    topic: 'მედიკამენტების ხელმისაწვდომობა',
    keywords: ['წამალი', 'ბრენდი', 'ხელმისაწვდომობა', 'drug', 'availability'],
    note: 'საქართველოს ბაზარზე ერთი და იგივე გენერიკი ხშირად ხელმისაწვდომია რამდენიმე ბრენდული სახელით და განსხვავებული ფასით. დანიშნულებაში სასურველია გენერიკული დასახელება, ბრენდი — საორიენტაციოდ. კონკრეტული ფასი და ანაზღაურების სქემა ყოველთვის მიმდინარე წყაროთი უნდა დადასტურდეს.',
    category: 'availability',
    confidence: 'moderate',
  },
  {
    id: 'GEO-PRC-001',
    topic: 'დიაგნოსტიკური რესურსის ხელმისაწვდომობა',
    keywords: ['MRI', 'CT', 'კვლევა', 'რესურსი', 'რეგიონი'],
    note: 'გადაუდებელი ნეიროვიზუალიზაციისა და ინტერვენციული სერვისების ხელმისაწვდომობა თბილისსა და რეგიონებს შორის მნიშვნელოვნად განსხვავდება. კლინიკური რეკომენდაცია რეალისტური უნდა იყოს კონკრეტული დაწესებულების რესურსისთვის და დოკუმენტში უნდა აისახოს გადამისამართების გადაწყვეტილება და მისი დრო.',
    category: 'practice',
    confidence: 'moderate',
  },
  {
    id: 'GEO-QUA-001',
    topic: 'ხშირი დოკუმენტაციური დეფექტები',
    keywords: ['ხარისხი', 'დეფექტი', 'აუდიტი', 'quality'],
    note: 'ადგილობრივ ხარისხის მიმოხილვებში განმეორებადი ხარვეზებია: დინამიკური ჩანაწერის არარსებობა, დიაგნოზის დასაბუთების არარსებობა, დანიშნულების ცვლილების მიზეზის ჩაუწერლობა, ინფორმირებული თანხმობის ფორმალური ხასიათი, გადამისამართების დროის ჩაუწერლობა და გამოკვლევის შედეგზე რეაგირების არარსებობა.',
    category: 'quality',
    confidence: 'moderate',
  },
  {
    id: 'GEO-PRC-002',
    topic: 'რეპროდუქციული მედიცინა',
    keywords: ['IVF', 'სუროგაცია', 'ორსულობა', 'დონაცია', 'reproductive'],
    note: 'საქართველო რჩება საერთაშორისო პაციენტებისთვის მიმზიდველ იურისდიქციად დამხმარე რეპროდუქციულ ტექნოლოგიებში. კლინიკური დოკუმენტაცია ამ სფეროში ერთდროულად სამედიცინო და სამართლებრივი მტკიცებულებაა: პროტოკოლი, თანხმობები, დონორის/მიმღების იდენტიფიკაცია და ემბრიოლოგიური ჩანაწერი უნდა იყოს ურთიერთშესაბამისი.',
    category: 'practice',
    confidence: 'moderate',
  },
];

export function georgianContextFor(text: string): GeorgianContextNote[] {
  const t = text.toLowerCase();
  // Only notes whose keywords occur in the request. There is no default note:
  // a fallback put the patient-rights law under unrelated answers (audit F04).
  return GEORGIAN_CONTEXT_NOTES.filter((n) => n.keywords.some((k) => t.includes(k.toLowerCase())));
}

export function termLookup(q: string): GeorgianTerm[] {
  const n = q.toLowerCase().trim();
  if (!n) return GEORGIAN_TERMS;
  return GEORGIAN_TERMS.filter(
    (t) =>
      t.preferred_ka.toLowerCase().includes(n) ||
      t.english.toLowerCase().includes(n) ||
      t.abbreviation.toLowerCase().includes(n) ||
      t.synonyms_ka.some((s) => s.toLowerCase().includes(n)) ||
      t.deprecated_ka.some((s) => s.toLowerCase().includes(n)),
  );
}
