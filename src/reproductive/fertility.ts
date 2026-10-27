/**
 * FERTILITY — the calendar estimate of the fertile window, time to pregnancy
 * and when to see a doctor. Every figure is the one its source publishes.
 */
import { addDaysIso } from '@/prevention/schedule';

/* ── fertile window ──────────────────────────────────────────────────────
 * wilcox_1995: conception happens only from intercourse in the six days that
 * end on the day of ovulation (probability ≈ 0.10 five days before, ≈ 0.33 on
 * the day itself). The calendar method places ovulation 14 days before the next
 * period. wilcox_2000: in only ~30% of women is the window entirely within
 * days 10–17 — the estimate is a guide, not a guarantee.
 */
export type Cycle = { periodStart: string; periodEnd: string; fertileStart: string; ovulation: string; nextPeriod: string };

export function fertileWindows(lastPeriod: string, cycleDays: number, periodDays: number, count = 3): Cycle[] {
  const out: Cycle[] = [];
  let start = lastPeriod;
  for (let i = 0; i < count; i++) {
    const nextPeriod = addDaysIso(start, cycleDays);
    const ovulation = addDaysIso(nextPeriod, -14);
    out.push({ periodStart: start, periodEnd: addDaysIso(start, periodDays - 1), fertileStart: addDaysIso(ovulation, -5), ovulation, nextPeriod });
    start = nextPeriod;
  }
  return out;
}

export const CONCEPTION_DAY_FIVE_BEFORE = 0.1;
export const CONCEPTION_OVULATION_DAY = 0.33;
/** Cycles outside 21–35 days are irregular enough that a calendar estimate is unreliable. */
export const regularCycle = (days: number) => days >= 21 && days <= 35;

/* ── time to pregnancy ─────────────────────────────────────────────────────
 * gnoth_2003: cumulative probability of conception with timed intercourse,
 * all couples (n = 340).
 */
export const TIME_TO_PREGNANCY: { cycles: number; pct: number }[] = [
  { cycles: 1, pct: 38 },
  { cycles: 3, pct: 68 },
  { cycles: 6, pct: 81 },
  { cycles: 12, pct: 92 },
];

/* ── when to see a doctor ───────────────────────────────────────────────────
 * asrm_infertility_2020 / acog_age_2022: evaluate after 12 months of trying
 * under 35, after 6 months from 35, and without waiting over 40.
 */
export type SeeDoctor = { now: boolean; afterMonths: number | null; monthsLeft: number };

export function whenToSeeDoctor(age: number, monthsTrying: number): SeeDoctor {
  if (age > 40) return { now: true, afterMonths: null, monthsLeft: 0 };
  const afterMonths = age >= 35 ? 6 : 12;
  return { now: monthsTrying >= afterMonths, afterMonths, monthsLeft: Math.max(0, afterMonths - monthsTrying) };
}
