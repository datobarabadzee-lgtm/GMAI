/**
 * PREVENTION ENGINE — a pure function from what the person told us to their plan.
 *
 * Deterministic and versioned: the same input and the same date always give the
 * same plan, and every recommendation on it comes from a rule file with a
 * named source. Nothing here calls a network or a model. A missing answer is
 * reported as missing (`needs_data`), never assumed to be normal.
 */
import screeningRules from './rules/screening.json';
import vaccineRules from './rules/vaccines.json';
import preconceptionRules from './rules/preconception.json';
import lowValueRules from './rules/low-value.json';
import lifestyleRules from './rules/lifestyle.json';
import warningRules from './rules/warnings.json';
import sourceTable from './rules/sources.json';
import { score2, score2Band, SCORE2_BAND_KA, mgdlToMmolChol } from './risk/score2';
import { findriscPoints, findriscBand } from './risk/findrisc';
import type {
  GoalItem, LowValueItem, PlanItem, PreconceptionItem, PreventionInput, PreventionPlan, RedFlag, RiskResult,
  ScreeningStatus, Source, VaccineItem, VaccineId, WarningCard,
} from './types';

export const RULES_VERSION = [
  screeningRules.version, vaccineRules.version, preconceptionRules.version, lowValueRules.version,
  lifestyleRules.version, warningRules.version,
].join('+');

const SOURCES = sourceTable as Record<string, Source>;

export function sourcesFor(ids: string[]): Source[] {
  return ids.map((id) => {
    const s = SOURCES[id];
    if (!s) throw new Error(`prevention: unknown source id ${id}`);
    return s;
  });
}

/* ── dates ─────────────────────────────────────────────────────────────── */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function parseIso(d?: string): Date | null {
  if (!d || !ISO.test(d)) return null;
  const t = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(t.getTime()) ? null : t;
}

export function addMonthsIso(d: string, months: number): string {
  const t = parseIso(d)!;
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth() + months;
  const target = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(t.getUTCDate(), lastDay));
  return target.toISOString().slice(0, 10);
}

/* ── derived values ────────────────────────────────────────────────────── */

type Tri = true | false | 'unknown';

export function bmiOf(i: PreventionInput): number | null {
  if (!i.heightCm || !i.weightKg || i.heightCm < 100 || i.heightCm > 250 || i.weightKg < 25 || i.weightKg > 350) return null;
  const m = i.heightCm / 100;
  return Math.round((i.weightKg / (m * m)) * 10) / 10;
}

function cholMmol(v: number | undefined, unit: PreventionInput['cholUnit']): number | null {
  if (v === undefined || !(v > 0)) return null;
  return unit === 'mg/dL' ? mgdlToMmolChol(v) : v;
}

function glucoseMgdl(i: PreventionInput): number | null {
  if (i.glucoseFasting === undefined || !(i.glucoseFasting > 0)) return null;
  return i.glucoseUnit === 'mmol/L' ? i.glucoseFasting * 18 : i.glucoseFasting;
}

function predicates(i: PreventionInput, age: number, todayYear: number): Record<string, Tri> {
  const bmi = bmiOf(i);
  const smoke = i.smoking;
  let lung: Tri;
  if (!smoke) lung = 'unknown';
  else if (smoke === 'never') lung = false;
  else if (i.packYears === undefined) lung = 'unknown';
  else if (i.packYears < 20) lung = false;
  else if (smoke === 'current') lung = true;
  else if (i.quitYear === undefined) lung = 'unknown';
  else lung = todayYear - i.quitYear <= 15;
  const post: Tri = i.postmenopausal === undefined ? 'unknown' : i.postmenopausal;
  return {
    bmi_ge_25: bmi === null ? 'unknown' : bmi >= 25,
    lung_smoking: lung,
    ever_smoker: !smoke ? 'unknown' : smoke !== 'never',
    current_smoker: smoke === 'current',
    postmenopausal: post,
    cv_risk_age: i.sex === 'male' ? age >= 40 : age >= 50 || post === true,
  };
}

const MISSING_KA: Record<string, string> = {
  bmi_ge_25: 'სიმაღლე და წონა',
  lung_smoking: 'მოწევის ისტორია (კოლოფ-წლები და, თუ თავი დაანებეთ, რომელ წელს)',
  ever_smoker: 'მოწევის სტატუსი',
  postmenopausal: 'მენოპაუზის სტატუსი',
};

/* ── screening ─────────────────────────────────────────────────────────── */

type ScreeningRule = (typeof screeningRules.rules)[number];

const SEX_MATCH = (ruleSex: string, sex: string) => ruleSex === 'any' || ruleSex === sex;

function statusFor(rule: ScreeningRule, last: string | undefined, today: string): { status: ScreeningStatus; nextDue?: string } {
  if (rule.verdict === 'shared') return { status: 'discuss' };
  // Asked at a routine visit (two questions), not booked as a test.
  if ((rule.interval as { kind: string }).kind === 'visit' && !last) return { status: 'discuss' };
  const iv = rule.interval as { kind: string; months?: number };
  if (!last) return { status: 'due' };
  if (iv.kind === 'fixed' && iv.months) {
    const next = addMonthsIso(last, iv.months);
    return { status: next <= today ? 'overdue' : 'up_to_date', nextDue: next };
  }
  return { status: 'up_to_date' };
}

function buildScreening(i: PreventionInput, age: number, today: string, preds: Record<string, Tri>): PlanItem[] {
  const sex = i.sex!;
  const groups = [...new Set(screeningRules.rules.map((r) => r.group))];
  const out: PlanItem[] = [];
  for (const group of groups) {
    const rules = screeningRules.rules.filter((r) => r.group === group);
    const ageSex = rules.filter((r) => SEX_MATCH(r.sex, sex) && age >= r.ageMin && age <= r.ageMax);
    let chosen: ScreeningRule | null = null;
    let unknown: string[] = [];
    for (const r of ageSex) {
      const vals = r.requires.map((p) => [p, preds[p]] as const);
      if (vals.some(([, v]) => v === false)) continue;
      const unk = vals.filter(([, v]) => v === 'unknown').map(([p]) => MISSING_KA[p] ?? p);
      if (unk.length) {
        if (!chosen) unknown = unk;
        continue;
      }
      chosen = r;
      unknown = [];
      break;
    }
    const last = i.lastDone?.[group];
    if (chosen) {
      const computed = statusFor(chosen, last, today);
      let status = computed.status;
      const nextDue = computed.nextDue;
      let reasonKa = reasonFor(chosen, sex, age);
      if (i.pregnant && ['breast', 'lung', 'osteo', 'aaa', 'crc'].includes(group) && status !== 'up_to_date') {
        status = 'discuss';
        reasonKa = 'ორსულობისას ამ კვლევის დრო ექიმთან ერთად განისაზღვრება.';
      }
      out.push(item(chosen, status, reasonKa, last, nextDue));
      continue;
    }
    if (unknown.length) {
      const r = ageSex[0];
      out.push({ ...item(r, 'needs_data', 'შეიძლება გეხებოდეთ — შეავსეთ მონაცემები, რომ ზუსტად განისაზღვროს.', last), missingKa: unknown });
      continue;
    }
    // Explicit recommendations against (USPSTF D and similar) for this age and sex.
    const against = screeningRules.against.find((a) => a.group === group && SEX_MATCH(a.sex, sex) && age >= a.ageMin && age <= a.ageMax);
    if (against) {
      out.push({
        id: against.id, group, titleKa: against.titleKa, shortKa: rules[0].shortKa, icon: rules[0].icon, status: 'not_needed',
        frequencyKa: '—', reasonKa: against.reasonKa, whyKa: against.reasonKa, sources: sourcesFor(against.sources), reviewStatus: 'DRAFT',
      });
      continue;
    }
    // Same sex, another age: say when it starts or why it stopped. Other-sex rules are not listed at all.
    const sameSex = rules.filter((r) => SEX_MATCH(r.sex, sex));
    if (!sameSex.length) continue;
    const r = sameSex[0];
    const minAge = Math.min(...sameSex.map((x) => x.ageMin));
    const reasonKa =
      ageSex.length && ageSex.every((x) => x.requires.some((p) => preds[p] === false))
        ? notMetReason(ageSex[0])
        : age < minAge
          ? `თქვენს ასაკში ჯერ არ არის საჭირო — იწყება ${minAge} წლიდან.`
          : 'თქვენს ასაკში აღარ არის რეკომენდებული.';
    out.push({ ...item(r, 'not_needed', reasonKa, last), nextDue: undefined });
  }
  return addFamilyHistory(out, i, age);
}

function notMetReason(r: ScreeningRule): string {
  if (r.requires.includes('lung_smoking')) return 'გეხებათ მხოლოდ მძიმე მოწევის ისტორიისას (≥20 კოლოფ-წელი, ამჟამად ან ბოლო 15 წელიწადში).';
  if (r.requires.includes('bmi_ge_25')) return 'რეკომენდებულია ჭარბი წონისას; თქვენი BMI ნორმის ფარგლებშია.';
  if (r.requires.includes('ever_smoker')) return 'რეკომენდებულია მწეველ ან ოდესმე მწეველ მამაკაცებში.';
  if (r.requires.includes('cv_risk_age')) return 'ქალებში სისტემური შეფასება 50 წლიდან ან მენოპაუზის შემდეგ იწყება.';
  if (r.requires.includes('current_smoker')) return 'არ ეწევით — შესანიშნავია.';
  return 'თქვენთვის ამჟამად არ არის საჭირო.';
}

function reasonFor(r: ScreeningRule, sex: string, age: number): string {
  const who = r.sex === 'female' ? 'ქალი' : r.sex === 'male' ? 'მამაკაცი' : '';
  const range = r.ageMax >= 120 ? `${r.ageMin}+ წელი` : `${r.ageMin}–${r.ageMax} წელი`;
  const extra = r.requires.includes('lung_smoking')
    ? ', მოწევის ისტორია ≥20 კოლოფ-წელი'
    : r.requires.includes('bmi_ge_25')
      ? ', ჭარბი წონა'
      : r.requires.includes('ever_smoker')
        ? ', ოდესმე მწეველი'
        : r.requires.includes('postmenopausal')
          ? ', მენოპაუზის შემდეგ'
          : '';
  void sex;
  void age;
  return `გეხებათ: ${who ? `${who}, ` : ''}${range}${extra}.`;
}

function item(r: ScreeningRule, status: ScreeningStatus, reasonKa: string, last?: string, nextDue?: string): PlanItem {
  const iv = r.interval as { kind: string; months?: number };
  return {
    id: r.id, group: r.group, titleKa: r.titleKa, shortKa: r.shortKa, icon: r.icon, status,
    frequencyKa: r.frequencyKa, reasonKa, whyKa: r.whyKa, howKa: (r as { howKa?: string }).howKa,
    lastDone: last, nextDue, intervalMonths: iv.kind === 'fixed' ? iv.months : undefined,
    sources: sourcesFor(r.sources), reviewStatus: r.reviewStatus as PlanItem['reviewStatus'],
  };
}

function addFamilyHistory(items: PlanItem[], i: PreventionInput, age: number): PlanItem[] {
  const out = [...items];
  const crc = out.find((x) => x.group === 'crc');
  if (i.family?.colorectalCancer && crc && crc.status === 'not_needed' && age >= 18 && age < 45) {
    Object.assign(crc, {
      status: 'discuss' as const,
      reasonKa: 'ოჯახში იყო მსხვილი ნაწლავის კიბო: სკრინინგი ხშირად უფრო ადრე იწყება, ვიდრე 45 წლიდან — ვადა და მეთოდი განსაზღვრეთ ექიმთან.',
    });
  }
  if (i.family?.breastOrOvarianCancer) {
    out.push({
      id: 'brca-risk', group: 'brca', titleKa: 'გენეტიკური რისკის შეფასება (BRCA)', shortKa: 'გენეტიკური რისკი', icon: 'dna',
      status: 'discuss', frequencyKa: 'ერთჯერადი შეფასება ექიმთან',
      reasonKa: 'ოჯახში იყო სარძევე ჯირკვლის ან საკვერცხის კიბო.',
      whyKa: 'ოჯახური ანამნეზისას ექიმი აფასებს, საჭიროა თუ არა გენეტიკური კონსულტაცია და ტესტირება. ეს ცვლის სკრინინგის დაწყების ასაკს და მეთოდს.',
      sources: sourcesFor(['uspstf_brca_2019']), reviewStatus: 'DRAFT',
    });
  }
  return out;
}

/* ── risk calculators ──────────────────────────────────────────────────── */

function buildRisks(i: PreventionInput, age: number): RiskResult[] {
  const out: RiskResult[] = [];
  const sex = i.sex!;
  const bmi = bmiOf(i);
  const conditions = new Set(i.conditions ?? []);

  // BMI
  if (bmi === null) {
    out.push({ id: 'bmi', titleKa: 'სხეულის მასის ინდექსი (BMI)', available: false, summaryKa: 'შეიყვანეთ სიმაღლე და წონა.', missingKa: ['სიმაღლე', 'წონა'], sources: sourcesFor(['who_obesity']) });
  } else {
    const [band, bandKa] =
      bmi < 18.5 ? (['moderate', 'წონის ნაკლებობა'] as const) : bmi < 25 ? (['low', 'ნორმა'] as const) : bmi < 30 ? (['moderate', 'ჭარბი წონა'] as const) : (['high', 'სიმსუქნე'] as const);
    out.push({ id: 'bmi', titleKa: 'სხეულის მასის ინდექსი (BMI)', available: true, value: bmi, unitKa: 'კგ/მ²', band, bandKa, summaryKa: `BMI ${bmi} — ${bandKa}.`, sources: sourcesFor(['who_obesity']) });
  }

  // Waist
  if (!i.waistCm) {
    out.push({ id: 'waist', titleKa: 'წელის გარშემოწერილობა', available: false, summaryKa: 'გაზომეთ წელი ჭიპის დონეზე.', missingKa: ['წელის გარშემოწერილობა'], sources: sourcesFor(['who_waist_2008']) });
  } else {
    const [mid, hi] = sex === 'male' ? [94, 102] : [80, 88];
    const band = i.waistCm >= hi ? 'high' : i.waistCm >= mid ? 'moderate' : 'low';
    const bandKa = band === 'high' ? 'მნიშვნელოვნად გაზრდილი რისკი' : band === 'moderate' ? 'გაზრდილი რისკი' : 'ნორმა';
    out.push({ id: 'waist', titleKa: 'წელის გარშემოწერილობა', available: true, value: i.waistCm, unitKa: 'სმ', band, bandKa, summaryKa: `${i.waistCm} სმ — ${bandKa} (ზღვრები: ${mid} და ${hi} სმ).`, sources: sourcesFor(['who_waist_2008']) });
  }

  // Blood pressure (ESC 2024 categories)
  if (!i.systolicBp) {
    out.push({ id: 'bp', titleKa: 'არტერიული წნევა', available: false, summaryKa: 'შეიყვანეთ ბოლო გაზომვის შედეგი.', missingKa: ['არტერიული წნევა'], sources: sourcesFor(['esc_htn_2024']) });
  } else {
    const s = i.systolicBp;
    const d = i.diastolicBp ?? 0;
    let band: RiskResult['band'];
    let bandKa: string;
    if (s >= 180 || d >= 110) [band, bandKa] = ['very_high', 'ძალიან მაღალი — ექიმს დღესვე მიმართეთ'];
    else if (s >= 140 || d >= 90) [band, bandKa] = ['high', 'ჰიპერტენზიის დონე — საჭიროებს დადასტურებას და ექიმს'];
    else if (s >= 120 || d >= 70) [band, bandKa] = ['moderate', 'მომატებული წნევა'];
    else [band, bandKa] = ['low', 'ნორმა'];
    out.push({ id: 'bp', titleKa: 'არტერიული წნევა', available: true, value: s, unitKa: 'მმ ვწყ. სვ.', band, bandKa, summaryKa: `${s}${i.diastolicBp ? `/${i.diastolicBp}` : ''} — ${bandKa}.`, sources: sourcesFor(['esc_htn_2024']) });
  }

  // Glycaemia (ADA 2025)
  const g = glucoseMgdl(i);
  const a1c = i.hba1c;
  if (g === null && a1c === undefined) {
    out.push({ id: 'glycaemia', titleKa: 'სისხლში შაქარი', available: false, summaryKa: 'შეიყვანეთ უზმოზე გლუკოზა ან HbA1c, თუ იცით.', missingKa: ['გლუკოზა ან HbA1c'], sources: sourcesFor(['ada_2025']) });
  } else {
    const diab = (g !== null && g >= 126) || (a1c !== undefined && a1c >= 6.5);
    const pre = (g !== null && g >= 100) || (a1c !== undefined && a1c >= 5.7);
    const [band, bandKa] = diab
      ? (['high', 'დიაბეტის დონე — საჭიროებს დადასტურებას ექიმთან'] as const)
      : pre
        ? (['moderate', 'წინადიაბეტი'] as const)
        : (['low', 'ნორმა'] as const);
    const parts = [g !== null ? `გლუკოზა ${Math.round(g)} მგ/დლ` : '', a1c !== undefined ? `HbA1c ${a1c}%` : ''].filter(Boolean).join(', ');
    out.push({ id: 'glycaemia', titleKa: 'სისხლში შაქარი', available: true, value: a1c ?? Math.round(g!), unitKa: a1c !== undefined ? '%' : 'მგ/დლ', band, bandKa, summaryKa: `${parts} — ${bandKa}.`, sources: sourcesFor(['ada_2025']) });
  }
  const labDiabetes = (g !== null && g >= 126) || (a1c !== undefined && a1c >= 6.5);

  // SCORE2 / SCORE2-OP
  const scoreSources = sourcesFor(['score2_2021', 'score2op_2021', 'esc_prev_2021']);
  const excluded = conditions.has('diabetes') || conditions.has('cvd') || conditions.has('ckd') || labDiabetes;
  if (age < 40 || age > 89) {
    out.push({ id: 'score2', titleKa: 'ინფარქტისა და ინსულტის 10-წლიანი რისკი (SCORE2)', available: false, summaryKa: 'SCORE2 40–89 წლის ასაკისთვისაა. ამ ასაკში მთავარია წნევის, წონის და მოწევის კონტროლი.', sources: scoreSources });
  } else if (excluded) {
    out.push({ id: 'score2', titleKa: 'ინფარქტისა და ინსულტის 10-წლიანი რისკი (SCORE2)', available: false, band: 'high', bandKa: 'მაღალი რისკის ჯგუფი', summaryKa: 'დიაბეტის, გულ-სისხლძარღვთა ან თირკმლის ქრონიკული დაავადებისას SCORE2 არ გამოიყენება: ეს უკვე მაღალი რისკის ჯგუფია და რისკს ექიმი აფასებს (მაგ. SCORE2-Diabetes).', sources: scoreSources });
  } else {
    const tc = cholMmol(i.totalChol, i.cholUnit);
    const hdl = cholMmol(i.hdlChol, i.cholUnit);
    const missing = [!i.systolicBp && 'სისტოლური წნევა', tc === null && 'საერთო ქოლესტერინი', hdl === null && 'HDL ქოლესტერინი', !i.smoking && 'მოწევის სტატუსი'].filter(Boolean) as string[];
    if (missing.length) {
      out.push({ id: 'score2', titleKa: 'ინფარქტისა და ინსულტის 10-წლიანი რისკი (SCORE2)', available: false, summaryKa: 'რისკის გამოსათვლელად საჭიროა რამდენიმე მონაცემი.', missingKa: missing, sources: scoreSources });
    } else {
      const base = { age, sex, smoker: i.smoking === 'current', systolicBp: i.systolicBp!, totalChol: tc!, hdlChol: hdl! };
      const risk = score2(base)!;
      const band = score2Band(age, risk);
      const levers: { ka: string; to: number }[] = [];
      if (base.smoker) levers.push({ ka: 'მოწევის შეწყვეტა', to: score2({ ...base, smoker: false })! });
      if (base.systolicBp > 130) levers.push({ ka: 'წნევის 130-მდე დაწევა', to: score2({ ...base, systolicBp: 130 })! });
      const best = levers.sort((a, b) => a.to - b.to)[0];
      out.push({
        id: 'score2', titleKa: 'ინფარქტისა და ინსულტის 10-წლიანი რისკი (SCORE2)', available: true, value: risk, unitKa: '%',
        band: band === 'moderate' ? 'low' : band, bandKa: SCORE2_BAND_KA[band],
        summaryKa: `10 წელიწადში ინფარქტის ან ინსულტის რისკი — ${risk}% (${SCORE2_BAND_KA[band]}). გათვლილია საქართველოსთვის, ESC-ის ძალიან მაღალი რისკის რეგიონის მიხედვით.`,
        leverKa: best && best.to < risk ? `${best.ka} თქვენს რისკს ${risk}%-დან ${best.to}%-მდე ამცირებს.` : undefined,
        leverFrom: best ? risk : undefined, leverTo: best?.to,
        sources: scoreSources,
      });
    }
  }

  // FINDRISC
  const fSources = sourcesFor(['findrisc']);
  if (conditions.has('diabetes') || labDiabetes) {
    out.push({ id: 'findrisc', titleKa: 'დიაბეტის 10-წლიანი რისკი (FINDRISC)', available: false, summaryKa: 'დიაბეტის არსებობისას ან ანალიზით დიაბეტის დონისას FINDRISC აღარ გამოიყენება.', sources: fSources });
  } else {
    const missing = [
      bmi === null && 'სიმაღლე და წონა', !i.waistCm && 'წელის გარშემოწერილობა', i.activeDaily30 === undefined && 'ყოველდღიური აქტივობა',
      i.vegFruitDaily === undefined && 'ხილი და ბოსტნეული', i.everHighGlucose === undefined && 'ოდესმე მაღალი შაქარი', !i.family?.diabetes && 'ოჯახში დიაბეტი',
    ].filter(Boolean) as string[];
    if (missing.length) {
      out.push({ id: 'findrisc', titleKa: 'დიაბეტის 10-წლიანი რისკი (FINDRISC)', available: false, summaryKa: 'უპასუხეთ რამდენიმე მარტივ კითხვას — ანალიზი არ არის საჭირო.', missingKa: missing, sources: fSources });
    } else {
      const pts = findriscPoints({
        age, sex, bmi: bmi!, waistCm: i.waistCm!, activeDaily30: i.activeDaily30!, vegFruitDaily: i.vegFruitDaily!,
        bpMedication: conditions.has('hypertension_treated'), everHighGlucose: i.everHighGlucose!, familyDiabetes: i.family!.diabetes!,
      });
      const b = findriscBand(pts);
      out.push({
        id: 'findrisc', titleKa: 'დიაბეტის 10-წლიანი რისკი (FINDRISC)', available: true, value: pts, unitKa: 'ქულა', band: b.band, bandKa: b.labelKa,
        summaryKa: `${pts} ქულა — ${b.labelKa} რისკი: 10 წელიწადში 2-ტიპის დიაბეტი განუვითარდება ${b.riskKa} ადამიანს.`,
        leverKa: bmi! >= 25 ? 'წონის 5–7%-ით კლება და კვირაში 150 წუთი აქტივობა დიაბეტის რისკს ყველაზე მეტად ამცირებს.' : !i.activeDaily30 ? 'ყოველდღიური 30-წუთიანი აქტივობა თქვენი ქულიდან 2 ქულას აკლებს.' : undefined,
        sources: fSources,
      });
    }
  }
  return out;
}

/* ── vaccines ──────────────────────────────────────────────────────────── */

type VRule = { titleKa: string; frequencyKa: string; reasonKa: string; sources: string[] };
const V = vaccineRules.items as Record<string, VRule>;

function vaccine(id: VaccineItem['id'], status: VaccineItem['status'], noteKa?: string, nextDue?: string): VaccineItem {
  const r = V[id];
  return { id, titleKa: r.titleKa, status, frequencyKa: r.frequencyKa, reasonKa: r.reasonKa, noteKa, nextDue, sources: sourcesFor(r.sources), reviewStatus: 'DRAFT' };
}

function buildVaccines(i: PreventionInput, age: number, today: string): VaccineItem[] {
  const c = new Set(i.conditions ?? []);
  const risk = c.has('diabetes') || c.has('cvd') || c.has('ckd') || c.has('copd_asthma') || c.has('immunosuppression') || c.has('liver');
  const done = (id: VaccineId) => i.vaccines?.[id]?.done === true;
  const last = (id: VaccineId) => i.vaccines?.[id]?.lastDate;
  const out: VaccineItem[] = [];
  const t = parseIso(today)!;
  const seasonStart = `${t.getUTCMonth() >= 8 ? t.getUTCFullYear() : t.getUTCFullYear() - 1}-09-01`;
  const nextSeason = `${Number(seasonStart.slice(0, 4)) + 1}-09-01`;

  // Influenza: every season.
  const fluLast = last('influenza');
  out.push(fluLast && fluLast >= seasonStart ? vaccine('influenza', 'up_to_date', 'ამ სეზონზე გაკეთებულია.', nextSeason) : vaccine('influenza', 'recommended'));

  // Td/Tdap every 10 years.
  const tdLast = last('td');
  if (tdLast) {
    const next = addMonthsIso(tdLast, 120);
    out.push(next > today ? vaccine('td', 'up_to_date', undefined, next) : vaccine('td', 'recommended', 'ბოლო დოზიდან 10 წელი გავიდა.'));
  } else out.push(vaccine('td', done('td') ? 'up_to_date' : 'recommended', done('td') ? undefined : 'თუ ბოლო 10 წელიწადში არ გაგიკეთებიათ.'));

  // Pneumococcal.
  if (done('pneumococcal')) out.push(vaccine('pneumococcal', 'up_to_date'));
  else if (age >= 50) out.push(vaccine('pneumococcal', age >= 65 ? 'recommended' : 'consider', age >= 65 ? undefined : '50–64 წელი: რეკომენდებულია აშშ-ის კალენდრით; ევროპაში ხშირად 65 წლიდან ან რისკისას.'));
  else if (risk || i.smoking === 'current') out.push(vaccine('pneumococcal', 'recommended', 'რეკომენდებულია ქრონიკული დაავადების ან მოწევის გამო.'));

  // HPV.
  if (done('hpv')) out.push(vaccine('hpv', 'up_to_date'));
  else if (age <= 26) out.push(vaccine('hpv', i.pregnant ? 'consider' : 'recommended', i.pregnant ? 'ორსულობისას არ კეთდება — მშობიარობის შემდეგ.' : undefined));
  else if (age <= 45) out.push(vaccine('hpv', 'consider', 'ამ ასაკში სარგებელი ინდივიდუალურია — განიხილეთ ექიმთან.'));

  // Hepatitis B.
  if (done('hepb')) out.push(vaccine('hepb', 'up_to_date'));
  else if (age <= 59) out.push(vaccine('hepb', 'recommended'));
  else out.push(vaccine('hepb', risk ? 'recommended' : 'consider', risk ? 'რეკომენდებულია ქრონიკული დაავადების გამო.' : '60 წლიდან — რისკისას ან სურვილისამებრ.'));

  // MMR — adults born in 1957 or later without evidence of immunity.
  const birthYear = t.getUTCFullYear() - age;
  if (done('mmr')) out.push(vaccine('mmr', 'up_to_date'));
  else if (birthYear >= 1957) out.push(vaccine('mmr', 'consider', i.pregnant ? 'ორსულობისას არ კეთდება — მშობიარობის შემდეგ.' : 'თუ ორი დოზა არ გაქვთ მიღებული — ან ანტისხეულების ანალიზი.'));

  // Zoster.
  if (done('zoster')) out.push(vaccine('zoster', 'up_to_date'));
  else if (age >= 50) out.push(vaccine('zoster', 'recommended'));
  else if (c.has('immunosuppression')) out.push(vaccine('zoster', 'consider', 'იმუნოსუპრესიისას 19 წლიდან — ექიმთან.'));

  // RSV.
  if (done('rsv')) out.push(vaccine('rsv', 'up_to_date'));
  else if (age >= 75) out.push(vaccine('rsv', 'recommended'));
  else if (age >= 50 && risk) out.push(vaccine('rsv', 'consider', 'რეკომენდებულია გაზრდილი რისკისას — ექიმთან.'));

  if (i.pregnant) {
    out.push(vaccine('pregnancy_flu', 'recommended'));
    out.push(vaccine('pregnancy_tdap', 'recommended'));
    out.push(vaccine('pregnancy_rsv', 'consider'));
  }
  return out;
}

/* ── the rest ──────────────────────────────────────────────────────────── */

function buildPreconception(i: PreventionInput, age: number): PreconceptionItem[] | null {
  if (i.sex !== 'female' || !i.planningPregnancy || i.pregnant || age > 55) return null;
  return preconceptionRules.items.map((p) => ({
    id: p.id, titleKa: p.titleKa, textKa: p.textKa, actionKa: (p as { actionKa?: string }).actionKa, link: (p as { link?: string }).link,
    sources: sourcesFor(p.sources), reviewStatus: 'DRAFT',
  }));
}

function buildLowValue(i: PreventionInput, age: number): LowValueItem[] {
  return lowValueRules.items
    .map((x) => ({
      id: x.id, titleKa: x.titleKa, whyNotKa: x.whyNotKa, insteadKa: x.insteadKa || lowValueRules.insteadDefaultKa,
      relevant: x.who === 'all' || (x.who === 'age60' && age >= 60) || (x.who === 'male70' && i.sex === 'male' && age >= 70),
      registryId: (x as { registryIds?: string[] }).registryIds?.[0],
      sources: sourcesFor(x.sources), reviewStatus: 'DRAFT' as const,
    }))
    .filter((x) => x.relevant);
}

function buildGoals(i: PreventionInput, age: number, risks: RiskResult[], preds: Record<string, Tri>): GoalItem[] {
  const c = new Set(i.conditions ?? []);
  const score = risks.find((r) => r.id === 'score2');
  const bp = risks.find((r) => r.id === 'bp');
  const fired = (trigger: string) => {
    switch (trigger) {
      case 'always': return true;
      case 'current_smoker': return preds.current_smoker === true;
      case 'bmi_ge_25': return preds.bmi_ge_25 === true;
      case 'age65': return age >= 65;
      case 'bp_or_cv': return (bp?.band && bp.band !== 'low') || c.has('cvd') || c.has('hypertension_treated') || score?.band === 'high' || score?.band === 'very_high';
      default: return false;
    }
  };
  return lifestyleRules.goals
    .filter((g) => fired(g.trigger))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3)
    .map((g) => ({ id: g.id, titleKa: g.titleKa, targetKa: g.targetKa, whyKa: g.whyKa, stepsKa: g.stepsKa, sources: sourcesFor(g.sources), reviewStatus: 'DRAFT' as const }));
}

function buildWarnings(): WarningCard[] {
  return warningRules.cards.map((w) => ({ id: w.id, titleKa: w.titleKa, signsKa: w.signsKa, actionKa: w.actionKa, call112: w.call112, sources: sourcesFor(w.sources) }));
}

export const RED_FLAGS: RedFlag[] = warningRules.redFlags as RedFlag[];

/* ── entry point ───────────────────────────────────────────────────────── */

export function buildPlan(input: PreventionInput, today: string): PreventionPlan {
  if (!ISO.test(today)) throw new Error('buildPlan: today must be YYYY-MM-DD');
  const flags = (input.redFlags ?? []).map((id) => RED_FLAGS.find((f) => f.id === id)).filter(Boolean) as RedFlag[];
  if (flags.length) {
    return { kind: 'RED_FLAG_STOP', flags, emergency: flags.some((f) => f.level === 'emergency'), rulesVersion: RULES_VERSION };
  }

  const missing: string[] = [];
  const age = input.age;
  if (age === undefined || !Number.isFinite(age)) missing.push('ასაკი');
  else if (age < 18 || age > 110) missing.push('ასაკი 18-დან 110 წლამდე (მოდული მოზრდილებისთვისაა)');
  if (!input.sex) missing.push('სქესი');
  if (missing.length) return { kind: 'NEEDS_PATIENT_DATA', missingKa: missing, rulesVersion: RULES_VERSION };

  const a = Math.floor(age!);
  const preds = predicates(input, a, Number(today.slice(0, 4)));
  const screening = buildScreening(input, a, today, preds);
  const risks = buildRisks(input, a);
  const vaccines = buildVaccines(input, a, today);
  const preconception = buildPreconception(input, a);
  const lowValue = buildLowValue(input, a);
  const goals = buildGoals(input, a, risks, preds);

  const overall = new Set<string>();
  screening.forEach((s) => s.missingKa?.forEach((m) => overall.add(m)));
  risks.forEach((r) => r.missingKa?.forEach((m) => overall.add(m)));

  const counts = {
    due: screening.filter((s) => s.status === 'due').length,
    overdue: screening.filter((s) => s.status === 'overdue').length,
    upToDate: screening.filter((s) => s.status === 'up_to_date').length,
    discuss: screening.filter((s) => s.status === 'discuss').length,
    needsData: screening.filter((s) => s.status === 'needs_data').length,
  };

  return {
    kind: 'PLAN', rulesVersion: RULES_VERSION, generatedFor: today, ageYears: a, sex: input.sex!,
    screening, risks, vaccines, preconception, lowValue, goals, warnings: buildWarnings(),
    missingKa: [...overall], counts,
  };
}
