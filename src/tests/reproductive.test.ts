import { describe, expect, it } from 'vitest';
import { compareDating, dueDate, gestationalAge, prenatalCalendar, PREGNANCY_LABELS, redatingThreshold, toScheduleEvents, trimesterOf, weightGainRange } from '@/reproductive/pregnancy';
import { fertileWindows, whenToSeeDoctor } from '@/reproductive/fertility';
import { buildIcsFromSchedule } from '@/prevention/schedule';
import { sourcesFor } from '@/prevention/engine';
import { PRENATAL_ITEMS } from '@/reproductive/pregnancy';

// Expected dates computed independently (Python datetime), not from this code.
describe('due date (ACOG Committee Opinion 700)', () => {
  it('LMP + 280 days, shifted by cycle length', () => {
    expect(dueDate({ method: 'lmp', lmp: '2026-01-01' })).toBe('2026-10-08');
    expect(dueDate({ method: 'lmp', lmp: '2026-01-01', cycleDays: 32 })).toBe('2026-10-12');
  });
  it('conception + 266, IVF transfer + 266 − embryo age', () => {
    expect(dueDate({ method: 'conception', date: '2026-01-15' })).toBe('2026-10-08');
    expect(dueDate({ method: 'ivf', transfer: '2026-01-20', embryoDay: 5 })).toBe('2026-10-08');
    expect(dueDate({ method: 'ivf', transfer: '2026-01-20', embryoDay: 3 })).toBe('2026-10-10');
  });
  it('ultrasound gestational age on the scan date', () => {
    expect(dueDate({ method: 'ultrasound', scanDate: '2026-03-01', gaWeeks: 8, gaDays: 0 })).toBe('2026-10-11');
  });
  it('gestational age and trimester', () => {
    expect(gestationalAge('2026-10-08', '2026-03-12')).toEqual({ totalDays: 70, weeks: 10, days: 0 });
    expect([trimesterOf(97), trimesterOf(98), trimesterOf(195), trimesterOf(196)]).toEqual([1, 2, 2, 3]);
  });
});

describe('redating thresholds (ACOG CO 700, Table 1)', () => {
  it('uses the published cut-offs', () => {
    expect([62, 63, 111, 112, 153, 154, 195, 196].map(redatingThreshold)).toEqual([5, 7, 7, 10, 10, 14, 14, 21]);
  });
  it('keeps LMP dating within the threshold and redates beyond it', () => {
    const a = compareDating('2026-01-01', '2026-03-01', 8, 6); // 3 days apart, limit 5
    expect(a).toMatchObject({ usEdd: '2026-10-05', diffDays: 3, threshold: 5, useUltrasound: false, edd: '2026-10-08' });
    const b = compareDating('2026-01-01', '2026-03-20', 10, 0); // 8 days apart, limit 7
    expect(b).toMatchObject({ usEdd: '2026-10-16', diffDays: 8, threshold: 7, useUltrasound: true, edd: '2026-10-16' });
  });
});

describe('antenatal calendar', () => {
  const ev = prenatalCalendar('2026-10-08', '2026-01-20', 'positive');
  const by = (id: string) => ev.find((e) => e.id === id);
  it('places each window from the LMP-equivalent date', () => {
    expect(by('scan-11-14')).toMatchObject({ date: '2026-03-21', endDate: '2026-04-10' });
    expect(by('tdap')?.date).toBe('2026-07-09');
    expect(by('gbs')).toMatchObject({ date: '2026-09-10', endDate: '2026-09-23' });
    expect(by('edd')?.date).toBe('2026-10-08');
  });
  it('skips Rh items for Rh-positive and keeps them otherwise', () => {
    expect(by('anti-d')).toBeUndefined();
    expect(prenatalCalendar('2026-10-08', '2026-01-20', 'negative').some((e) => e.id === 'anti-d')).toBe(true);
  });
  it('RSV only in September–January, from the first season day', () => {
    expect(by('rsv')).toMatchObject({ date: '2026-09-01', endDate: '2026-09-16' });
    expect(prenatalCalendar('2026-06-15', '2025-10-01', 'positive').some((e) => e.id === 'rsv')).toBe(false); // window in April–May
  });
  it('flu during the season, otherwise on 1 October before the EDD', () => {
    expect(by('flu')).toMatchObject({ date: '2026-01-20', state: 'now' });
    expect(prenatalCalendar('2026-12-20', '2026-05-01', 'positive').find((e) => e.id === 'flu')?.date).toBe('2026-10-01');
  });
  it('every item cites known sources', () => {
    for (const it of PRENATAL_ITEMS) expect(sourcesFor(it.sources).length).toBeGreaterThan(0);
  });
  it('exports future items to a pregnancy calendar file', () => {
    const { ics, count } = buildIcsFromSchedule(toScheduleEvents(ev, '2026-01-20'), '2026-01-20', 7, PREGNANCY_LABELS);
    expect(count).toBe(ev.filter((e) => e.state !== 'done').length);
    expect(ics).toContain('X-WR-CALNAME:ჩემი ორსულობა');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260321');
    expect(ics).not.toContain('RRULE');
  });
});

describe('fertility', () => {
  it('fertile window: six days ending on ovulation, 14 days before the next period', () => {
    expect(fertileWindows('2026-03-01', 28, 5, 2)).toEqual([
      { periodStart: '2026-03-01', periodEnd: '2026-03-05', fertileStart: '2026-03-10', ovulation: '2026-03-15', nextPeriod: '2026-03-29' },
      { periodStart: '2026-03-29', periodEnd: '2026-04-02', fertileStart: '2026-04-07', ovulation: '2026-04-12', nextPeriod: '2026-04-26' },
    ]);
  });
  it('when to see a doctor by age (ASRM)', () => {
    expect(whenToSeeDoctor(30, 5)).toEqual({ now: false, afterMonths: 12, monthsLeft: 7 });
    expect(whenToSeeDoctor(36, 6)).toEqual({ now: true, afterMonths: 6, monthsLeft: 0 });
    expect(whenToSeeDoctor(41, 0).now).toBe(true);
  });
  it('weight gain ranges (IOM 2009)', () => {
    expect(weightGainRange(22)).toEqual({ band: 'normal', minKg: 11.5, maxKg: 16 });
    expect(weightGainRange(31)).toEqual({ band: 'obese', minKg: 5, maxKg: 9 });
    expect(weightGainRange(27, true)).toEqual({ band: 'over', minKg: 14, maxKg: 23 });
    expect(weightGainRange(17, true).minKg).toBeNull();
  });
});
