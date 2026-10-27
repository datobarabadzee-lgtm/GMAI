/**
 * SCHEDULE — the single source for the calendar view, the .ics file and the
 * Google Calendar links, so the three can never disagree.
 *
 * Rules:
 *  - a test that is due or overdue appears on the date the person planned; if
 *    no date was planned it is listed as "to schedule", never silently placed;
 *  - a test that is up to date appears on its next due date and then repeats at
 *    its own interval, stopping after the last age the rule still covers;
 *  - all dates are calendar dates in the person's own time zone (no UTC drift).
 */
import { addMonthsIso } from './engine';
import type { PreventionPlan } from './types';

type Plan = Extract<PreventionPlan, { kind: 'PLAN' }>;

export type ScheduleEvent = {
  key: string;
  group: string;
  kind: 'screening' | 'vaccine';
  titleKa: string;
  shortKa: string;
  icon: string;
  date: string;
  /** This occurrence is a repeat of the first one (not separately planned). */
  repeat: boolean;
  status: 'planned' | 'next' | 'repeat';
  intervalMonths?: number;
  /** Last date a repeat may fall on (birthday of the stop age + 1 year − 1 day, approximated by year end). */
  until?: string;
  detailKa: string;
};

export type Unscheduled = { group: string; titleKa: string; shortKa: string; icon: string; overdue: boolean };

/** Today as YYYY-MM-DD in the device's own time zone. */
export function localToday(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysIso(d: string, days: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** Year end of the year in which the person turns `stopAge + 1`, i.e. the rule no longer applies after it. */
function untilFor(today: string, age: number, stopAge?: number): string | undefined {
  if (stopAge === undefined) return undefined;
  const year = Number(today.slice(0, 4)) + (stopAge - age);
  return `${year}-12-31`;
}

export function buildSchedule(
  plan: Plan,
  today: string,
  planned: Record<string, string> = {},
  horizonYears = 10,
): { events: ScheduleEvent[]; unscheduled: Unscheduled[] } {
  const horizon = `${Number(today.slice(0, 4)) + horizonYears}-12-31`;
  const events: ScheduleEvent[] = [];
  const unscheduled: Unscheduled[] = [];

  for (const s of plan.screening) {
    if (s.status === 'not_needed' || s.status === 'needs_data') continue;
    const until = untilFor(today, plan.ageYears, s.stopAge);
    const limit = until && until < horizon ? until : horizon;
    let first: string | undefined;
    let status: ScheduleEvent['status'] = 'next';
    if (s.status === 'due' || s.status === 'overdue' || s.status === 'discuss') {
      first = planned[s.group];
      status = 'planned';
      if (!first) {
        if (s.status !== 'discuss') unscheduled.push({ group: s.group, titleKa: s.titleKa, shortKa: s.shortKa, icon: s.icon, overdue: s.status === 'overdue' });
        continue;
      }
    } else if (s.status === 'up_to_date') {
      first = planned[s.group] ?? s.nextDue;
      status = planned[s.group] ? 'planned' : 'next';
    }
    if (!first || first > limit) continue;
    const detailKa = `${s.titleKa}. ${s.frequencyKa}.`;
    events.push({ key: `${s.group}:${first}`, group: s.group, kind: 'screening', titleKa: s.titleKa, shortKa: s.shortKa, icon: s.icon, date: first, repeat: false, status, intervalMonths: s.intervalMonths, until, detailKa });
    if (s.intervalMonths) {
      let d = addMonthsIso(first, s.intervalMonths);
      while (d <= limit) {
        events.push({ key: `${s.group}:${d}`, group: s.group, kind: 'screening', titleKa: s.titleKa, shortKa: s.shortKa, icon: s.icon, date: d, repeat: true, status: 'repeat', intervalMonths: s.intervalMonths, until, detailKa });
        d = addMonthsIso(d, s.intervalMonths);
      }
    }
  }

  // Influenza: every season (Northern Hemisphere). A planned date wins; else the season's start
  // (1 October) or, while a season is running (October–March), one week from today.
  const flu = plan.vaccines.find((v) => v.id === 'influenza');
  if (flu) {
    const y = Number(today.slice(0, 4));
    const m = Number(today.slice(5, 7));
    const inSeason = m >= 10 || m <= 3;
    const firstFlu = planned['vaccine:influenza'] ?? (flu.status === 'up_to_date' && flu.nextDue ? `${flu.nextDue.slice(0, 4)}-10-01` : inSeason ? addDaysIso(today, 7) : `${y}-10-01`);
    const nextSeason = (d: string) => `${Number(d.slice(0, 4)) + (Number(d.slice(5, 7)) >= 10 ? 1 : 0)}-10-01`;
    let d = firstFlu;
    let repeat = false;
    while (d <= horizon) {
      events.push({ key: `flu:${d}`, group: 'vaccine:influenza', kind: 'vaccine', titleKa: 'გრიპის ვაქცინა', shortKa: 'გრიპის ვაქცინა', icon: 'syringe', date: d, repeat, status: repeat ? 'repeat' : planned['vaccine:influenza'] ? 'planned' : 'next', intervalMonths: 12, detailKa: flu.frequencyKa });
      d = nextSeason(d);
      repeat = true;
    }
  }
  const td = plan.vaccines.find((v) => v.id === 'td');
  if (td) {
    const d = planned['vaccine:td'] ?? td.nextDue;
    if (d && d <= horizon) events.push({ key: `td:${d}`, group: 'vaccine:td', kind: 'vaccine', titleKa: td.titleKa, shortKa: 'ტეტანუსი (Td)', icon: 'syringe', date: d, repeat: false, status: planned['vaccine:td'] ? 'planned' : 'next', intervalMonths: 120, detailKa: td.frequencyKa });
    else if (!d && td.status === 'recommended') unscheduled.push({ group: 'vaccine:td', titleKa: td.titleKa, shortKa: 'ტეტანუსი (Td)', icon: 'syringe', overdue: false });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.shortKa.localeCompare(b.shortKa));
  return { events, unscheduled };
}

/* ── calendar exports ─────────────────────────────────────────────────── */

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 60) {
    out.push(rest.slice(0, 60));
    rest = ` ${rest.slice(60)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}
const compact = (iso: string) => iso.replace(/-/g, '');

export function rrule(e: Pick<ScheduleEvent, 'intervalMonths' | 'until'>): string | null {
  if (!e.intervalMonths) return null;
  const base = e.intervalMonths % 12 === 0 ? `FREQ=YEARLY;INTERVAL=${e.intervalMonths / 12}` : `FREQ=MONTHLY;INTERVAL=${e.intervalMonths}`;
  return e.until ? `${base};UNTIL=${compact(e.until)}` : `${base};COUNT=${Math.max(1, Math.ceil(120 / e.intervalMonths))}`;
}

export type ReminderLead = 1 | 7 | 14;

/**
 * One VEVENT per series: the first occurrence carries an RRULE, so a phone
 * calendar shows every repeat and stops by itself at the age limit.
 */
export function buildIcsFromSchedule(events: ScheduleEvent[], today: string, leadDays: ReminderLead = 7): { ics: string; count: number } {
  const stamp = `${compact(today)}T000000Z`;
  // One series per group. If the second occurrence does not follow the first by exactly the
  // interval (e.g. a flu shot this November, then every 1 October), the first is a single event
  // and the series starts at the second.
  const series: { e: ScheduleEvent; recurring: boolean }[] = [];
  const byGroup = new Map<string, ScheduleEvent[]>();
  for (const e of events) byGroup.set(e.group, [...(byGroup.get(e.group) ?? []), e]);
  for (const list of byGroup.values()) {
    const [first, second] = list;
    if (second && first.intervalMonths && second.date !== addMonthsIso(first.date, first.intervalMonths)) {
      series.push({ e: first, recurring: false }, { e: second, recurring: true });
    } else series.push({ e: first, recurring: list.length > 1 || Boolean(first.intervalMonths) });
  }
  const blocks = series.map(({ e, recurring }) => {
    const rule = recurring ? rrule(e) : null;
    return [
      'BEGIN:VEVENT',
      `UID:gmai-prev-${e.group.replace(/[^a-z0-9]/gi, '-')}-${compact(e.date)}@leadermed`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`,
      `DTEND;VALUE=DATE:${compact(addDaysIso(e.date, 1))}`,
      ...(rule ? [`RRULE:${rule}`] : []),
      fold(`SUMMARY:${esc(`${e.shortKa} — პრევენციის გეგმა`)}`),
      fold(`DESCRIPTION:${esc(e.detailKa)}`),
      'BEGIN:VALARM',
      `TRIGGER:-P${leadDays}D`,
      'ACTION:DISPLAY',
      fold(`DESCRIPTION:${esc(`${leadDays === 1 ? 'ხვალ' : `${leadDays} დღეში`}: ${e.shortKa}`)}`),
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n');
  });
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LeaderMed//GMAI Prevention//KA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:ჩემი პრევენცია', ...blocks, 'END:VCALENDAR'].join('\r\n');
  return { ics, count: blocks.length };
}

/** Google Calendar "add event" link for one series (all-day, with its repeat rule). */
export function googleCalendarUrl(e: ScheduleEvent): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${e.shortKa} — პრევენციის გეგმა`,
    dates: `${compact(e.date)}/${compact(addDaysIso(e.date, 1))}`,
    details: e.detailKa,
  });
  const rule = rrule(e);
  if (rule && !e.repeat) p.set('recur', `RRULE:${rule}`);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
