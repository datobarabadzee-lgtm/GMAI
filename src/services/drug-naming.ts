import { DRUGS } from '@/knowledge/drugs';
import { LOW_VALUE_MEDS } from '@/knowledge/low-value-meds';
import { BRAND_TO_INN } from '@/knowledge/brand-names';

/**
 * GEORGIAN → INN RESOLUTION
 *
 * A clinician in Tbilisi types „ომეპრაზოლი", not "omeprazole". Open drug
 * databases are indexed in Latin INN, so without this layer the label lookup
 * silently returns nothing and the module looks empty while being merely deaf.
 *
 * Three stages, most reliable first:
 *   1. the app's own curated registry (generic_ka → generic_name)
 *   2. an explicit dictionary of agents commonly prescribed in Georgia
 *   3. phonetic transliteration, emitting several candidate spellings
 */

/** Commonly prescribed in Georgia, Georgian spelling → INN. */
const KA_TO_INN: Record<string, string> = {
  // კარდიოვასკულური
  ბისოპროლოლი: 'bisoprolol', მეტოპროლოლი: 'metoprolol', კარვედილოლი: 'carvedilol', ნებივოლოლი: 'nebivolol',
  ატენოლოლი: 'atenolol', ამლოდიპინი: 'amlodipine', ნიფედიპინი: 'nifedipine', ვერაპამილი: 'verapamil',
  დილთიაზემი: 'diltiazem', ლიზინოპრილი: 'lisinopril', ენალაპრილი: 'enalapril', რამიპრილი: 'ramipril',
  პერინდოპრილი: 'perindopril', ლოსარტანი: 'losartan', ვალსარტანი: 'valsartan', ტელმისარტანი: 'telmisartan',
  კანდესარტანი: 'candesartan', ჰიდროქლოროთიაზიდი: 'hydrochlorothiazide', ინდაპამიდი: 'indapamide',
  ფუროსემიდი: 'furosemide', ტორასემიდი: 'torasemide', სპირონოლაქტონი: 'spironolactone',
  ეპლერენონი: 'eplerenone', დიგოქსინი: 'digoxin', ამიოდარონი: 'amiodarone', ივაბრადინი: 'ivabradine',
  ნიტროგლიცერინი: 'nitroglycerin', იზოსორბიდი: 'isosorbide', მოქსონიდინი: 'moxonidine',
  // ანტითრომბოზული
  ასპირინი: 'aspirin', კლოპიდოგრელი: 'clopidogrel', ტიკაგრელორი: 'ticagrelor', ვარფარინი: 'warfarin',
  რივაროქსაბანი: 'rivaroxaban', აპიქსაბანი: 'apixaban', დაბიგატრანი: 'dabigatran', ედოქსაბანი: 'edoxaban',
  ენოქსაპარინი: 'enoxaparin', ჰეპარინი: 'heparin', პენტოქსიფილინი: 'pentoxifylline',
  // ლიპიდები და დიაბეტი
  ატორვასტატინი: 'atorvastatin', როსუვასტატინი: 'rosuvastatin', სიმვასტატინი: 'simvastatin',
  ეზეტიმიბი: 'ezetimibe', ფენოფიბრატი: 'fenofibrate', მეტფორმინი: 'metformin',
  გლიკლაზიდი: 'gliclazide', გლიმეპირიდი: 'glimepiride', ემპაგლიფლოზინი: 'empagliflozin',
  დაპაგლიფლოზინი: 'dapagliflozin', სიტაგლიპტინი: 'sitagliptin', ლინაგლიპტინი: 'linagliptin',
  სემაგლუტიდი: 'semaglutide', ტირზეპატიდი: 'tirzepatide', დულაგლუტიდი: 'dulaglutide', ლირაგლუტიდი: 'liraglutide', ინსულინი: 'insulin', პიოგლიტაზონი: 'pioglitazone',
  // კუჭ-ნაწლავი
  ომეპრაზოლი: 'omeprazole', პანტოპრაზოლი: 'pantoprazole', ეზომეპრაზოლი: 'esomeprazole',
  ლანსოპრაზოლი: 'lansoprazole', რაბეპრაზოლი: 'rabeprazole', ფამოტიდინი: 'famotidine',
  დომპერიდონი: 'domperidone', მეტოკლოპრამიდი: 'metoclopramide', ონდანსეტრონი: 'ondansetron',
  დროტავერინი: 'drotaverine', მებევერინი: 'mebeverine', ლაქტულოზა: 'lactulose',
  ურსოდეზოქსიქოლის: 'ursodiol', მესალაზინი: 'mesalamine',
  // ტკივილი და ანთება
  პარაცეტამოლი: 'acetaminophen', იბუპროფენი: 'ibuprofen', დიკლოფენაკი: 'diclofenac',
  ნაპროქსენი: 'naproxen', მელოქსიკამი: 'meloxicam', ნიმესულიდი: 'nimesulide',
  კეტოპროფენი: 'ketoprofen', ცელეკოქსიბი: 'celecoxib', ეტორიკოქსიბი: 'etoricoxib',
  ტრამადოლი: 'tramadol', მორფინი: 'morphine', ფენტანილი: 'fentanyl', კეტოროლაკი: 'ketorolac',
  კოლხიცინი: 'colchicine', ალოპურინოლი: 'allopurinol', მეთოტრექსატი: 'methotrexate',
  პრედნიზოლონი: 'prednisolone', დექსამეტაზონი: 'dexamethasone', მეთილპრედნიზოლონი: 'methylprednisolone',
  // ნევროლოგია და ფსიქიატრია
  ამიტრიპტილინი: 'amitriptyline', სერტრალინი: 'sertraline', ფლუოქსეტინი: 'fluoxetine',
  ესციტალოპრამი: 'escitalopram', პაროქსეტინი: 'paroxetine', ვენლაფაქსინი: 'venlafaxine',
  დულოქსეტინი: 'duloxetine', მირტაზაპინი: 'mirtazapine', ტრაზოდონი: 'trazodone',
  დიაზეპამი: 'diazepam', ალპრაზოლამი: 'alprazolam', კლონაზეპამი: 'clonazepam',
  ლორაზეპამი: 'lorazepam', ბრომაზეპამი: 'bromazepam', ზოლპიდემი: 'zolpidem',
  კვეტიაპინი: 'quetiapine', რისპერიდონი: 'risperidone', ოლანზაპინი: 'olanzapine',
  ჰალოპერიდოლი: 'haloperidol', არიპიპრაზოლი: 'aripiprazole', ლითიუმი: 'lithium',
  კარბამაზეპინი: 'carbamazepine', ვალპროატი: 'valproate', ლამოტრიჯინი: 'lamotrigine',
  ლევეტირაცეტამი: 'levetiracetam', ტოპირამატი: 'topiramate', ფენიტოინი: 'phenytoin',
  გაბაპენტინი: 'gabapentin', პრეგაბალინი: 'pregabalin', დონეპეზილი: 'donepezil',
  მემანტინი: 'memantine', რივასტიგმინი: 'rivastigmine', ლევოდოპა: 'levodopa',
  პრამიპექსოლი: 'pramipexole', სუმატრიპტანი: 'sumatriptan', ბეტაჰისტინი: 'betahistine',
  // სასუნთქი და ალერგია
  სალბუტამოლი: 'albuterol', ბუდესონიდი: 'budesonide', ფლუტიკაზონი: 'fluticasone',
  ფორმოტეროლი: 'formoterol', სალმეტეროლი: 'salmeterol', ტიოტროპიუმი: 'tiotropium',
  მონტელუკასტი: 'montelukast', ლორატადინი: 'loratadine', ცეტირიზინი: 'cetirizine',
  დეზლორატადინი: 'desloratadine', ფექსოფენადინი: 'fexofenadine', ამბროქსოლი: 'ambroxol',
  // ანტიმიკრობული
  ამოქსიცილინი: 'amoxicillin', აზითრომიცინი: 'azithromycin', კლარითრომიცინი: 'clarithromycin',
  ცეფტრიაქსონი: 'ceftriaxone', ცეფუროქსიმი: 'cefuroxime', ცეფიქსიმი: 'cefixime',
  ციპროფლოქსაცინი: 'ciprofloxacin', ლევოფლოქსაცინი: 'levofloxacin', მოქსიფლოქსაცინი: 'moxifloxacin',
  მეტრონიდაზოლი: 'metronidazole', დოქსიციკლინი: 'doxycycline', ნიტროფურანტოინი: 'nitrofurantoin',
  ფოსფომიცინი: 'fosfomycin', ვანკომიცინი: 'vancomycin', მეროპენემი: 'meropenem',
  ფლუკონაზოლი: 'fluconazole', აციკლოვირი: 'acyclovir', ოსელტამივირი: 'oseltamivir',
  // ჰოსპიტალური / ინტენსიური თერაპიის ანტიმიკრობული
  კოლისტინი: 'colistin', კოლისტიმეტატი: 'colistimethate', პოლიმიქსინი: 'polymyxin b',
  ამიკაცინი: 'amikacin', გენტამიცინი: 'gentamicin', ტობრამიცინი: 'tobramycin',
  ლინეზოლიდი: 'linezolid', ტიგეციკლინი: 'tigecycline', დაპტომიცინი: 'daptomycin', ტეიკოპლანინი: 'teicoplanin',
  იმიპენემი: 'imipenem', ერტაპენემი: 'ertapenem', პიპერაცილინი: 'piperacillin', ცეფეპიმი: 'cefepime',
  ცეფტაზიდიმი: 'ceftazidime', ცეფაზოლინი: 'cefazolin', ამპიცილინი: 'ampicillin', კლინდამიცინი: 'clindamycin',
  ამფოტერიცინი: 'amphotericin b', ვორიკონაზოლი: 'voriconazole', კასპოფუნგინი: 'caspofungin',
  // ინტენსიური თერაპია და ანესთეზია
  ნორეპინეფრინი: 'norepinephrine', ნორადრენალინი: 'norepinephrine', ეპინეფრინი: 'epinephrine', ადრენალინი: 'epinephrine',
  დოფამინი: 'dopamine', დობუტამინი: 'dobutamine', ვაზოპრესინი: 'vasopressin', ატროპინი: 'atropine',
  ადენოზინი: 'adenosine', პროპოფოლი: 'propofol', მიდაზოლამი: 'midazolam', კეტამინი: 'ketamine',
  დექსმედეტომიდინი: 'dexmedetomidine', ეტომიდატი: 'etomidate', როკურონიუმი: 'rocuronium',
  სუქსამეთონიუმი: 'succinylcholine', სუქცინილქოლინი: 'succinylcholine', ნალოქსონი: 'naloxone', ფლუმაზენილი: 'flumazenil',
  მანიტოლი: 'mannitol', ალტეპლაზა: 'alteplase', ტენექტეპლაზა: 'tenecteplase', პროტამინი: 'protamine',
  // ენდოკრინული და სხვა
  ლევოთიროქსინი: 'levothyroxine', თიამაზოლი: 'methimazole', ალენდრონატი: 'alendronate',
  კალციუმი: 'calcium', ქოლეკალციფეროლი: 'cholecalciferol', ფოლიუმის: 'folic acid',
  ციანოკობალამინი: 'cyanocobalamin', რკინის: 'ferrous sulfate', ტამსულოსინი: 'tamsulosin',
  ფინასტერიდი: 'finasteride', სილდენაფილი: 'sildenafil', ოქსიბუტინინი: 'oxybutynin',
  პრომეთაზინი: 'promethazine', პიპოლფენი: 'promethazine', დიპრაზინი: 'promethazine', კოდეინი: 'codeine',
  ლოპერამიდი: 'loperamide', მეტამიზოლი: 'metamizole', ანალგინი: 'metamizole',
  ზოპიკლონი: 'zopiclone', დექსტრომეთორფანი: 'dextromethorphan', დიფენჰიდრამინი: 'diphenhydramine',
  ქსილომეტაზოლინი: 'xylometazoline', ოქსიმეტაზოლინი: 'oxymetazoline', ფლუვოქსამინი: 'fluvoxamine',
  აგომელატინი: 'agomelatine', ვორტიოქსეტინი: 'vortioxetine', კლომიპრამინი: 'clomipramine',
  ტრანექსამის: 'tranexamic acid', ჰიდროქსიქლოროკვინი: 'hydroxychloroquine',
};

/** Phonetic transliteration, Georgian → Latin. */
const GLYPH: Record<string, string> = {
  ა: 'a', ბ: 'b', გ: 'g', დ: 'd', ე: 'e', ვ: 'v', ზ: 'z', თ: 't', ი: 'i', კ: 'k',
  ლ: 'l', მ: 'm', ნ: 'n', ო: 'o', პ: 'p', ჟ: 'zh', რ: 'r', ს: 's', ტ: 't', უ: 'u',
  ფ: 'f', ქ: 'k', ღ: 'gh', ყ: 'q', შ: 'sh', ჩ: 'ch', ც: 'c', ძ: 'dz', წ: 'ts',
  ჭ: 'ch', ხ: 'kh', ჯ: 'j', ჰ: 'h',
};

function translit(ka: string): string {
  return [...ka].map((ch) => GLYPH[ch] ?? ch).join('');
}

const CURATED = new Map<string, string>();
for (const d of DRUGS) {
  if (d.generic_ka) CURATED.set(d.generic_ka.toLowerCase(), d.generic_name.toLowerCase());
  for (const b of d.brand_names ?? []) CURATED.set(b.toLowerCase(), d.generic_name.toLowerCase());
}
for (const e of LOW_VALUE_MEDS) {
  CURATED.set(e.nameKa.toLowerCase(), e.inn.toLowerCase());
  for (const b of e.brandsGe) CURATED.set(b.toLowerCase(), e.inn.toLowerCase());
}

const DICT = new Map(Object.entries(KA_TO_INN).map(([k, v]) => [k.toLowerCase(), v]));

/** Drops Georgian nominative/genitive endings so the stem can be matched. */
function stems(word: string): string[] {
  const out = [word];
  for (const suffix of ['ისა', 'ის', 'ით', 'ზე', 'ში', 'ი']) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) out.push(word.slice(0, -suffix.length));
  }
  return out;
}

/**
 * Returns candidate Latin spellings for a drug name, best first.
 * A caller tries them in order against an open database.
 */
export function latinCandidates(raw: string): string[] {
  const name = raw.trim().toLowerCase();
  if (!name) return [];

  // Already Latin — a brand maps to its INN first, then the name as given.
  if (!/[Ⴀ-ჿ]/.test(name)) {
    const viaBrand = BRAND_TO_INN.get(name) ?? CURATED.get(name);
    if (viaBrand && viaBrand !== name) return [viaBrand, name];
    // A near-miss spelling is never looked up as if it were that drug
    // (Colomycin ≠ colchicine). It is offered to the user as a question only.
    return [name];
  }

  const out: string[] = [];
  const push = (v: string) => {
    const t = v.trim();
    if (t.length >= 3 && !out.includes(t)) out.push(t);
  };

  for (const form of stems(name)) {
    if (CURATED.has(form)) push(CURATED.get(form)!);
    if (DICT.has(form)) push(DICT.get(form)!);
    if (BRAND_TO_INN.has(form)) push(BRAND_TO_INN.get(form)!);
  }
  // No fuzzy candidate here: a similar-looking name is a different drug until
  // the user confirms it (see resolveDrugName → suggestion).

  // Transliteration variants: INNs differ mainly in k/c and the -e ending.
  for (const form of stems(name)) {
    const base = translit(form);
    push(base);
    push(`${base}e`);
    push(base.replace(/ks/g, 'x'));
    push(`${base.replace(/ks/g, 'x')}e`);
    push(base.replace(/k/g, 'c'));
    push(`${base.replace(/k/g, 'c')}e`);
  }

  return out.slice(0, 8);
}

export const GEORGIAN_DICTIONARY_SIZE = DICT.size + CURATED.size;

/**
 * INN for a word ONLY when a dictionary vouches for it. Unlike latinCandidates
 * this never transliterates, so an ordinary Georgian word is not turned into a
 * fake drug name and sent to a search engine as one.
 */
export function innFromDictionary(raw: string): string | null {
  const name = raw.trim().toLowerCase();
  if (!name || !/[\u10A0-\u10FF]/.test(name)) return null;
  for (const form of stems(name)) {
    if (CURATED.has(form)) return CURATED.get(form)!;
    if (DICT.has(form)) return DICT.get(form)!;
    if (BRAND_TO_INN.has(form)) return BRAND_TO_INN.get(form)!;
  }
  return null;
}

/* ── fuzzy matching: „მუხჯარო" is a typo of „მუნჯარო", not an unknown drug ── */

function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const A = [...a];
  const B = [...b];
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= B.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[B.length];
}

/** Every name the app can vouch for, mapped to its INN. */
const ALL_NAMES: Array<[string, string]> = [
  ...CURATED.entries(),
  ...DICT.entries(),
  ...BRAND_TO_INN.entries(),
];

/**
 * Closest known name within 1 edit (2 for names of 9+ letters). Short words
 * are never fuzzed and a tie between two different INNs returns nothing, so a
 * guess is made only when it is unambiguous.
 */
export function fuzzyInn(raw: string): { inn: string; matched: string; distance: number } | null {
  const name = raw.trim().toLowerCase();
  const len = [...name].length;
  if (len < 5) return null;
  const cap = len >= 9 ? 2 : 1;
  let best: { inn: string; matched: string; distance: number } | null = null;
  let tie = false;
  for (const form of stems(name)) {
    for (const [key, inn] of ALL_NAMES) {
      if ([...key].length < 5) continue;
      const d = editDistance(form, key, cap);
      if (d > cap) continue;
      if (!best || d < best.distance) {
        best = { inn, matched: key, distance: d };
        tie = false;
      } else if (d === best.distance && inn !== best.inn) {
        tie = true;
      }
    }
  }
  return best && !tie ? best : null;
}

export type NameResolution = {
  input: string;
  inn: string | null;
  /**
   * exact = known name; brand = known trade name; fuzzy = UNKNOWN name that
   * resembles a known one (inn stays null — only a suggestion is offered);
   * latin = typed in Latin, used as given; translit = phonetic guess only.
   */
  via: 'exact' | 'brand' | 'fuzzy' | 'latin' | 'translit' | 'none';
  matched?: string;
  /** A similar known name, for a "did you mean" question. Never applied automatically. */
  suggestion?: { name: string; inn: string };
  noteKa: string;
};

const exactCache = new Map<string, string | null>();
/**
 * INN for a name the dictionaries know exactly (INN, Georgian INN, trade name),
 * else null. No similarity search — cheap enough to run on every word of a text.
 */
export function exactInn(raw: string): string | null {
  const name = raw.trim().toLowerCase();
  if (!name) return null;
  const hit = exactCache.get(name);
  if (hit !== undefined) return hit;
  let out: string | null = null;
  const isKa = /[\u10A0-\u10FF]/.test(name);
  for (const form of isKa ? stems(name) : [name]) {
    const inn = BRAND_TO_INN.get(form) ?? CURATED.get(form) ?? DICT.get(form);
    if (inn) {
      out = inn;
      break;
    }
  }
  if (exactCache.size > 50_000) exactCache.clear();
  exactCache.set(name, out);
  return out;
}

/** How a typed name was understood — shown to the user, never hidden. */
export function resolveDrugName(raw: string): NameResolution {
  const input = raw.trim();
  const name = input.toLowerCase();
  if (!name) return { input, inn: null, via: 'none', noteKa: '' };
  const isKa = /[\u10A0-\u10FF]/.test(name);
  for (const form of isKa ? stems(name) : [name]) {
    if (BRAND_TO_INN.has(form)) {
      const inn = BRAND_TO_INN.get(form)!;
      return { input, inn, via: 'brand', matched: form, noteKa: `სავაჭრო სახელი — მოქმედი ნივთიერება: ${inn}` };
    }
    const exact = CURATED.get(form) ?? DICT.get(form);
    if (exact) return { input, inn: exact, via: 'exact', matched: form, noteKa: `მოქმედი ნივთიერება: ${exact}` };
  }
  // Look-alike / sound-alike names are the classic medication error
  // (Colomycin → colchicine). A name we do not know is NEVER silently replaced
  // by the nearest known one: the nearest name is returned as a question, and
  // nothing — label, summary, dose, interaction — is produced for it until the
  // user confirms by choosing it.
  const fuzzy = fuzzyInn(name);
  if (fuzzy) {
    return {
      input, inn: null, via: 'fuzzy', matched: fuzzy.matched,
      suggestion: { name: fuzzy.matched, inn: fuzzy.inn },
      noteKa: `„${input}" ჩვენს ლექსიკონში არ არის. მსგავსად იწერება „${fuzzy.matched}" (${fuzzy.inn}), მაგრამ ეს შეიძლება სულ სხვა პრეპარატი იყოს — ავტომატურად არ ჩავანაცვლეთ. თუ ის იგულისხმეთ, დაადასტურეთ; თუ არა — ჩაწერეთ მოქმედი ნივთიერება შეფუთვიდან.`,
    };
  }
  if (!isKa) return { input, inn: name, via: 'latin', noteKa: '' };
  const guess = latinCandidates(name)[0] ?? null;
  return {
    input, inn: guess, via: 'translit',
    noteKa: 'ეს სახელი ჩვენს ლექსიკონში არ არის — ძებნა ტრანსლიტერაციით; თუ შედეგი არ მოიძებნა, ჩაწერეთ მოქმედი ნივთიერება შეფუთვიდან',
  };
}

/**
 * Drug names mentioned in free text, as resolved INNs — exact and brand names
 * only. A look-alike spelling is never promoted to a drug identity here.
 */
export function drugMentions(text: string): NameResolution[] {
  const out: NameResolution[] = [];
  const seen = new Set<string>();
  for (const word of text.split(/[\s,.;:()/!?«»„“"]+/)) {
    if (word.length < 4) continue;
    const r = resolveDrugName(word);
    if (!r.inn) continue;
    // Only names a dictionary vouches for count as a drug; a look-alike is not one.
    const accept = r.via === 'exact' || r.via === 'brand';
    if (!accept) continue;
    if (seen.has(r.inn)) continue;
    seen.add(r.inn);
    out.push(r);
  }
  return out.slice(0, 5);
}

/** Every drug name the app's dictionaries know (INNs, Georgian INNs, trade names). For guards, not for identity. */
export function knownDrugNames(): string[] {
  return [...new Set([...ALL_NAMES.flatMap(([k, v]) => [k, v]), ...DRUGS.flatMap((d) => [d.generic_name, d.generic_ka, ...d.brand_names])].filter((n): n is string => typeof n === 'string' && n.length >= 5).map((n) => n.toLowerCase()))];
}
