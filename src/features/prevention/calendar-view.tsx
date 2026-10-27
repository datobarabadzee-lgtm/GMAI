'use client';

import { useMemo, useState } from 'react';
import { Bell, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, Clock, Download, List, Repeat, Syringe, TriangleAlert, X } from 'lucide-react';
import type { PreventionPlan } from '@/prevention/types';
import { addDaysIso, buildIcsFromSchedule, buildSchedule, googleCalendarUrl, type ReminderLead, type ScheduleEvent } from '@/prevention/schedule';
import { cn } from '@/lib/utils';
import { downloadBlob } from './export';
import { ICONS } from './visuals';

type Plan = Extract<PreventionPlan, { kind: 'PLAN' }>;

const MONTHS = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
const WEEKDAYS = ['ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ', 'კვი'];
const fmt = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}, ${y}`;
};

const EVENT_TONE: Record<ScheduleEvent['status'], string> = {
  planned: 'bg-cyan-brand text-white',
  next: 'bg-clinical-low text-white',
  repeat: 'bg-ink-700 text-slate-200',
};
const EVENT_LABEL: Record<ScheduleEvent['status'], string> = { planned: 'დაგეგმილი', next: 'შემდეგი ვადა', repeat: 'განმეორება' };

function Icon({ name, className }: { name: string; className?: string }) {
  const I = name === 'syringe' ? Syringe : ICONS[name] ?? Clock;
  return <I className={className} />;
}

export function CalendarView({
  plan, today, planned, setPlanned, onDone, lead, setLead,
}: {
  plan: Plan;
  today: string;
  planned: Record<string, string>;
  setPlanned: (group: string, date: string | undefined) => void;
  onDone: (group: string, date: string) => void;
  lead: ReminderLead;
  setLead: (l: ReminderLead) => void;
}) {
  const { events, unscheduled } = useMemo(() => buildSchedule(plan, today, planned), [plan, today, planned]);
  const [mode, setMode] = useState<'month' | 'list'>('month');
  const [cursor, setCursor] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const byDay = useMemo(() => {
    const m = new Map<string, ScheduleEvent[]>();
    for (const e of events) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [events]);

  const upcoming = events.filter((e) => e.date >= today && e.date <= addDaysIso(today, 30));

  const exportAll = () => {
    const { ics, count } = buildIcsFromSchedule(events, today, lead);
    downloadBlob('chemi-prevencia.ics', ics, 'text/calendar;charset=utf-8');
    setMsg(`${count} შეხსენების სერია ჩაიწერა. გახსენით ფაილი — ტელეფონი შემოგთავაზებთ კალენდარში დამატებას. განმეორებები თავისით გაგრძელდება და ასაკის ზღვარზე შეწყდება.`);
  };

  // Month grid (Monday first).
  const [cy, cm] = cursor.split('-').map(Number);
  const firstDow = (new Date(Date.UTC(cy, cm - 1, 1)).getUTCDay() + 6) % 7;
  const daysIn = new Date(Date.UTC(cy, cm, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${cursor}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  const shift = (n: number) => {
    const d = new Date(Date.UTC(cy, cm - 1 + n, 1));
    setCursor(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    setSelected(null);
  };
  const monthCount = events.filter((e) => e.date.startsWith(cursor)).length;
  const nextEvent = events.find((e) => e.date.slice(0, 7) > cursor);

  const [allYears, setAllYears] = useState(false);
  const agendaLimit = `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`;
  const future = events.filter((x) => x.date >= today);
  const shown = allYears ? future : future.filter((x) => !(x.date > agendaLimit));
  const agenda = useMemo(() => {
    const g = new Map<string, ScheduleEvent[]>();
    for (const e of shown) g.set(e.date.slice(0, 7), [...(g.get(e.date.slice(0, 7)) ?? []), e]);
    return [...g.entries()];
  }, [shown]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-full border border-line bg-ink-950 p-1" role="tablist" aria-label="კალენდრის ხედი">
          {(
            [
              ['month', 'თვე', CalendarDays],
              ['list', 'სია', List],
            ] as const
          ).map(([id, label, I]) => (
            <button key={id} role="tab" aria-selected={mode === id} type="button" onClick={() => setMode(id)} className={cn('inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] transition', mode === id ? 'bg-navy text-white dark:bg-cyan-brand' : 'text-slate-400 hover:text-fg')}>
              <I className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-[12.5px] text-slate-400">
            <Bell className="h-4 w-4 text-cyan" /> შემახსენე
            <select value={lead} onChange={(e) => setLead(Number(e.target.value) as ReminderLead)} className="rounded-full border border-line bg-ink-950 px-3 py-1.5 text-[12.5px] text-slate-200">
              <option value={1}>1 დღით ადრე</option>
              <option value={7}>1 კვირით ადრე</option>
              <option value={14}>2 კვირით ადრე</option>
            </select>
          </label>
          <button type="button" onClick={exportAll} className="btn btn-primary !py-2 text-[13px]">
            <Download className="h-4 w-4" /> ყველა შეხსენება (.ics)
          </button>
        </div>
      </div>
      {msg && <p className="rounded-xl bg-clinical-low/10 px-4 py-3 text-[13px] leading-relaxed text-slate-200">{msg}</p>}

      {upcoming.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-cyan/30 bg-cyan/5 px-4 py-3">
          <Bell className="h-4 w-4 text-cyan" />
          <span className="text-[13px] font-medium text-fg">მომდევნო 30 დღეში:</span>
          {upcoming.map((e) => (
            <span key={e.key} className="rounded-full bg-ink-900 px-2.5 py-1 text-[12px] text-slate-200">
              {e.shortKa} · {fmt(e.date)}
            </span>
          ))}
        </div>
      )}

      {/* To schedule */}
      {unscheduled.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13.5px] font-semibold text-fg">დაგეგმეთ — ამ კვლევებს ჯერ თარიღი არ აქვს</p>
          <div className="grid gap-2 md:grid-cols-2">
            {unscheduled.map((u) => (
              <div key={u.group} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-ink-900 px-3.5 py-3">
                <span className="flex items-center gap-2.5">
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', u.overdue ? 'bg-clinical-critical/10 text-clinical-critical' : 'bg-clinical-high/10 text-clinical-high')}>
                  <Icon name={u.icon} className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-fg">{u.shortKa}</span>
                  {u.overdue && (
                    <span className="inline-flex items-center gap-1 text-[11.5px] text-clinical-critical">
                      <TriangleAlert className="h-3 w-3" /> ვადა გავიდა
                    </span>
                  )}
                </span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {[
                    ['1 კვირაში', 7],
                    ['2 კვირაში', 14],
                    ['1 თვეში', 30],
                  ].map(([l, d]) => (
                    <button key={l as string} type="button" onClick={() => setPlanned(u.group, addDaysIso(today, d as number))} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-slate-300 transition hover:border-cyan/60 hover:text-cyan">
                      {l}
                    </button>
                  ))}
                  <input type="date" aria-label={`${u.shortKa} — თარიღი`} min={today} className="rounded-full border border-line bg-ink-950 px-2.5 py-1 text-[12px] text-slate-200" onChange={(e) => e.target.value && setPlanned(u.group, e.target.value)} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'month' ? (
        <div className="panel p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <button type="button" className="btn h-10 w-10 !p-0" aria-label="წინა თვე" onClick={() => shift(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <p className="text-[17px] font-bold text-fg">
                {MONTHS[cm - 1]} {cy}
              </p>
              <p className="text-[11.5px] text-slate-500">{monthCount ? `${monthCount} ჩანაწერი` : 'ამ თვეში ჩანაწერი არ არის'}</p>
              {!monthCount && nextEvent && (
                <button type="button" onClick={() => (setCursor(nextEvent.date.slice(0, 7)), setSelected(nextEvent.date))} className="mt-1 text-[12px] font-medium text-cyan hover:underline">
                  შემდეგი ჩანაწერი: {nextEvent.shortKa}, {fmt(nextEvent.date)} →
                </button>
              )}
            </div>
            <button type="button" className="btn h-10 w-10 !p-0" aria-label="შემდეგი თვე" onClick={() => shift(1)}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const evs = byDay.get(d) ?? [];
              const isToday = d === today;
              const isSel = d === selected;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelected(isSel ? null : d)}
                  aria-label={`${fmt(d)}${evs.length ? ` — ${evs.map((e) => e.shortKa).join(', ')}` : ''}`}
                  className={cn(
                    'flex aspect-square min-h-[44px] flex-col items-center justify-start gap-0.5 rounded-xl border p-1 text-[13px] transition sm:aspect-auto sm:h-20',
                    isSel ? 'border-cyan bg-cyan/10' : 'border-transparent hover:border-line',
                    evs.length && !isSel && 'bg-ink-850',
                  )}
                >
                  <span className={cn('grid h-6 w-6 place-items-center rounded-full tabular-nums', isToday ? 'bg-navy font-bold text-white dark:bg-cyan-brand' : d < today ? 'text-slate-500' : 'text-slate-200')}>{Number(d.slice(8))}</span>
                  <span className="flex flex-wrap justify-center gap-0.5">
                    {evs.slice(0, 3).map((e) => (
                      <span key={e.key} className={cn('grid h-5 w-5 place-items-center rounded-full', EVENT_TONE[e.status])}>
                        <Icon name={e.icon} className="h-3 w-3" />
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11.5px] text-slate-500">
            {(['planned', 'next', 'repeat'] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={cn('h-3 w-3 rounded-full', EVENT_TONE[s])} /> {EVENT_LABEL[s]}
              </span>
            ))}
          </div>
          {selected && (
            <DayPanel
              date={selected}
              events={byDay.get(selected) ?? []}
              today={today}
              onClose={() => setSelected(null)}
              setPlanned={setPlanned}
              onDone={onDone}
            />
          )}
        </div>
      ) : (
        <div className="panel divide-y divide-line">
          {agenda.length === 0 && <p className="p-5 text-[13px] text-slate-400">მომავალი ჩანაწერები ჯერ არ არის — დაგეგმეთ კვლევები ზემოთ.</p>}
          {agenda.map(([month, list]) => (
            <div key={month} className="p-4 sm:p-5">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-cyan">
                {MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}
              </p>
              <ul className="mt-2 space-y-2">
                {list.map((e) => (
                  <EventRow key={e.key} e={e} today={today} setPlanned={setPlanned} onDone={onDone} />
                ))}
              </ul>
            </div>
          ))}
          {future.length > shown.length || allYears ? (
            <div className="p-4 text-center">
              <button type="button" className="btn" onClick={() => setAllYears((v) => !v)}>
                {allYears ? 'მხოლოდ 2 წელი' : `შემდეგი წლები (${future.length - shown.length} ჩანაწერი)`}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DayPanel({ date, events, today, onClose, setPlanned, onDone }: { date: string; events: ScheduleEvent[]; today: string; onClose: () => void; setPlanned: (g: string, d: string | undefined) => void; onDone: (g: string, d: string) => void }) {
  return (
    <div className="mt-4 animate-fade-up rounded-2xl border border-line bg-ink-850 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold text-fg">{fmt(date)}</p>
        <button type="button" onClick={onClose} aria-label="დახურვა" className="text-slate-400 hover:text-fg">
          <X className="h-4 w-4" />
        </button>
      </div>
      {events.length ? (
        <ul className="mt-2 space-y-2">
          {events.map((e) => (
            <EventRow key={e.key} e={e} today={today} setPlanned={setPlanned} onDone={onDone} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-slate-400">ამ დღეს ჩანაწერი არ არის.</p>
      )}
    </div>
  );
}

function EventRow({ e, today, setPlanned, onDone }: { e: ScheduleEvent; today: string; setPlanned: (g: string, d: string | undefined) => void; onDone: (g: string, d: string) => void }) {
  const [moving, setMoving] = useState(false);
  const doneDate = e.date > today ? today : e.date;
  return (
    <li className="flex flex-wrap items-center gap-2.5 rounded-xl bg-ink-900 px-3 py-2.5">
      <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', EVENT_TONE[e.status])}>
        <Icon name={e.icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-fg">{e.shortKa}</span>
        <span className="flex items-center gap-1 text-[11.5px] text-slate-500">
          {e.repeat && <Repeat className="h-3 w-3" />} {fmt(e.date)} · {EVENT_LABEL[e.status]}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <a href={googleCalendarUrl(e)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[12px] text-slate-300 transition hover:border-cyan/60 hover:text-cyan" title="Google Calendar-ში დამატება">
          <CalendarPlus className="h-3.5 w-3.5" /> Google
        </a>
        {!e.repeat &&
          (moving ? (
            <input type="date" autoFocus min={today} aria-label="ახალი თარიღი" className="rounded-full border border-line bg-ink-950 px-2.5 py-1 text-[12px] text-slate-200" onBlur={() => setMoving(false)} onChange={(ev) => ev.target.value && (setPlanned(e.group, ev.target.value), setMoving(false))} />
          ) : (
            <button type="button" onClick={() => setMoving(true)} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-slate-300 transition hover:border-cyan/60 hover:text-cyan">
              გადატანა
            </button>
          ))}
        {!e.repeat && e.date <= addDaysIso(today, 30) && (
          <button type="button" onClick={() => onDone(e.group, doneDate)} className="inline-flex items-center gap-1 rounded-full border border-clinical-low/50 px-2.5 py-1 text-[12px] text-clinical-low transition hover:bg-clinical-low/10">
            <Check className="h-3.5 w-3.5" /> ჩავიტარე
          </button>
        )}
      </span>
    </li>
  );
}
