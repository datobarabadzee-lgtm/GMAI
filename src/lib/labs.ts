import type { LabValue, PatientContext } from '@/schemas/clinical';

/** LABORATORY INTELLIGENCE — deterministic reference ranges, pattern and trend detection. */

export type LabRef = { key: string; names: string[]; unit: string; low: number; high: number; criticalLow?: number; criticalHigh?: number; labelKa: string };

export const LAB_REFERENCES: LabRef[] = [
  { key: 'sodium', names: ['sodium', 'na', 'ნატრიუმი'], unit: 'მმოლ/ლ', low: 135, high: 145, criticalLow: 125, criticalHigh: 155, labelKa: 'ნატრიუმი' },
  { key: 'potassium', names: ['potassium', 'k', 'კალიუმი'], unit: 'მმოლ/ლ', low: 3.5, high: 5.1, criticalLow: 2.8, criticalHigh: 6.0, labelKa: 'კალიუმი' },
  { key: 'creatinine', names: ['creatinine', 'კრეატინინი'], unit: 'მგ/დლ', low: 0.6, high: 1.2, criticalHigh: 3.0, labelKa: 'კრეატინინი' },
  { key: 'urea', names: ['urea', 'bun', 'შარდოვანა'], unit: 'მმოლ/ლ', low: 2.5, high: 7.1, criticalHigh: 25, labelKa: 'შარდოვანა' },
  { key: 'hemoglobin', names: ['hemoglobin', 'hgb', 'ჰემოგლობინი'], unit: 'გ/დლ', low: 12, high: 16, criticalLow: 7, labelKa: 'ჰემოგლობინი' },
  { key: 'hematocrit', names: ['hematocrit', 'hct', 'ჰემატოკრიტი'], unit: '%', low: 36, high: 46, criticalHigh: 55, labelKa: 'ჰემატოკრიტი' },
  { key: 'platelets', names: ['platelets', 'plt', 'თრომბოციტები'], unit: '×10⁹/ლ', low: 150, high: 400, criticalLow: 50, labelKa: 'თრომბოციტები' },
  { key: 'wbc', names: ['wbc', 'leukocytes', 'ლეიკოციტები'], unit: '×10⁹/ლ', low: 4, high: 10, criticalLow: 1, criticalHigh: 30, labelKa: 'ლეიკოციტები' },
  { key: 'glucose', names: ['glucose', 'გლუკოზა'], unit: 'მმოლ/ლ', low: 3.9, high: 5.6, criticalLow: 2.8, criticalHigh: 25, labelKa: 'გლუკოზა' },
  { key: 'hba1c', names: ['hba1c', 'ჰბა1ც'], unit: '%', low: 4, high: 5.7, criticalHigh: 12, labelKa: 'HbA1c' },
  { key: 'alt', names: ['alt', 'sgpt', 'ალტ'], unit: 'ერთ/ლ', low: 7, high: 45, criticalHigh: 500, labelKa: 'ALT' },
  { key: 'ast', names: ['ast', 'sgot', 'ასტ'], unit: 'ერთ/ლ', low: 8, high: 40, criticalHigh: 500, labelKa: 'AST' },
  { key: 'bilirubin', names: ['bilirubin', 'ბილირუბინი'], unit: 'მგ/დლ', low: 0.2, high: 1.2, criticalHigh: 10, labelKa: 'ბილირუბინი' },
  { key: 'albumin', names: ['albumin', 'ალბუმინი'], unit: 'გ/დლ', low: 3.5, high: 5.0, criticalLow: 2.0, labelKa: 'ალბუმინი' },
  { key: 'inr', names: ['inr'], unit: '', low: 0.8, high: 1.2, criticalHigh: 5, labelKa: 'INR' },
  { key: 'crp', names: ['crp', 'ცრპ'], unit: 'მგ/ლ', low: 0, high: 5, criticalHigh: 200, labelKa: 'CRP' },
  { key: 'tsh', names: ['tsh'], unit: 'მიერთ/ლ', low: 0.4, high: 4.0, criticalHigh: 50, labelKa: 'TSH' },
  { key: 'calcium', names: ['calcium', 'ca', 'კალციუმი'], unit: 'მგ/დლ', low: 8.5, high: 10.5, criticalLow: 7, criticalHigh: 13, labelKa: 'კალციუმი' },
  { key: 'ldl', names: ['ldl'], unit: 'მმოლ/ლ', low: 0, high: 2.6, labelKa: 'LDL ქოლესტერინი' },
  { key: 'lactate', names: ['lactate', 'ლაქტატი'], unit: 'მმოლ/ლ', low: 0.5, high: 2.0, criticalHigh: 4, labelKa: 'ლაქტატი' },
  { key: 'b12', names: ['vitamin b12', 'b12'], unit: 'პმოლ/ლ', low: 150, high: 700, labelKa: 'ვიტამინი B12' },
  { key: 'troponin', names: ['troponin', 'ტროპონინი'], unit: 'ნგ/ლ', low: 0, high: 14, criticalHigh: 100, labelKa: 'ტროპონინი' },
];

export const findRef = (analyte: string): LabRef | undefined => {
  const a = analyte.toLowerCase().trim();
  return LAB_REFERENCES.find((r) => r.names.some((n) => a === n || a.includes(n)));
};

export type LabInterpretation = {
  analyte: string;
  labelKa: string;
  value: number;
  unit: string;
  status: 'critical_low' | 'low' | 'normal' | 'high' | 'critical_high' | 'unknown';
  refText: string;
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

export function interpretLabs(labs: LabValue[], patient?: PatientContext): LabAnalysis {
  const results: LabInterpretation[] = labs.map((l) => {
    const ref = findRef(l.analyte);
    const low = l.refLow ?? ref?.low;
    const high = l.refHigh ?? ref?.high;
    let status: LabInterpretation['status'] = 'unknown';
    if (low !== undefined && high !== undefined) {
      if (ref?.criticalLow !== undefined && l.value <= ref.criticalLow) status = 'critical_low';
      else if (ref?.criticalHigh !== undefined && l.value >= ref.criticalHigh) status = 'critical_high';
      else if (l.value < low) status = 'low';
      else if (l.value > high) status = 'high';
      else status = 'normal';
    }
    const noteKa =
      status === 'critical_low' || status === 'critical_high'
        ? 'კრიტიკული მნიშვნელობა — საჭიროა დაუყოვნებელი კლინიკური რეაგირება და შედეგის დადასტურება.'
        : status === 'low'
          ? 'რეფერენსზე დაბალი.'
          : status === 'high'
            ? 'რეფერენსზე მაღალი.'
            : status === 'normal'
              ? 'რეფერენსის ფარგლებში.'
              : 'რეფერენსული დიაპაზონი ვერ დადგინდა — შედეგი ინტერპრეტირდეს ლაბორატორიის ბლანკის მიხედვით.';
    return { analyte: l.analyte, labelKa: ref?.labelKa ?? l.analyte, value: l.value, unit: l.unit || ref?.unit || '', status, refText: low !== undefined && high !== undefined ? `${low}–${high}` : '—', noteKa };
  });

  const abnormal = results.filter((r) => r.status !== 'normal' && r.status !== 'unknown');
  const critical = results.filter((r) => r.status === 'critical_low' || r.status === 'critical_high');

  const get = (key: string) => {
    const ref = LAB_REFERENCES.find((r) => r.key === key);
    if (!ref) return undefined;
    return results.find((r) => ref.names.some((n) => r.analyte.toLowerCase().includes(n)));
  };

  const patterns: LabAnalysis['patterns'] = [];
  const na = get('sodium');
  const k = get('potassium');
  const cr = get('creatinine');
  const hgb = get('hemoglobin');
  const alt = get('alt');
  const bili = get('bilirubin');
  const lact = get('lactate');
  const hct = get('hematocrit');

  if (na && na.value < 130) patterns.push({ titleKa: 'მნიშვნელოვანი ჰიპონატრიემია', detailKa: 'განიხილეთ წამლისმიერი მიზეზი (თიაზიდები, SSRI, კარბამაზეპინი), SIADH, ჰიპოვოლემია და ჰიპოთირეოზი. საჭიროა შრატისა და შარდის ოსმოლალობა და შარდის ნატრიუმი.', severity: na.value < 125 ? 'critical' : 'high' });
  if (k && k.value < 3.2) patterns.push({ titleKa: 'ჰიპოკალიემია', detailKa: 'ხშირი მიზეზია მარყუჟოვანი/თიაზიდური დიურეზული საშუალებები. ზრდის არითმიისა და დიგოქსინის ტოქსიკურობის რისკს. საჭიროა მაგნიუმის პარალელური შეფასება.', severity: k.value < 3.0 ? 'critical' : 'high' });
  if (k && k.value > 5.5) patterns.push({ titleKa: 'ჰიპერკალიემია', detailKa: 'შეამოწმეთ RAAS-ბლოკატორები, კალიუმშემნახველი დიურეზულები, თირკმლის ფუნქცია და ჰემოლიზი. საჭიროა გადაუდებელი ეკგ.', severity: 'critical' });
  if (cr && hgb && cr.status !== 'normal' && hgb.status === 'low') patterns.push({ titleKa: 'თირკმლის ფუნქციის დაქვეითება ანემიასთან ერთად', detailKa: 'პატერნი შეესაბამება ქრონიკულ თირკმლის დაავადებას; საჭიროა ფერიტინი, TSAT და დინამიკის შეფასება მწვავე დაზიანების გამოსარიცხად.', severity: 'moderate' });
  if (alt && bili && alt.status === 'high' && bili.status === 'high') patterns.push({ titleKa: 'ჰეპატოცელულური დაზიანება ჰიპერბილირუბინემიით', detailKa: 'შეაფასეთ წამლისმიერი ჰეპატოტოქსიურობა, ვირუსული ჰეპატიტები და ბილიარული ობსტრუქცია; INR და ალბუმინი სინთეზური ფუნქციის შესაფასებლად.', severity: 'high' });
  if (lact && lact.value >= 4) patterns.push({ titleKa: 'მნიშვნელოვანი ლაქტატის მატება', detailKa: 'განიხილეთ ჰიპოპერფუზია და სეფსისი; საჭიროა დაუყოვნებელი კლინიკური შეფასება და განმეორებითი ლაქტატი.', severity: 'critical' });
  if (hct && hct.value >= 45 && patient?.pregnant === 'yes') patterns.push({ titleKa: 'ჰემოკონცენტრაცია ორსულობის ფონზე', detailKa: 'ოვარიული სტიმულაციის შემდეგ ჰემატოკრიტის მატება OHSS-ის საეჭვო ნიშანია; საჭიროა სითხის ბალანსის, ალბუმინის და ულტრასონოგრაფიის შეფასება.', severity: 'high' });

  // Trends
  const byAnalyte = new Map<string, LabValue[]>();
  labs.forEach((l) => byAnalyte.set(l.analyte, [...(byAnalyte.get(l.analyte) ?? []), l]));
  const trends: LabAnalysis['trends'] = [];
  byAnalyte.forEach((vals, analyte) => {
    if (vals.length < 2) return;
    const sorted = [...vals].sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = sorted[0].value;
    const last = sorted[sorted.length - 1].value;
    const deltaPct = first === 0 ? 0 : Math.round(((last - first) / Math.abs(first)) * 100);
    trends.push({
      analyte,
      labelKa: findRef(analyte)?.labelKa ?? analyte,
      direction: Math.abs(deltaPct) < 10 ? 'stable' : deltaPct > 0 ? 'rising' : 'falling',
      deltaPct,
      points: sorted.map((s) => ({ date: s.date, value: s.value })),
    });
  });

  // Medication-related abnormalities
  const medicationRelated: LabAnalysis['medicationRelated'] = [];
  const meds = (patient?.medications ?? []).map((m) => m.drug.toLowerCase()).join(' ');
  if (na && na.status !== 'normal' && /sertraline|სერტრალინ|furosemide|ფუროსემიდ|tramadol|ტრამადოლ/.test(meds))
    medicationRelated.push({ titleKa: 'ნატრიუმის დარღვევა მედიკამენტების ფონზე', detailKa: 'SSRI, მარყუჟოვანი დიურეზული და ტრამადოლი ჰიპონატრიემიის ცნობილი მიზეზებია — განიხილეთ როგორც წამლისმიერი მიზეზი.' });
  if (k && k.status !== 'normal' && /furosemide|ფუროსემიდ/.test(meds))
    medicationRelated.push({ titleKa: 'კალიუმის დარღვევა დიურეზულის ფონზე', detailKa: 'მარყუჟოვანი დიურეზული საშუალება იწვევს კალიუმისა და მაგნიუმის დანაკარგს; კომბინაცია დიგოქსინთან ზრდის ტოქსიკურობის რისკს.' });
  if (cr && cr.status !== 'normal' && /ibuprofen|იბუპროფენ/.test(meds))
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
  const unit = UNIT_RE.test(unitRaw.trim()) ? unitRaw.trim() : '';
  const ref = findRef(analyte);
  out.push({
    id: `parsed-${out.length}`,
    analyte,
    value,
    unit,
    date,
    refLow: ref?.low,
    refHigh: ref?.high,
  });
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
        out.push({ id: `prose-${out.length}`, analyte: ref.labelKa, value, unit: UNIT_RE.test(unitRaw) ? unitRaw : ref.unit, date: '', refLow: ref.low, refHigh: ref.high });
      }
    }
  }
  return out;
}
