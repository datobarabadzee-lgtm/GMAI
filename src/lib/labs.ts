import type { LabValue, PatientContext } from '@/schemas/clinical';

/**
 * LABORATORY INTELLIGENCE — deterministic reference ranges, pattern and trend detection.
 *
 * Every value is first normalised to its analyte's canonical unit with an
 * analyte-specific, tested conversion (audit F02, 2026-10-21: hemoglobin
 * 14 g/dL was „normal" and 140 g/L — the same concentration — „high"). Status,
 * critical limits, patterns, trends and medication warnings all read the
 * normalised value; the original value and unit are kept for provenance.
 *
 *   · an unknown or incompatible unit → no interpretation („დააზუსტეთ ერთეული");
 *   · a missing unit → interpreted only when the value fits exactly one accepted
 *     unit's plausible range, and the inference is stated;
 *   · BUN and urea are different analytes and are never merged;
 *   · the laboratory's own reference range, when given, is used as is;
 *   · built-in ranges are general adult orientation values, marked as not
 *     clinically validated; for patients under 18 they are not applied.
 */

export type LabUnit = {
  /** Accepted spellings (Georgian and Latin), compared case-insensitively without spaces. */
  aliases: string[];
  /** canonical = value * factor + offset */
  factor: number;
  offset?: number;
  /** Values outside this window are implausible in this unit (used only to infer a missing unit). */
  plausible: [number, number];
};

export type LabRef = {
  key: string;
  names: string[];
  /** Canonical unit (display). */
  unit: string;
  units: LabUnit[];
  low: number;
  high: number;
  criticalLow?: number;
  criticalHigh?: number;
  labelKa: string;
};

const U = (aliases: string[], factor: number, plausible: [number, number], offset = 0): LabUnit => ({ aliases, factor, offset, plausible });
const MMOL = ['მმოლ/ლ', 'mmol/l', 'mmol/L'];
const MGDL = ['მგ/დლ', 'mg/dl', 'mg/dL'];
const GDL = ['გ/დლ', 'g/dl', 'g/dL'];
const GL = ['გ/ლ', 'g/l', 'g/L'];
const UMOL = ['მკმოლ/ლ', 'µmol/l', 'μmol/l', 'umol/l', 'µmol/L'];
const PER_L = ['ერთ/ლ', 'u/l', 'iu/l', 'სე/ლ'];
const COUNT_9 = ['×10⁹/ლ', 'x10⁹/ლ', '×10^9/ლ', 'x10^9/l', '×10⁹/l', '10^9/l', '×10³/მკლ', 'x10^3/µl', '10^3/ul', '10^3/µl', 'k/µl', 'k/ul'];

export const LAB_REFERENCES: LabRef[] = [
  { key: 'sodium', names: ['sodium', 'na', 'ნატრიუმი'], unit: 'მმოლ/ლ', units: [U([...MMOL, 'მექვ/ლ', 'meq/l'], 1, [90, 200])], low: 135, high: 145, criticalLow: 125, criticalHigh: 155, labelKa: 'ნატრიუმი' },
  { key: 'potassium', names: ['potassium', 'k', 'კალიუმი'], unit: 'მმოლ/ლ', units: [U([...MMOL, 'მექვ/ლ', 'meq/l'], 1, [1, 10])], low: 3.5, high: 5.1, criticalLow: 2.8, criticalHigh: 6.0, labelKa: 'კალიუმი' },
  { key: 'creatinine', names: ['creatinine', 'კრეატინინი'], unit: 'მგ/დლ', units: [U(MGDL, 1, [0.1, 20]), U(UMOL, 1 / 88.42, [10, 1800])], low: 0.6, high: 1.2, criticalHigh: 3.0, labelKa: 'კრეატინინი' },
  { key: 'urea', names: ['urea', 'შარდოვანა'], unit: 'მმოლ/ლ', units: [U(MMOL, 1, [0.5, 80]), U(MGDL, 1 / 6.006, [3, 480])], low: 2.5, high: 7.1, criticalHigh: 25, labelKa: 'შარდოვანა' },
  { key: 'bun', names: ['bun', 'blood urea nitrogen', 'შარდოვანას აზოტი'], unit: 'მგ/დლ', units: [U(MGDL, 1, [1, 220])], low: 7, high: 20, criticalHigh: 100, labelKa: 'შარდოვანას აზოტი (BUN)' },
  { key: 'hemoglobin', names: ['hemoglobin', 'haemoglobin', 'hgb', 'hb', 'ჰემოგლობინი'], unit: 'გ/დლ', units: [U(GDL, 1, [2, 25]), U(GL, 0.1, [20, 250])], low: 12, high: 16, criticalLow: 7, labelKa: 'ჰემოგლობინი' },
  { key: 'hematocrit', names: ['hematocrit', 'hct', 'ჰემატოკრიტი'], unit: '%', units: [U(['%'], 1, [5, 80]), U(['l/l', 'ლ/ლ'], 100, [0.05, 0.8])], low: 36, high: 46, criticalHigh: 55, labelKa: 'ჰემატოკრიტი' },
  { key: 'platelets', names: ['platelets', 'plt', 'თრომბოციტები'], unit: '×10⁹/ლ', units: [U(COUNT_9, 1, [1, 2000])], low: 150, high: 400, criticalLow: 50, labelKa: 'თრომბოციტები' },
  { key: 'wbc', names: ['wbc', 'leukocytes', 'ლეიკოციტები'], unit: '×10⁹/ლ', units: [U(COUNT_9, 1, [0.1, 300])], low: 4, high: 10, criticalLow: 1, criticalHigh: 30, labelKa: 'ლეიკოციტები' },
  { key: 'glucose', names: ['glucose', 'გლუკოზა'], unit: 'მმოლ/ლ', units: [U(MMOL, 1, [0.5, 60]), U(MGDL, 1 / 18.016, [10, 1100])], low: 3.9, high: 5.6, criticalLow: 2.8, criticalHigh: 25, labelKa: 'გლუკოზა' },
  { key: 'hba1c', names: ['hba1c', 'ჰბა1ც'], unit: '%', units: [U(['%'], 1, [3, 20]), U(['მმოლ/მოლ', 'mmol/mol'], 1 / 10.929, [9, 200], 2.15)], low: 4, high: 5.7, criticalHigh: 12, labelKa: 'HbA1c' },
  { key: 'alt', names: ['alt', 'sgpt', 'ალტ'], unit: 'ერთ/ლ', units: [U(PER_L, 1, [1, 20000])], low: 7, high: 45, criticalHigh: 500, labelKa: 'ALT' },
  { key: 'ast', names: ['ast', 'sgot', 'ასტ'], unit: 'ერთ/ლ', units: [U(PER_L, 1, [1, 20000])], low: 8, high: 40, criticalHigh: 500, labelKa: 'AST' },
  { key: 'bilirubin', names: ['bilirubin', 'ბილირუბინი'], unit: 'მგ/დლ', units: [U(MGDL, 1, [0.05, 50]), U(UMOL, 1 / 17.104, [1, 850])], low: 0.2, high: 1.2, criticalHigh: 10, labelKa: 'ბილირუბინი' },
  { key: 'albumin', names: ['albumin', 'ალბუმინი'], unit: 'გ/დლ', units: [U(GDL, 1, [0.5, 7]), U(GL, 0.1, [5, 70])], low: 3.5, high: 5.0, criticalLow: 2.0, labelKa: 'ალბუმინი' },
  { key: 'inr', names: ['inr'], unit: '', units: [U(['', 'ratio'], 1, [0.5, 15])], low: 0.8, high: 1.2, criticalHigh: 5, labelKa: 'INR' },
  { key: 'crp', names: ['crp', 'ცრპ'], unit: 'მგ/ლ', units: [U(['მგ/ლ', 'mg/l'], 1, [0, 700]), U(MGDL, 10, [0, 70])], low: 0, high: 5, criticalHigh: 200, labelKa: 'CRP' },
  { key: 'tsh', names: ['tsh'], unit: 'მიერთ/ლ', units: [U(['მიერთ/ლ', 'miu/l', 'mu/l', 'µiu/ml', 'uiu/ml', 'მკსე/მლ'], 1, [0.001, 200])], low: 0.4, high: 4.0, criticalHigh: 50, labelKa: 'TSH' },
  { key: 'calcium', names: ['calcium', 'ca', 'კალციუმი'], unit: 'მგ/დლ', units: [U(MGDL, 1, [3, 20]), U(MMOL, 4.008, [0.7, 5])], low: 8.5, high: 10.5, criticalLow: 7, criticalHigh: 13, labelKa: 'კალციუმი' },
  { key: 'ldl', names: ['ldl'], unit: 'მმოლ/ლ', units: [U(MMOL, 1, [0.1, 20]), U(MGDL, 1 / 38.67, [4, 800])], low: 0, high: 2.6, labelKa: 'LDL ქოლესტერინი' },
  { key: 'lactate', names: ['lactate', 'ლაქტატი'], unit: 'მმოლ/ლ', units: [U(MMOL, 1, [0.1, 30])], low: 0.5, high: 2.0, criticalHigh: 4, labelKa: 'ლაქტატი' },
  { key: 'b12', names: ['vitamin b12', 'b12'], unit: 'პმოლ/ლ', units: [U(['პმოლ/ლ', 'pmol/l'], 1, [20, 3000]), U(['პგ/მლ', 'pg/ml', 'ng/l', 'ნგ/ლ'], 0.7378, [30, 4000])], low: 150, high: 700, labelKa: 'ვიტამინი B12' },
  { key: 'troponin', names: ['troponin', 'ტროპონინი'], unit: 'ნგ/ლ', units: [U(['ნგ/ლ', 'ng/l', 'pg/ml', 'პგ/მლ'], 1, [0, 100000]), U(['ნგ/მლ', 'ng/ml'], 1000, [0, 100])], low: 0, high: 14, criticalHigh: 100, labelKa: 'ტროპონინი' },
];

/** Exact name first (so „bun" is never read as „urea"), then a whole-word name inside a longer label. */
export const findRef = (analyte: string): LabRef | undefined => {
  const a = analyte.toLowerCase().trim();
  const exact = LAB_REFERENCES.find((r) => r.names.includes(a));
  if (exact) return exact;
  const word = (n: string) => (/[ა-ჰ]/.test(n) ? a.includes(n) : new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(a));
  return LAB_REFERENCES.filter((r) => r.names.some((n) => n.length >= 3 && word(n))).sort((x, y) => Math.max(...y.names.map((n) => (word(n) ? n.length : 0))) - Math.max(...x.names.map((n) => (word(n) ? n.length : 0))))[0];
};

const unitKey = (u: string) => u.toLowerCase().replace(/\s+/g, '').replace('μ', 'µ');

export type Normalised =
  | { ok: true; value: number; unit: string; inferred: boolean; fromUnit: string }
  | { ok: false; reasonKa: string };

/** The value in the analyte's canonical unit, or the reason it cannot be given. */
export function normaliseLab(ref: LabRef, value: number, unit: string): Normalised {
  const k = unitKey(unit ?? '');
  if (k) {
    const u = ref.units.find((x) => x.aliases.some((a) => unitKey(a) === k));
    if (!u) return { ok: false, reasonKa: `ერთეული „${unit}“ ${ref.labelKa}-სთვის უცნობი ან შეუთავსებელია — ინტერპრეტაცია ვერ სრულდება, დააზუსტეთ ერთეული.` };
    return { ok: true, value: value * u.factor + (u.offset ?? 0), unit: ref.unit, inferred: false, fromUnit: unit };
  }
  if (ref.units.some((x) => x.aliases.includes(''))) return { ok: true, value, unit: ref.unit, inferred: false, fromUnit: '' };
  const fits = ref.units.filter((x) => value >= x.plausible[0] && value <= x.plausible[1]);
  if (fits.length !== 1) return { ok: false, reasonKa: `ერთეული მითითებული არ არის და მნიშვნელობა ${value} რამდენიმე ერთეულს შეესაბამება — ინტერპრეტაცია ვერ სრულდება, დააზუსტეთ ერთეული.` };
  const u = fits[0];
  return { ok: true, value: value * u.factor + (u.offset ?? 0), unit: ref.unit, inferred: true, fromUnit: u.aliases[0] };
}

export type LabInterpretation = {
  analyte: string;
  /** Analyte key of the reference used, if any. */
  key: string | null;
  labelKa: string;
  /** As given by the user (provenance). */
  value: number;
  unit: string;
  /** In the canonical unit; null when the unit could not be resolved. */
  canonicalValue: number | null;
  canonicalUnit: string;
  status: 'critical_low' | 'low' | 'normal' | 'high' | 'critical_high' | 'unknown';
  refText: string;
  /** lab = the laboratory's own range from the report; builtin = general adult orientation value, not clinically validated. */
  refSource: 'lab' | 'builtin_unvalidated' | 'none';
  unitInferred: boolean;
  noteKa: string;
};

export type LabAnalysis = {
  results: LabInterpretation[];
  abnormal: LabInterpretation[];
  critical: LabInterpretation[];
  patterns: { titleKa: string; detailKa: string; severity: 'critical' | 'high' | 'moderate' }[];
  trends: { analyte: string; labelKa: string; direction: 'rising' | 'falling' | 'stable'; deltaPct: number; points: { date: string; value: number }[] }[];
  medicationRelated: { titleKa: string; detailKa: string }[];
  urgent: string[];
};

const round = (v: number) => Math.round(v * 1000) / 1000;

function interpretOne(l: LabValue, patient?: PatientContext): LabInterpretation {
  const ref = findRef(l.analyte);
  const base = { analyte: l.analyte, key: ref?.key ?? null, labelKa: ref?.labelKa ?? l.analyte, value: l.value, unit: l.unit || '', canonicalUnit: ref?.unit ?? '' };
  if (!ref) {
    const hasLab = l.refLow !== undefined && l.refHigh !== undefined;
    if (!hasLab) return { ...base, canonicalValue: null, status: 'unknown', refText: '—', refSource: 'none', unitInferred: false, noteKa: 'რეფერენსული დიაპაზონი ვერ დადგინდა — შედეგი ინტერპრეტირდეს ლაბორატორიის ბლანკის მიხედვით.' };
    const status = l.value < l.refLow! ? 'low' : l.value > l.refHigh! ? 'high' : 'normal';
    return { ...base, canonicalValue: null, status, refText: `${l.refLow}–${l.refHigh} (ლაბორატორიის)`, refSource: 'lab', unitInferred: false, noteKa: status === 'normal' ? 'ლაბორატორიის რეფერენსის ფარგლებში.' : status === 'low' ? 'ლაბორატორიის რეფერენსზე დაბალი.' : 'ლაბორატორიის რეფერენსზე მაღალი.' };
  }
  const n = normaliseLab(ref, l.value, l.unit);
  if (!n.ok) return { ...base, canonicalValue: null, status: 'unknown', refText: '—', refSource: 'none', unitInferred: false, noteKa: n.reasonKa };
  const v = n.value;
  const child = patient?.age !== null && patient?.age !== undefined && patient.age < 18;
  // The laboratory's own range is in the unit of the report; it is used as given.
  const labRange = l.refLow !== undefined && l.refHigh !== undefined;
  const crit = ref.criticalLow !== undefined && v <= ref.criticalLow ? 'critical_low' : ref.criticalHigh !== undefined && v >= ref.criticalHigh ? 'critical_high' : null;
  let status: LabInterpretation['status'];
  let refText: string;
  let refSource: LabInterpretation['refSource'];
  if (labRange) {
    status = crit && !child ? crit : l.value < l.refLow! ? 'low' : l.value > l.refHigh! ? 'high' : 'normal';
    refText = `${l.refLow}–${l.refHigh}${l.unit ? ` ${l.unit}` : ''} (ლაბორატორიის)`;
    refSource = 'lab';
  } else if (child) {
    return { ...base, canonicalValue: round(v), status: 'unknown', refText: '—', refSource: 'none', unitInferred: n.inferred, noteKa: 'ბავშვის ასაკობრივი რეფერენსი ჩაშენებული არ არის — შედეგი ინტერპრეტირდეს ლაბორატორიის ბლანკის რეფერენსით.' };
  } else {
    status = crit ?? (v < ref.low ? 'low' : v > ref.high ? 'high' : 'normal');
    refText = `${ref.low}–${ref.high} ${ref.unit} (ზოგადი, მოზრდილის)`;
    refSource = 'builtin_unvalidated';
  }
  const conv = n.fromUnit && unitKey(n.fromUnit) !== unitKey(ref.unit) ? ` (= ${round(v)} ${ref.unit})` : '';
  const inferredNote = n.inferred ? ` ერთეული არ იყო მითითებული — მნიშვნელობა მხოლოდ „${n.fromUnit}“-ს შეესაბამება და ასე იქნა წაკითხული; დააზუსტეთ.` : '';
  const builtinNote = refSource === 'builtin_unvalidated' ? ' რეფერენსი ზოგადი საორიენტაციოა (კლინიკურად არავალიდირებული; ასაკი, სქესი, ორსულობა და ლაბორატორიის მეთოდი არ არის გათვალისწინებული).' : '';
  const noteKa =
    (status === 'critical_low' || status === 'critical_high'
      ? 'კრიტიკული მნიშვნელობა — საჭიროა დაუყოვნებელი კლინიკური რეაგირება და შედეგის დადასტურება.'
      : status === 'low'
        ? 'რეფერენსზე დაბალი.'
        : status === 'high'
          ? 'რეფერენსზე მაღალი.'
          : 'რეფერენსის ფარგლებში.') +
    conv +
    inferredNote +
    builtinNote;
  return { ...base, canonicalValue: round(v), status, refText, refSource, unitInferred: n.inferred, noteKa: noteKa.trim() };
}

export function interpretLabs(labs: LabValue[], patient?: PatientContext): LabAnalysis {
  const results: LabInterpretation[] = labs.map((l) => interpretOne(l, patient));

  const abnormal = results.filter((r) => r.status !== 'normal' && r.status !== 'unknown');
  const critical = results.filter((r) => r.status === 'critical_low' || r.status === 'critical_high');

  // Patterns read the normalised value of the most recent interpretable result.
  const get = (key: string) => {
    const rows = results.filter((r) => r.key === key && r.canonicalValue !== null);
    return rows[rows.length - 1];
  };
  const cv = (r: LabInterpretation | undefined) => (r && r.canonicalValue !== null ? r.canonicalValue : null);

  const patterns: LabAnalysis['patterns'] = [];
  const na = get('sodium');
  const k = get('potassium');
  const cr = get('creatinine');
  const hgb = get('hemoglobin');
  const alt = get('alt');
  const bili = get('bilirubin');
  const lact = get('lactate');
  const hct = get('hematocrit');
  const naV = cv(na);
  const kV = cv(k);

  if (naV !== null && naV < 130) patterns.push({ titleKa: 'მნიშვნელოვანი ჰიპონატრიემია', detailKa: 'განიხილეთ წამლისმიერი მიზეზი (თიაზიდები, SSRI, კარბამაზეპინი), SIADH, ჰიპოვოლემია და ჰიპოთირეოზი. საჭიროა შრატისა და შარდის ოსმოლალობა და შარდის ნატრიუმი.', severity: naV < 125 ? 'critical' : 'high' });
  if (kV !== null && kV < 3.2) patterns.push({ titleKa: 'ჰიპოკალიემია', detailKa: 'ხშირი მიზეზია მარყუჟოვანი/თიაზიდური დიურეზული საშუალებები. ზრდის არითმიისა და დიგოქსინის ტოქსიკურობის რისკს. საჭიროა მაგნიუმის პარალელური შეფასება.', severity: kV < 3.0 ? 'critical' : 'high' });
  if (kV !== null && kV > 5.5) patterns.push({ titleKa: 'ჰიპერკალიემია', detailKa: 'შეამოწმეთ RAAS-ბლოკატორები, კალიუმშემნახველი დიურეზულები, თირკმლის ფუნქცია და ჰემოლიზი. საჭიროა გადაუდებელი ეკგ.', severity: 'critical' });
  if (cr && hgb && cr.status !== 'normal' && cr.status !== 'unknown' && hgb.status === 'low') patterns.push({ titleKa: 'თირკმლის ფუნქციის დაქვეითება ანემიასთან ერთად', detailKa: 'პატერნი შეესაბამება ქრონიკულ თირკმლის დაავადებას; საჭიროა ფერიტინი, TSAT და დინამიკის შეფასება მწვავე დაზიანების გამოსარიცხად.', severity: 'moderate' });
  if (alt && bili && alt.status === 'high' && bili.status === 'high') patterns.push({ titleKa: 'ჰეპატოცელულური დაზიანება ჰიპერბილირუბინემიით', detailKa: 'შეაფასეთ წამლისმიერი ჰეპატოტოქსიურობა, ვირუსული ჰეპატიტები და ბილიარული ობსტრუქცია; INR და ალბუმინი სინთეზური ფუნქციის შესაფასებლად.', severity: 'high' });
  if (cv(lact) !== null && cv(lact)! >= 4) patterns.push({ titleKa: 'მნიშვნელოვანი ლაქტატის მატება', detailKa: 'განიხილეთ ჰიპოპერფუზია და სეფსისი; საჭიროა დაუყოვნებელი კლინიკური შეფასება და განმეორებითი ლაქტატი.', severity: 'critical' });
  if (cv(hct) !== null && cv(hct)! >= 45 && patient?.pregnant === 'yes') patterns.push({ titleKa: 'ჰემოკონცენტრაცია ორსულობის ფონზე', detailKa: 'ოვარიული სტიმულაციის შემდეგ ჰემატოკრიტის მატება OHSS-ის საეჭვო ნიშანია; საჭიროა სითხის ბალანსის, ალბუმინის და ულტრასონოგრაფიის შეფასება.', severity: 'high' });

  // Trends: per analyte key, on normalised values only (mixed units are comparable after conversion).
  const byKey = new Map<string, { date: string; value: number; label: string; analyte: string }[]>();
  labs.forEach((l, i) => {
    const r = results[i];
    const key = r.key ?? `raw:${l.analyte.toLowerCase()}`;
    const value = r.key ? r.canonicalValue : r.unit === '' || r.unit === l.unit ? l.value : null;
    if (value === null) return;
    byKey.set(key, [...(byKey.get(key) ?? []), { date: l.date, value, label: r.labelKa, analyte: l.analyte }]);
  });
  const trends: LabAnalysis['trends'] = [];
  byKey.forEach((vals) => {
    if (vals.length < 2) return;
    const sorted = [...vals].sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = sorted[0].value;
    const last = sorted[sorted.length - 1].value;
    const deltaPct = first === 0 ? 0 : Math.round(((last - first) / Math.abs(first)) * 100);
    trends.push({ analyte: sorted[0].analyte, labelKa: sorted[0].label, direction: Math.abs(deltaPct) < 10 ? 'stable' : deltaPct > 0 ? 'rising' : 'falling', deltaPct, points: sorted.map((s) => ({ date: s.date, value: s.value })) });
  });

  // Medication-related abnormalities (only on interpretable results).
  const medicationRelated: LabAnalysis['medicationRelated'] = [];
  const meds = (patient?.medications ?? []).map((m) => m.drug.toLowerCase()).join(' ');
  const off = (r?: LabInterpretation) => Boolean(r && r.status !== 'normal' && r.status !== 'unknown');
  if (off(na) && /sertraline|სერტრალინ|furosemide|ფუროსემიდ|tramadol|ტრამადოლ/.test(meds))
    medicationRelated.push({ titleKa: 'ნატრიუმის დარღვევა მედიკამენტების ფონზე', detailKa: 'SSRI, მარყუჟოვანი დიურეზული და ტრამადოლი ჰიპონატრიემიის ცნობილი მიზეზებია — განიხილეთ როგორც წამლისმიერი მიზეზი.' });
  if (off(k) && /furosemide|ფუროსემიდ/.test(meds))
    medicationRelated.push({ titleKa: 'კალიუმის დარღვევა დიურეზულის ფონზე', detailKa: 'მარყუჟოვანი დიურეზული საშუალება იწვევს კალიუმისა და მაგნიუმის დანაკარგს; კომბინაცია დიგოქსინთან ზრდის ტოქსიკურობის რისკს.' });
  if (off(cr) && /ibuprofen|იბუპროფენ/.test(meds))
    medicationRelated.push({ titleKa: 'კრეატინინის მატება NSAID-ის ფონზე', detailKa: 'NSAID ამცირებს თირკმლის პერფუზიას; დიურეზულთან და RAAS-ბლოკატორთან ერთად განსაკუთრებით საშიშია.' });

  const urgent = [
    ...critical.map((c) => `${c.labelKa} ${c.value} ${c.unit} — კრიტიკული მნიშვნელობა`),
    ...patterns.filter((p) => p.severity === 'critical').map((p) => p.titleKa),
  ];

  return { results, abnormal, critical, patterns, trends, medicationRelated, urgent };
}

/**
 * Parses laboratory results from however a clinician actually typed them.
 *
 * Three shapes are supported, because all three turn up in practice:
 *   1. tabular / CSV rows      — "ჰემოგლობინი; 9.8; გ/დლ; 2026-10-01"
 *   2. inline name–value pairs — "Na 128, K 3.1, კრეატინინი 1.2, TSH 8.2"
 *   3. one pair per line       — "eGFR 44"
 *
 * Earlier this only handled shape 1, so the most common input a doctor types —
 * a comma-separated list on one line — silently produced nothing.
 */
const UNIT_RE = /^(მმოლ\/ლ|მკმოლ\/ლ|მგ\/დლ|გ\/დლ|გ\/ლ|ნგ\/მლ|პგ\/მლ|მკგ\/ლ|მიერთ\/ლ|ერთ\/ლ|%|×10\^?\d+\/ლ|mmol\/L|µmol\/L|umol\/L|mg\/dL|g\/dL|g\/L|ng\/mL|pg\/mL|mIU\/L|IU\/L|U\/L|fl|fL|mL\/min(\/1\.73m2)?|მლ\/წთ)$/i;
const DATE_RE = /\d{4}-\d{2}-\d{2}|\d{2}[./]\d{2}[./]\d{4}/;

/** "Na 128", "K: 3.1", "TSH = 8.2 მიერთ/ლ", "ჰემოგლობინი 9.8 გ/დლ" */
const PAIR_RE = /^([\p{L}][\p{L}\p{N}\s./()+-]{0,38}?)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)\s*([^\s,;|]*)\s*$/u;

const HEADER_RE = /^(analyte|test|result|კვლევა|მაჩვენებელი|შედეგი|ანალიზი)$/i;

function pushValue(out: LabValue[], analyteRaw: string, valueRaw: string, unitRaw: string, date: string) {
  const analyte = analyteRaw.replace(/\s+/g, ' ').trim();
  if (!analyte || HEADER_RE.test(analyte)) return;
  // An "analyte" that is only punctuation or a number is a parsing artefact.
  if (!/\p{L}/u.test(analyte)) return;
  const value = Number(valueRaw.replace(',', '.'));
  if (!Number.isFinite(value)) return;
  // An unrecognised unit is kept as written, so the interpreter can refuse it
  // instead of silently assuming the canonical unit. Built-in reference ranges
  // are NOT copied into the value: refLow/refHigh mean the laboratory's own range.
  const unit = unitRaw.trim().replace(/[.,;]$/, '');
  out.push({ id: `parsed-${out.length}`, analyte, value, unit, date });
}

export function parseLabText(text: string): LabValue[] {
  const out: LabValue[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const lineDate = DATE_RE.exec(line)?.[0] ?? '';

    // Shape 1: a delimited row where the analyte sits in its own column.
    const cols = line.split(/[\t;|]+|\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (cols.length >= 2 && !PAIR_RE.test(cols[0])) {
      const numIdx = cols.findIndex((c, i) => i > 0 && /^-?\d+([.,]\d+)?$/.test(c.replace(',', '.')));
      if (numIdx > 0) {
        const unit = cols.slice(numIdx + 1).find((c) => UNIT_RE.test(c)) ?? '';
        pushValue(out, cols[0], cols[numIdx], unit, lineDate);
        continue;
      }
    }

    // Shapes 2 and 3: split on commas/semicolons and read each name–value pair.
    for (const chunk of line.split(/[,;|]+/)) {
      const piece = chunk.trim();
      if (!piece) continue;
      const m = PAIR_RE.exec(piece);
      if (m) {
        pushValue(out, m[1], m[2], m[3] ?? '', lineDate);
        continue;
      }
      // "ჰემოგლობინი 9.8 გ/დლ" — unit carries a space or slash the pair regex rejected.
      const loose = /^([\p{L}][\p{L}\p{N}\s./()+-]{0,38}?)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)\s+(.+)$/u.exec(piece);
      if (loose) pushValue(out, loose[1], loose[2], loose[3], lineDate);
    }
  }

  // Deduplicate on analyte+value: an inline list repeated in a table should not
  // be counted twice and then read as a trend.
  const seen = new Set<string>();
  return out.filter((v) => {
    const key = `${v.analyte.toLowerCase()}|${v.value}|${v.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Lab values written inside prose — "ჰემოგლობინი 9.1", "ჰემოგლობინის დონე 9,1 გ/დლ",
 * "Na 128 და K 3.1". parseLabText expects lists and tables; in a sentence it
 * takes the whole clause as the analyte name. This reads only KNOWN analytes,
 * so a number next to an unknown word is never turned into a result.
 */
export function extractLabsFromProse(text: string): LabValue[] {
  const out: LabValue[] = [];
  const seen = new Set<string>();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const ref of LAB_REFERENCES) {
    for (const name of ref.names) {
      const georgian = /[ა-ჰ]/.test(name);
      // Georgian nouns decline: "ჰემოგლობინი" → "ჰემოგლობინის". Match on the stem.
      const stem = georgian ? esc(name.replace(/ი$/, '')) + '[ა-ჰ]{0,4}' : esc(name);
      // Very short Latin symbols (Na, K, Ca) only count as a standalone token.
      const left = georgian ? '(?<![ა-ჰ])' : '(?<![A-Za-z0-9])';
      const right = georgian ? '' : '(?![A-Za-z])';
      const re = new RegExp(`${left}${stem}${right}(?:\\s+(?:დონე|მაჩვენებელი|არის|იყო))?\\s*[:=]?\\s*(-?\\d+(?:[.,]\\d+)?)\\s*(\\S*)`, georgian ? 'g' : 'gi');
      for (const m of text.matchAll(re)) {
        if (!georgian && name.length < 3 && !/^[A-Z][a-z]?$/.test(m[0].slice(0, name.length))) continue;
        const value = Number(m[1].replace(',', '.'));
        if (!Number.isFinite(value) || seen.has(ref.key)) continue;
        seen.add(ref.key);
        const unitRaw = m[2].replace(/[.,;]$/, '');
        // Without a unit in the prose the unit stays empty: the interpreter
        // infers it only when the value fits exactly one accepted unit, and says so.
        out.push({ id: `prose-${out.length}`, analyte: ref.labelKa, value, unit: UNIT_RE.test(unitRaw) ? unitRaw : '', date: '' });
      }
    }
  }
  return out;
}
