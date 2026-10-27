/**
 * PREGNANCY — dating, the antenatal calendar and weight gain.
 *
 * Pure functions on calendar dates (YYYY-MM-DD, no time zone), so the page,
 * the tests and the .ics file always agree. Every number below is the one its
 * source publishes; the source id sits next to it.
 */
import { addDaysIso, type CalendarLabels, type ScheduleEvent } from '@/prevention/schedule';

const DAY = 86_400_000;
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/* ── dating ──────────────────────────────────────────────────────────────
 * acog_edd_2017 (Committee Opinion 700): EDD = LMP + 280 days; ovulation to
 * delivery is 266 days, so after IVF the EDD is the transfer date + 266 − the
 * embryo's age (day-5 embryo: + 261, day-3 embryo: + 263).
 * A cycle longer or shorter than 28 days moves ovulation, and the EDD with it,
 * by the same number of days (the same 266-day rule applied to ovulation).
 */
export type DatingInput =
  | { method: 'lmp'; lmp: string; cycleDays?: number }
  | { method: 'conception'; date: string }
  | { method: 'ivf'; transfer: string; embryoDay: 3 | 5 }
  | { method: 'ultrasound'; scanDate: string; gaWeeks: number; gaDays: number };

export function dueDate(i: DatingInput): string {
  switch (i.method) {
    case 'lmp':
      return addDaysIso(i.lmp, 280 + ((i.cycleDays ?? 28) - 28));
    case 'conception':
      return addDaysIso(i.date, 266);
    case 'ivf':
      return addDaysIso(i.transfer, 266 - i.embryoDay);
    case 'ultrasound':
      return addDaysIso(i.scanDate, 280 - (i.gaWeeks * 7 + i.gaDays));
  }
}

/** Gestational age on a date, counted from the EDD (40+0 = EDD). */
export function gestationalAge(edd: string, on: string): { totalDays: number; weeks: number; days: number } {
  const totalDays = 280 - daysBetween(on, edd);
  return { totalDays, weeks: Math.floor(totalDays / 7), days: ((totalDays % 7) + 7) % 7 };
}

export const gaLabel = (totalDays: number) => `${Math.floor(totalDays / 7)}+${totalDays % 7}`;

/** 1st: up to 13+6, 2nd: 14+0 – 27+6, 3rd: from 28+0. */
export const trimesterOf = (totalDays: number): 1 | 2 | 3 => (totalDays < 98 ? 1 : totalDays < 196 ? 2 : 3);

/**
 * acog_edd_2017, Table 1: redate to the ultrasound when it differs from the
 * LMP dating by more than the threshold for the gestational age at the scan.
 */
export function redatingThreshold(usGaDays: number): number {
  if (usGaDays <= 62) return 5; // ≤ 8+6 (CRL)
  if (usGaDays <= 111) return 7; // 9+0 – 15+6
  if (usGaDays <= 153) return 10; // 16+0 – 21+6
  if (usGaDays <= 195) return 14; // 22+0 – 27+6
  return 21; // ≥ 28+0
}

export function compareDating(lmp: string, scanDate: string, gaWeeks: number, gaDays: number) {
  const lmpEdd = dueDate({ method: 'lmp', lmp });
  const usEdd = dueDate({ method: 'ultrasound', scanDate, gaWeeks, gaDays });
  const usGa = gaWeeks * 7 + gaDays;
  const diffDays = Math.abs(daysBetween(lmpEdd, usEdd));
  const threshold = redatingThreshold(usGa);
  const useUltrasound = diffDays > threshold;
  return { lmpEdd, usEdd, diffDays, threshold, useUltrasound, edd: useUltrasound ? usEdd : lmpEdd, suboptimal: usGa >= 154 };
}

/* ── antenatal calendar ─────────────────────────────────────────────────── */

export type PrenatalKind = 'visit' | 'scan' | 'test' | 'vaccine' | 'discuss' | 'birth';

export type PrenatalItem = {
  id: string;
  kind: PrenatalKind;
  titleKa: string;
  /** Window in days of gestation (from the LMP-equivalent date). */
  fromDay: number;
  toDay: number;
  detailKa: string;
  sources: string[];
  /** Shown only for Rh-negative or unknown blood group. */
  rhOnly?: boolean;
};

const w = (weeks: number, days = 0) => weeks * 7 + days;

export const PRENATAL_ITEMS: PrenatalItem[] = [
  {
    id: 'booking', kind: 'visit', titleKa: 'პირველი ვიზიტი და ანალიზები', fromDay: 0, toDay: w(10),
    detailKa: 'რაც შეიძლება ადრე, 10 კვირამდე. სისხლის ჯგუფი, Rh-ფაქტორი და ანტისხეულები; აივ, სიფილისი, B ჰეპატიტი (HBsAg) — ყოველ ორსულობაზე; შარდის კულტურა (უსიმპტომო ბაქტერიურია).',
    sources: ['nice_ng201', 'uspstf_rh_2004', 'uspstf_hiv_2019', 'uspstf_syphilis_preg_2025', 'uspstf_hbv_preg_2019', 'uspstf_bacteriuria_2019'],
  },
  {
    id: 'scan-11-14', kind: 'scan', titleKa: 'ექოსკოპია 11–14 კვირაზე და სკრინინგი', fromDay: w(11, 2), toDay: w(14, 1),
    detailKa: 'ზუსტდება ვადა და ნაყოფების რაოდენობა. თუ სურვილი გაქვთ, კეთდება ქრომოსომული დარღვევების სკრინინგი (კომბინირებული ტესტი ან უჯრედგარეშე DNA) — ტესტი ყველას უნდა შესთავაზონ, გადაწყვეტილება თქვენია.',
    sources: ['nice_ng201', 'acog_chromosomal_2020'],
  },
  {
    id: 'aspirin', kind: 'discuss', titleKa: 'პრეეკლამფსიის რისკი — ასპირინი?', fromDay: w(12), toDay: w(12),
    detailKa: 'თუ პრეეკლამფსიის მაღალი რისკი გაქვთ (მაგ., წინა ორსულობაში პრეეკლამფსია, ტყუპი, ქრონიკული წნევა, დიაბეტი, თირკმლის ან აუტოიმუნური დაავადება), ექიმი 12 კვირის შემდეგ დაბალი დოზის ასპირინს დაგინიშნავთ. თვითნებურად არ დაიწყოთ.',
    sources: ['uspstf_aspirin_pe_2021'],
  },
  {
    id: 'scan-anomaly', kind: 'scan', titleKa: 'ანატომიური ექოსკოპია', fromDay: w(18), toDay: w(20, 6),
    detailKa: 'ნაყოფის განვითარების დეტალური შემოწმება და პლაცენტის მდებარეობა.',
    sources: ['nice_ng201'],
  },
  {
    id: 'gdm', kind: 'test', titleKa: 'გესტაციური დიაბეტის ტესტი (OGTT)', fromDay: w(24), toDay: w(28),
    detailKa: 'გლუკოზის დატვირთვის ტესტი 24–28 კვირაზე. თუ დიაბეტის რისკი მაღალია, ექიმი ადრეულ შემოწმებასაც გირჩევთ.',
    sources: ['uspstf_gdm_2021', 'ada_2025'],
  },
  {
    id: 'rh-antibody', kind: 'test', titleKa: 'Rh-ანტისხეულების განმეორებითი ტესტი', fromDay: w(24), toDay: w(28), rhOnly: true,
    detailKa: 'Rh-უარყოფითი დედისთვის, თუ ბავშვის მამა Rh-უარყოფითი არ არის.',
    sources: ['uspstf_rh_2004'],
  },
  {
    id: 'tdap', kind: 'vaccine', titleKa: 'ყივანახველას ვაქცინა (Tdap)', fromDay: w(27), toDay: w(36, 6),
    detailKa: '27–36 კვირაზე, სასურველია ამ შუალედის დასაწყისში, ყოველ ორსულობაზე. იცავს ახალშობილს პირველ თვეებში.',
    sources: ['cdc_tdap_preg'],
  },
  {
    id: 'w28', kind: 'test', titleKa: 'ვიზიტი 28 კვირაზე', fromDay: w(28), toDay: w(28, 6),
    detailKa: 'სისხლის საერთო ანალიზი, სისხლის ჯგუფი და ანტისხეულები.',
    sources: ['nice_ng201'],
  },
  {
    id: 'anti-d', kind: 'vaccine', titleKa: 'ანტი-D პროფილაქტიკა', fromDay: w(28), toDay: w(28, 6), rhOnly: true,
    detailKa: 'Rh-უარყოფით, არასენსიბილიზებულ დედას 28 კვირაზე სთავაზობენ ანტი-D იმუნოგლობულინს.',
    sources: ['nice_ng201', 'acog_rh_2017'],
  },
  {
    id: 'rsv', kind: 'vaccine', titleKa: 'RSV-ის ვაქცინა (სეზონზე)', fromDay: w(32), toDay: w(36, 6),
    detailKa: '32–36 კვირაზე, თუ ეს პერიოდი სექტემბერ–იანვარს ემთხვევა. ალტერნატივაა ახალშობილისთვის ანტისხეულის (ნირსევიმაბი) გაკეთება — განიხილეთ ექიმთან.',
    sources: ['cdc_rsv_infants'],
  },
  {
    id: 'gbs', kind: 'test', titleKa: 'B ჯგუფის სტრეპტოკოკის ნაცხი', fromDay: w(36), toDay: w(37, 6),
    detailKa: 'ვაგინალურ-რექტალური ნაცხი. დადებითის შემთხვევაში მშობიარობისას ანტიბიოტიკი იცავს ახალშობილს.',
    sources: ['acog_gbs_2020'],
  },
  {
    id: 'w38', kind: 'discuss', titleKa: 'საუბარი ვადაგადაცილებაზე', fromDay: w(38), toDay: w(38, 6),
    detailKa: '38 კვირიდან ექიმთან ერთად განიხილეთ, რა ხდება, თუ მშობიარობა ვადაზე არ დაიწყო.',
    sources: ['nice_ng201'],
  },
  {
    id: 'edd', kind: 'birth', titleKa: 'მშობიარობის სავარაუდო თარიღი', fromDay: w(40), toDay: w(40),
    detailKa: '40+0 კვირა. ეს სავარაუდო თარიღია და არა ზუსტი დღე.',
    sources: ['acog_edd_2017'],
  },
];

export type PrenatalEvent = PrenatalItem & { date: string; endDate: string; state: 'done' | 'now' | 'next' };

export type RhStatus = 'positive' | 'negative' | 'unknown';

/** RSV season for the maternal vaccine: September – January (cdc_rsv_infants). */
const inRsvSeason = (iso: string) => {
  const m = Number(iso.slice(5, 7));
  return m >= 9 || m === 1;
};

export function prenatalCalendar(edd: string, today: string, rh: RhStatus = 'unknown'): PrenatalEvent[] {
  const start = addDaysIso(edd, -280);
  const out: PrenatalEvent[] = [];
  for (const it of PRENATAL_ITEMS) {
    if (it.rhOnly && rh === 'positive') continue;
    const date = addDaysIso(start, it.fromDay);
    const endDate = addDaysIso(start, it.toDay);
    if (it.id === 'rsv') {
      // keep only if some day of the window falls in the season; start on the first such day
      let d = date;
      while (d <= endDate && !inRsvSeason(d)) d = addDaysIso(d, 1);
      if (d > endDate) continue;
      out.push({ ...it, date: d, endDate, state: endDate < today ? 'done' : d <= today ? 'now' : 'next' });
      continue;
    }
    out.push({ ...it, date, endDate, state: endDate < today ? 'done' : date <= today ? 'now' : 'next' });
  }
  // Influenza: any trimester during the season (who_flu_2022). Offered once, on the first season day
  // between today (or the pregnancy start) and the EDD.
  let d = today > start ? today : start;
  while (d <= edd && !(Number(d.slice(5, 7)) >= 10 || Number(d.slice(5, 7)) <= 3)) d = addDaysIso(d, 1);
  if (d <= edd) {
    const ga = daysBetween(start, d);
    out.push({
      id: 'flu', kind: 'vaccine', titleKa: 'გრიპის ვაქცინა', fromDay: ga, toDay: ga, date: d, endDate: d, state: d <= today ? 'now' : 'next',
      detailKa: 'გრიპის სეზონზე ორსულობის ნებისმიერ ტრიმესტრში. ორსული გრიპის ვაქცინაციის პრიორიტეტული ჯგუფია.',
      sources: ['who_flu_2022'],
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.fromDay - b.fromDay);
}

export const PREGNANCY_LABELS: CalendarLabels = { calName: 'ჩემი ორსულობა', suffix: 'ორსულობის კალენდარი', uid: 'gmai-preg' };

export const windowKa = (e: Pick<PrenatalItem, 'fromDay' | 'toDay'>) => (e.fromDay === e.toDay ? `${gaLabel(e.fromDay)} კვირა` : `${gaLabel(e.fromDay)} – ${gaLabel(e.toDay)} კვირა`);

/** Calendar entries for what is still ahead; a window already open is placed on today. */
export function toScheduleEvents(events: PrenatalEvent[], today: string): ScheduleEvent[] {
  return events
    .filter((e) => e.state !== 'done')
    .map((e) => {
      const date = e.date < today ? today : e.date;
      return { key: `preg:${e.id}:${date}`, group: `preg:${e.id}`, kind: 'screening', titleKa: e.titleKa, shortKa: e.titleKa, icon: 'calendar', date, repeat: false, status: 'next', detailKa: `${windowKa(e)}. ${e.detailKa}` };
    });
}

/* ── weight gain ─────────────────────────────────────────────────────────
 * iom_gwg_2009 / cdc_gwg: total gain by BMI before pregnancy. Twins: no
 * recommendation for underweight (ask the doctor).
 */
export type GwgBand = 'under' | 'normal' | 'over' | 'obese';
export const bmiBand = (bmi: number): GwgBand => (bmi < 18.5 ? 'under' : bmi < 25 ? 'normal' : bmi < 30 ? 'over' : 'obese');

const GWG: Record<'single' | 'twins', Record<GwgBand, [number, number] | null>> = {
  single: { under: [12.5, 18], normal: [11.5, 16], over: [7, 11.5], obese: [5, 9] },
  twins: { under: null, normal: [17, 25], over: [14, 23], obese: [11, 19] },
};

export function weightGainRange(bmiBefore: number, twins = false): { band: GwgBand; minKg: number; maxKg: number } | { band: GwgBand; minKg: null; maxKg: null } {
  const band = bmiBand(bmiBefore);
  const r = GWG[twins ? 'twins' : 'single'][band];
  return r ? { band, minKg: r[0], maxKg: r[1] } : { band, minKg: null, maxKg: null };
}
