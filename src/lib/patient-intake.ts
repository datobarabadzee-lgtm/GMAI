import { CONDITION_CARDS, livesWith, type ConditionCard } from '@/knowledge/condition-cards';
import { BRAND_TO_INN } from '@/knowledge/brand-names';

/** A brand typed on its own („რექსეტინი") is a drug question too. */
function namesBrand(text: string): string | null {
  for (const w of text.toLowerCase().split(/[\s,.;:()/!?«»„“"]+/)) {
    for (const form of [w, w.replace(/(ისა|ის|ით|ზე|ში)$/, ''), w.replace(/(ისა|ის|ით|ზე|ში)$/, 'ი')]) {
      if (form.length >= 4 && BRAND_TO_INN.has(form)) return BRAND_TO_INN.get(form)!;
    }
  }
  return null;
}

/** Age stated in the text, so it is not asked again. */
const STATED_AGE = /\d{1,3}\s*(?:წლის|თვის|წლამდე)/;

/**
 * PATIENT INTAKE — the questions a good clinician asks before answering.
 *
 * A patient types a few words. Instead of asking them to fill forms, the app
 * reads what they wrote and asks back only what changes the answer: is the
 * condition already diagnosed, when did the symptom start, is a danger sign
 * present now, what is the lab value. Each question is one tap; every
 * question can be skipped.
 *
 * Runs in the browser — nothing leaves the device until the person presses
 * "get the answer". Deterministic: the same words always produce the same
 * questions.
 */

export type SymptomGroup = 'neuro' | 'vision' | 'cardio' | 'resp' | 'gi' | 'pain_head' | 'pain_back' | 'fever' | 'bleeding' | 'urinary' | 'mood';

const SYMPTOMS: { group: SymptomGroup; re: RegExp; labelKa: string }[] = [
  { group: 'vision', re: /გაორებ|ორად\s*ვხედავ|დიპლოპ|მხედველობ|ბინდ|თვალ\S*\s+(ტკივ|დაბინდ)/i, labelKa: 'მხედველობის დარღვევა' },
  { group: 'neuro', re: /სისუსტ|დაბუჟ|ჩხვლეტ|წონასწორ|თავბრუ|მეტყველებ|კანკალ|კრუნჩხვ|გული წამივიდა|გონება დავკარგე|სიარულ/i, labelKa: 'ნევროლოგიური სიმპტომი' },
  { group: 'pain_head', re: /თავის\s+ტკივ|თავი\s+მტკივ/i, labelKa: 'თავის ტკივილი' },
  { group: 'cardio', re: /გულმკერდ|გულის\s+(ფრიალ|ტკივ)|გული\s+(მიფრიალებს|მტკივა)|გულისცემ|შეშუპებ/i, labelKa: 'გულთან დაკავშირებული სიმპტომი' },
  { group: 'resp', re: /ქოშინ|სუნთქვ|ხველ|ხიხინ/i, labelKa: 'სუნთქვასთან დაკავშირებული სიმპტომი' },
  { group: 'gi', re: /მუცლის\s+ტკივ|მუცელი\s+მტკივ|ღებინ|დიარე|ფაღარათ|გულისრევ|ყაბზ/i, labelKa: 'მუცლის სიმპტომი' },
  { group: 'pain_back', re: /წელის\s+ტკივ|ზურგ\S*\s+ტკივ|წელი\s+მტკივ|ისიას/i, labelKa: 'წელის ან ზურგის ტკივილი' },
  { group: 'fever', re: /ცხელებ|სიცხე|ტემპერატურ/i, labelKa: 'ცხელება' },
  { group: 'bleeding', re: /სისხლდენ|სისხლიან|შავი\s+განავ/i, labelKa: 'სისხლდენა' },
  { group: 'urinary', re: /შარდვ|შარდის\s+(შეკავ|ბუშტ)/i, labelKa: 'შარდვის დარღვევა' },
  { group: 'mood', re: /დეპრესი|შფოთვ|უძილობ|პანიკ/i, labelKa: 'განწყობა ან ძილი' },
];

const LAB_TOPIC = /ანალიზ|კვლევ\S*\s+(პასუხ|შედეგ)|შედეგ\S*\s+(ანალიზ|სისხლ)|ჰემოგლობინ|ქოლესტერინ|შაქარ|tsh|hba1c|კრეატინინ|ფერიტინ/i;
const DRUG_TOPIC = /წამალ|წამლ|მედიკამენტ|ტაბლეტ|ვიღებ|დამინიშნეს|პრეპარატ/i;

export type QuestionOption = { value: string; labelKa: string; danger?: boolean };
export type IntakeQuestion = {
  id: 'diagnosed' | 'onset' | 'redflags' | 'age' | 'labvalues' | 'taking' | 'topic' | 'detail';
  textKa: string;
  options?: QuestionOption[];
  multi?: boolean;
  /** Free text, optional unless `required`. */
  freeText?: { placeholderKa: string; required?: boolean };
};

export type IntakeAnalysis = {
  cards: ConditionCard[];
  symptoms: { group: SymptomGroup; labelKa: string }[];
  labTopic: boolean;
  hasNumbers: boolean;
  drugTopic: boolean;
  /** A drug was named, so "which drugs?" is not asked. */
  drugNamed: boolean;
  ageStated: boolean;
  diagnosedKnown: boolean | null;
};

export function analyzeIntake(text: string): IntakeAnalysis {
  const cards = CONDITION_CARDS.filter((c) => c.re.test(text)).slice(0, 2);
  const symptoms = SYMPTOMS.filter((s) => s.re.test(text)).map(({ group, labelKa }) => ({ group, labelKa }));
  const diagnosedKnown = cards.length ? livesWith(text, cards[0]) : null;
  return {
    cards,
    symptoms,
    labTopic: LAB_TOPIC.test(text),
    hasNumbers: /\d/.test(text),
    drugTopic: DRUG_TOPIC.test(text) || namesBrand(text) !== null,
    drugNamed: namesBrand(text) !== null,
    ageStated: STATED_AGE.test(text),
    diagnosedKnown,
  };
}

const RED_FLAGS: Record<SymptomGroup, QuestionOption[]> = {
  neuro: [
    { value: 'stroke', labelKa: 'სახის ჩამოწევა ან მეტყველების დარღვევა', danger: true },
    { value: 'one_side', labelKa: 'სისუსტე ან დაბუჟება სხეულის ერთ მხარეს, უეცრად', danger: true },
  ],
  vision: [{ value: 'vision_loss', labelKa: 'მხედველობის უეცარი დაკარგვა', danger: true }],
  pain_head: [{ value: 'thunderclap', labelKa: 'ცხოვრებაში ყველაზე ძლიერი, უეცარი თავის ტკივილი', danger: true }],
  cardio: [
    { value: 'chest_pain', labelKa: 'გულმკერდის ძლიერი ან მაწვავე ტკივილი', danger: true },
    { value: 'syncope', labelKa: 'გული წამივიდა / გონება დავკარგე', danger: true },
  ],
  resp: [{ value: 'breathless', labelKa: 'სუნთქვის ძლიერი გაძნელება, საუბარი მიჭირს', danger: true }],
  gi: [{ value: 'gi_bleed', labelKa: 'სისხლი ღებინებაში ან შავი განავალი', danger: true }],
  pain_back: [{ value: 'cauda', labelKa: 'შარდის ან განავლის შეკავება ვერ ხერხდება / შორისი დამიბუჟდა', danger: true }],
  fever: [{ value: 'confusion', labelKa: 'ცხელება დაბნეულობით ან ძლიერი სისუსტით', danger: true }],
  bleeding: [{ value: 'heavy_bleed', labelKa: 'სისხლდენა არ ჩერდება', danger: true }],
  urinary: [{ value: 'retention', labelKa: 'შარდვა საერთოდ ვერ ხერხდება', danger: true }],
  mood: [{ value: 'self_harm', labelKa: 'მიჩნდება საკუთარი თავისთვის ზიანის მიყენების აზრები', danger: true }],
};

/** At most four questions, most consequential first. */
export function intakeQuestions(text: string, a: IntakeAnalysis = analyzeIntake(text)): IntakeQuestion[] {
  const qs: IntakeQuestion[] = [];

  if (a.symptoms.length) {
    const flags = a.symptoms.flatMap((s) => RED_FLAGS[s.group]);
    const unique = flags.filter((f, i) => flags.findIndex((g) => g.value === f.value) === i);
    qs.push({
      id: 'redflags',
      textKa: 'ახლა გაქვთ რომელიმე ამათგანი?',
      multi: true,
      options: [...unique, { value: 'none', labelKa: 'არცერთი' }],
    });
    qs.push({
      id: 'onset',
      textKa: 'როდის დაიწყო?',
      options: [
        { value: 'minutes', labelKa: 'უეცრად, ბოლო საათებში' },
        { value: 'days', labelKa: 'ბოლო დღეებში' },
        { value: 'weeks', labelKa: 'კვირებია ან უფრო დიდხანს' },
        { value: 'recurring', labelKa: 'პერიოდულად მეორდება' },
      ],
    });
  }

  if (a.cards.length && a.diagnosedKnown === null) {
    qs.push({
      id: 'diagnosed',
      textKa: `„${a.cards[0].nameKa}“ ექიმს უკვე დადგენილი აქვს?`,
      options: [
        { value: 'yes', labelKa: 'დიახ, დადგენილია' },
        { value: 'suspected', labelKa: 'ეჭვია, ჯერ იკვლევენ' },
        { value: 'no', labelKa: 'არა, უბრალოდ მაინტერესებს' },
      ],
    });
  }

  if (a.labTopic && !a.hasNumbers) {
    qs.push({
      id: 'labvalues',
      textKa: 'ჩაწერეთ ანალიზის დასახელება და შედეგი — ისე, როგორც ფურცელზე წერია',
      freeText: { placeholderKa: 'მაგ.: ჰემოგლობინი 9.8, ფერიტინი 8', required: true },
    });
  }

  if (a.drugTopic && !a.drugNamed && !a.cards.length && !a.symptoms.length) {
    qs.push({
      id: 'detail',
      textKa: 'რომელ წამლებს იღებთ? (დასახელება, თუ იცით — დოზაც)',
      freeText: { placeholderKa: 'მაგ.: ვარფარინი, ომეპრაზოლი, ცერებროლიზინი' },
    });
  }

  if ((a.symptoms.length || a.drugTopic) && !a.ageStated && qs.length < 4) {
    qs.push({
      id: 'age',
      textKa: a.drugTopic ? 'ვისთვისაა წამალი — ასაკი' : 'ასაკი',
      // Children in bands: a drug can be forbidden under 1, 2, 6, 8, 12 or 18.
      options: [
        { value: 'u1', labelKa: '1 წლამდე' },
        { value: '1-5', labelKa: '1–5 წ.' },
        { value: '6-11', labelKa: '6–11 წ.' },
        { value: '12-17', labelKa: '12–17 წ.' },
        { value: '18-40', labelKa: '18–40' },
        { value: '41-65', labelKa: '41–65' },
        { value: '65+', labelKa: '65-ზე მეტი' },
      ],
    });
  }

  // Nothing recognised: ask what the person needs, in one tap.
  if (!qs.length && !a.cards.length) {
    qs.push({
      id: 'topic',
      textKa: 'რაში დაგეხმაროთ?',
      options: [
        { value: 'symptom', labelKa: 'სიმპტომი მაწუხებს' },
        { value: 'diagnosis', labelKa: 'დიაგნოზი მინდა გავიგო' },
        { value: 'drug', labelKa: 'წამალზე მაქვს კითხვა' },
        { value: 'lab', labelKa: 'ანალიზის პასუხი მინდა გავიგო' },
      ],
      freeText: { placeholderKa: 'ან დაწერეთ დაწვრილებით — მაგ.: 3 დღეა თავი მტკივა და მაღლა ცხელება მაქვს' },
    });
  }

  return qs.slice(0, 4);
}

export type IntakeAnswers = Partial<Record<IntakeQuestion['id'], string | string[]>>;

/** True when an answer is itself a reason to call 112 now. */
export function intakeEmergency(answers: IntakeAnswers): boolean {
  const rf = answers.redflags;
  const list = Array.isArray(rf) ? rf : rf ? [rf] : [];
  return list.some((v) => v && v !== 'none');
}

const ONSET_KA: Record<string, string> = { minutes: 'დაიწყო უეცრად, ბოლო საათებში', days: 'დაიწყო ბოლო დღეებში', weeks: 'გრძელდება კვირებია ან მეტი', recurring: 'პერიოდულად მეორდება' };
const DIAG_KA: Record<string, string> = { yes: 'დიაგნოზი ექიმის მიერ დადგენილია', suspected: 'დიაგნოზი საეჭვოა, იკვლევენ', no: 'დიაგნოზი არ აქვს, აინტერესებს' };
const AGE_KA: Record<string, string> = { child: 'ასაკი 18-მდე', u1: 'ასაკი 1 წლამდე (ჩვილი)', '1-5': 'ასაკი 1–5 წელი', '6-11': 'ასაკი 6–11 წელი', '12-17': 'ასაკი 12–17 წელი', '18-40': 'ასაკი 18–40', '41-65': 'ასაკი 41–65', '65+': 'ასაკი 65-ზე მეტი' };

/** A plain-language line the answer engine and the model both read. */
export function intakeSummaryKa(answers: IntakeAnswers, questions: IntakeQuestion[]): string {
  const parts: string[] = [];
  const opt = (id: IntakeQuestion['id'], v: string) => questions.find((q) => q.id === id)?.options?.find((o) => o.value === v)?.labelKa ?? v;
  if (typeof answers.diagnosed === 'string') parts.push(DIAG_KA[answers.diagnosed] ?? answers.diagnosed);
  if (typeof answers.onset === 'string') parts.push(ONSET_KA[answers.onset] ?? answers.onset);
  const rf = Array.isArray(answers.redflags) ? answers.redflags : answers.redflags ? [answers.redflags] : [];
  if (rf.length) parts.push(rf.includes('none') && rf.length === 1 ? 'საგანგაშო ნიშანი არ აქვს' : `საგანგაშო ნიშანი: ${rf.filter((v) => v !== 'none').map((v) => opt('redflags', v)).join('; ')}`);
  if (typeof answers.age === 'string') parts.push(AGE_KA[answers.age] ?? answers.age);
  if (typeof answers.topic === 'string') parts.push(`თემა: ${opt('topic', answers.topic)}`);
  if (typeof answers.labvalues === 'string' && answers.labvalues.trim()) parts.push(`ანალიზი: ${answers.labvalues.trim()}`);
  if (typeof answers.detail === 'string' && answers.detail.trim()) parts.push(`დამატებით: ${answers.detail.trim()}`);
  if (typeof answers.taking === 'string') parts.push(answers.taking === 'yes' ? 'წამალს იღებს' : 'წამალს არ იღებს');
  return parts.join('. ');
}

/* ── Does the question actually say something? ─────────────────────────────
 * „რას ნიშნავს დიაგნოზი:" with nothing after it was answered with an
 * invented diagnosis. A starter phrase, a topic button and the intake summary
 * are scaffolding, not content: what the person wrote must name something.
 */
const STARTER_KINDS: { re: RegExp; kind: DetailKind }[] = [
  { re: /რას\s+ნიშნავს\s+(ჩემი\s+)?დიაგნოზ\S*\s*:?/gi, kind: 'diagnosis' },
  { re: /ამიხსენი\s+(ჩემი\s+)?(ანალიზ|კვლევ)\S*\s*(პასუხ\S*)?\s*:?/gi, kind: 'lab' },
  { re: /რისთვის\s+მაქვს\s+დანიშნული\s+და\s+როგორ\s+მივიღო\s*:?/gi, kind: 'drug' },
  { re: /^\s*მაწუხებს\s*:?/gi, kind: 'symptom' },
];

export type DetailKind = 'diagnosis' | 'lab' | 'drug' | 'symptom' | 'any';

/** The person's own words, without starter phrases and the intake summary. */
export function substanceOf(text: string): { text: string; kind: DetailKind } {
  let body = text.split(/\n\s*დამატებითი ინფორმაცია:/)[0];
  let kind: DetailKind = 'any';
  for (const s of STARTER_KINDS) {
    if (s.re.test(body)) kind = s.kind;
    s.re.lastIndex = 0;
    body = body.replace(s.re, ' ');
  }
  return { text: body.replace(/[\s:.,;!?—–-]+/g, ' ').trim(), kind };
}

const DETAIL_PROMPT: Record<DetailKind, { textKa: string; placeholderKa: string }> = {
  diagnosis: { textKa: 'რომელი დიაგნოზი? ჩაწერეთ ისე, როგორც ექიმმა ან დასკვნაში დაგიწერეს', placeholderKa: 'მაგ.: გაფანტული სკლეროზი, ჰიპოთირეოზი, I10' },
  lab: { textKa: 'ჩაწერეთ ანალიზის დასახელება და შედეგი — ისე, როგორც ფურცელზე წერია', placeholderKa: 'მაგ.: ჰემოგლობინი 9.8, ფერიტინი 8' },
  drug: { textKa: 'რომელი წამალი? ჩაწერეთ სახელი შეფუთვიდან', placeholderKa: 'მაგ.: ომეპრაზოლი, ცერუკალი' },
  symptom: { textKa: 'რა გაწუხებთ? აღწერეთ თქვენი სიტყვებით', placeholderKa: 'მაგ.: 3 დღეა თავი მტკივა, მაღალი ცხელება მაქვს' },
  any: { textKa: 'დააზუსტეთ, რა გაინტერესებთ', placeholderKa: 'მაგ.: რას ნიშნავს ჰიპოთირეოზი? / 3 დღეა თავი მტკივა' },
};

/**
 * When the text names nothing, the one question to ask instead of answering.
 * A chosen topic button picks the wording; free text typed in the intake counts
 * as content.
 */
export function missingDetail(text: string, answers: IntakeAnswers = {}): IntakeQuestion | null {
  const own = substanceOf(text);
  const extra = [answers.topic, answers.detail, answers.labvalues].filter((v) => typeof v === 'string' && !['symptom', 'diagnosis', 'drug', 'lab'].includes(v as string)).join(' ');
  const letters = (own.text + ' ' + extra).replace(/[^\p{L}\p{N}]/gu, '');
  if (letters.length >= 3) return null;
  const topic = typeof answers.topic === 'string' ? (answers.topic as DetailKind) : undefined;
  const kind: DetailKind = topic && topic in DETAIL_PROMPT ? topic : own.kind;
  const p = DETAIL_PROMPT[kind];
  return { id: 'detail', textKa: p.textKa, freeText: { placeholderKa: p.placeholderKa, required: true } };
}
