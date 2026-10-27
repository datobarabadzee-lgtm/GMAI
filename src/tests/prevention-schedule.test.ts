import { describe, expect, it } from 'vitest';
import { buildPlan } from '@/prevention/engine';
import { buildIcsFromSchedule, buildSchedule, googleCalendarUrl, localToday, rrule } from '@/prevention/schedule';
import type { PreventionInput, PreventionPlan } from '@/prevention/types';

const TODAY = '2026-10-27';
const plan = (i: PreventionInput, today = TODAY) => {
  const p = buildPlan(i, today);
  if (p.kind !== 'PLAN') throw new Error(p.kind);
  return p as Extract<PreventionPlan, { kind: 'PLAN' }>;
};

describe('prevention schedule', () => {
  it('uses the device calendar date, not UTC', () => {
    // 01:30 on 28 October in Tbilisi (UTC+4) is still 27 October in UTC.
    const d = new Date(2026, 9, 28, 1, 30);
    expect(localToday(d)).toBe('2026-10-28');
  });

  it('never places a due test on an invented date: it goes to "to schedule" until planned', () => {
    const p = plan({ age: 50, sex: 'female' });
    const s = buildSchedule(p, TODAY);
    expect(s.unscheduled.map((u) => u.group)).toContain('breast');
    expect(s.events.find((e) => e.group === 'breast')).toBeUndefined();
    const planned = buildSchedule(p, TODAY, { breast: '2026-11-15' });
    const first = planned.events.find((e) => e.group === 'breast')!;
    expect(first.date).toBe('2026-11-15');
    expect(first.status).toBe('planned');
    expect(planned.unscheduled.map((u) => u.group)).not.toContain('breast');
  });

  it('repeats mammography every 2 years and stops after age 74', () => {
    const p = plan({ age: 70, sex: 'female', lastDone: { breast: '2026-01-10' } });
    const dates = buildSchedule(p, TODAY).events.filter((e) => e.group === 'breast').map((e) => e.date);
    // 70 in 2026 → turns 74 in 2030; series runs to the end of 2030.
    expect(dates).toEqual(['2028-01-10', '2030-01-10']);
  });

  it('builds RRULEs: yearly with UNTIL at the age limit, monthly when not a whole number of years', () => {
    expect(rrule({ intervalMonths: 24, until: '2030-12-31' })).toBe('FREQ=YEARLY;INTERVAL=2;UNTIL=20301231');
    expect(rrule({ intervalMonths: 18 })).toBe('FREQ=MONTHLY;INTERVAL=18;COUNT=7');
    expect(rrule({})).toBeNull();
  });

  it('flu: this season one week from today, then every 1 October', () => {
    const p = plan({ age: 40, sex: 'male' });
    const flu = buildSchedule(p, TODAY).events.filter((e) => e.group === 'vaccine:influenza').map((e) => e.date);
    expect(flu[0]).toBe('2026-11-03');
    expect(flu[1]).toBe('2027-10-01');
    expect(flu[2]).toBe('2028-10-01');
    const may = buildSchedule(plan({ age: 40, sex: 'male' }, '2026-05-10'), '2026-05-10').events.filter((e) => e.group === 'vaccine:influenza');
    expect(may[0].date).toBe('2026-10-01');
  });

  it('ICS: valid calendar, one VEVENT per series, alarm lead time, CRLF line ends', () => {
    const p = plan({ age: 52, sex: 'female', lastDone: { breast: '2025-11-01', bp: '2026-03-01' } });
    const s = buildSchedule(p, TODAY, { crc: '2026-11-20' });
    const { ics, count } = buildIcsFromSchedule(s.events, TODAY, 14);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR')).toBe(true);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(count);
    expect(ics).toContain('TRIGGER:-P14D');
    expect(ics).toContain('DTSTART;VALUE=DATE:20271101');
    expect(ics).toContain('RRULE:FREQ=YEARLY;INTERVAL=2;UNTIL=20481231');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261120');
    // Flu: a single event this season plus a yearly series from 1 October.
    expect(ics).toContain('DTSTART;VALUE=DATE:20261103');
    expect(ics).toMatch(/DTSTART;VALUE=DATE:20271001\r\nDTEND;VALUE=DATE:20271002\r\nRRULE:FREQ=YEARLY;INTERVAL=1/);
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });

  it('Google Calendar link carries the all-day dates and the repeat rule', () => {
    const p = plan({ age: 52, sex: 'female', lastDone: { breast: '2025-11-01' } });
    const e = buildSchedule(p, TODAY).events.find((x) => x.group === 'breast')!;
    const u = new URL(googleCalendarUrl(e));
    expect(u.hostname).toBe('calendar.google.com');
    expect(u.searchParams.get('dates')).toBe('20271101/20271102');
    expect(u.searchParams.get('recur')).toBe('RRULE:FREQ=YEARLY;INTERVAL=2;UNTIL=20481231');
  });
});
