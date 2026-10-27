'use client';

import { useMemo, useState } from 'react';
import { Baby, BellRing, CalendarCheck, CalendarDays, CalendarPlus, Check, CircleDot, Download, FlaskConical, MessageCircle, ScanLine, Syringe } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { addDaysIso, buildIcsFromSchedule, googleCalendarUrl, type ReminderLead } from '@/prevention/schedule';
import { compareDating, daysBetween, dueDate, gaLabel, gestationalAge, prenatalCalendar, PREGNANCY_LABELS, toScheduleEvents, trimesterOf, windowKa, type DatingInput, type PrenatalKind, type RhStatus } from '@/reproductive/pregnancy';
import { cn } from '@/lib/utils';
import { downloadBlob } from '@/features/prevention/export';
import { Slider, Toggle } from '@/features/prevention/simulator';
import { Card, Choice, DateField, fmtLong, fmtShort, ProgressRing, Sources } from './ui';

/* ── due date ─────────────────────────────────────────────────────────── */

type Method = DatingInput['method'];

const METHODS: { id: Method; labelKa: string }[] = [
  { id: 'lmp', labelKa: 'ბოლო მენსტრუაცია' },
  { id: 'conception', labelKa: 'ჩასახვის თარიღი' },
  { id: 'ivf', labelKa: 'ემბრიონის გადატანა (IVF)' },
  { id: 'ultrasound', labelKa: 'ექოსკოპია' },
];

export function DueTool({ today, onEdd, onOpenCalendar }: { today: string; onEdd: (edd: string) => void; onOpenCalendar: () => void }) {
  const [method, setMethod] = useState<Method>('lmp');
  const [lmp, setLmp] = useState(addDaysIso(today, -56));
  const [cycle, setCycle] = useState(28);
  const [conception, setConception] = useState(addDaysIso(today, -42));
  const [transfer, setTransfer] = useState(addDaysIso(today, -30));
  const [embryoDay, setEmbryoDay] = useState<3 | 5>(5);
  const [scanDate, setScanDate] = useState(today);
  const [gaW, setGaW] = useState(8);
  const [gaD, setGaD] = useState(0);
  const [compare, setCompare] = useState(false);

  const input: DatingInput =
    method === 'lmp' ? { method, lmp, cycleDays: cycle } : method === 'conception' ? { method, date: conception } : method === 'ivf' ? { method, transfer, embryoDay } : { method, scanDate, gaWeeks: gaW, gaDays: gaD };
  const valid = method === 'lmp' ? Boolean(lmp) : method === 'conception' ? Boolean(conception) : method === 'ivf' ? Boolean(transfer) : Boolean(scanDate);
  const check = method === 'lmp' && compare && scanDate ? compareDating(lmp, scanDate, gaW, gaD) : null;
  const edd = valid ? (check ? check.edd : dueDate(input)) : null;
  const ga = edd ? gestationalAge(edd, today) : null;
  const pregnantNow = ga !== null && ga.totalDays >= 0 && ga.totalDays <= 294;
  const daysLeft = edd ? daysBetween(today, edd) : 0;

  return (
    <article className="panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-[16px] font-bold text-fg">
          <Baby className="h-5 w-5 text-cyan" /> მშობიარობის სავარაუდო თარიღი
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {METHODS.map((m) => (
            <button key={m.id} type="button" aria-pressed={method === m.id} onClick={() => setMethod(m.id)} className={cn('rounded-xl px-2 py-2.5 text-[13px] font-medium transition', method === m.id ? 'bg-navy text-white dark:bg-cyan-brand' : 'bg-ink-850 text-slate-300 hover:text-fg')}>
              {m.labelKa}
            </button>
          ))}
        </div>

        {method === 'lmp' && (
          <>
            <DateField label="ბოლო მენსტრუაციის პირველი დღე" value={lmp} max={today} onChange={setLmp} />
            <Slider label="ციკლის ხანგრძლივობა" value={cycle} min={21} max={40} step={1} unit="დღე" onChange={setCycle} marks={[{ at: 28, label: '28' }]} />
            <Toggle on={compare} onChange={setCompare} label="ექოსკოპიის შედეგიც მაქვს — შევადაროთ" />
          </>
        )}
        {method === 'conception' && <DateField label="ჩასახვის (ოვულაციის) თარიღი" value={conception} max={today} onChange={setConception} />}
        {method === 'ivf' && (
          <>
            <DateField label="ემბრიონის გადატანის თარიღი" value={transfer} max={today} onChange={setTransfer} />
            <Choice value={embryoDay} onChange={setEmbryoDay} options={[{ id: 3, labelKa: '3-დღიანი ემბრიონი' }, { id: 5, labelKa: '5-დღიანი (ბლასტოცისტა)' }]} />
          </>
        )}
        {(method === 'ultrasound' || (method === 'lmp' && compare)) && (
          <div className="space-y-3 rounded-2xl bg-ink-850 p-4">
            <DateField label="ექოსკოპიის თარიღი" value={scanDate} max={today} onChange={setScanDate} />
            <Slider label="ვადა ექოსკოპიით — კვირა" value={gaW} min={5} max={40} step={1} unit="კვ." onChange={setGaW} />
            <Slider label="დამატებით დღეები" value={gaD} min={0} max={6} step={1} unit="დღე" onChange={setGaD} />
          </div>
        )}

        <p className="text-[11.5px] leading-relaxed text-slate-500">
          ბოლო მენსტრუაცია + 280 დღე; ჩასახვა + 266; IVF: გადატანა + 266 − ემბრიონის ასაკი. ყველაზე ზუსტია პირველი ტრიმესტრის ექოსკოპია. <Sources ids={['acog_edd_2017']} />
        </p>
      </div>

      <div className="space-y-4">
        {edd ? (
          <div className="relative overflow-hidden rounded-3xl bg-navy p-6 text-white">
            <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-brand/25 blur-2xl" />
            <div className="relative flex flex-col items-center gap-5 sm:flex-row">
              {pregnantNow && ga ? <ProgressRing fraction={ga.totalDays / 280} center={gaLabel(ga.totalDays)} caption="კვირა" /> : null}
              <div className="text-center sm:text-left">
                <p className="text-[12.5px] uppercase tracking-wider text-white/60">სავარაუდო თარიღი</p>
                <p className="mt-1 text-[28px] font-bold leading-tight">{fmtLong(edd)}</p>
                {pregnantNow && ga && (
                  <p className="mt-2 text-[14px] text-white/80">
                    დღეს: {ga.weeks} კვირა და {ga.days} დღე · {trimesterOf(ga.totalDays)} ტრიმესტრი
                    {daysLeft > 0 && <span className="block">დარჩა {daysLeft} დღე</span>}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="panel p-5 text-[13.5px] text-slate-300">შეიყვანეთ თარიღი.</p>
        )}

        {check && (
          <div className={cn('rounded-2xl p-4 text-[13px] leading-relaxed', check.useUltrasound ? 'bg-clinical-moderate/10 text-slate-200' : 'bg-clinical-low/10 text-slate-200')}>
            <p>
              მენსტრუაციით: <b>{fmtShort(check.lmpEdd)}</b> · ექოსკოპიით: <b>{fmtShort(check.usEdd)}</b> · სხვაობა {check.diffDays} დღე (ზღვარი ამ ვადაზე — {check.threshold} დღე).
            </p>
            <p className="mt-1 font-medium">{check.useUltrasound ? 'სხვაობა ზღვარზე მეტია — ვადა ექოსკოპიით დგინდება.' : 'სხვაობა ზღვარს არ აღემატება — რჩება მენსტრუაციით გამოთვლილი ვადა.'}</p>
            {check.suboptimal && <p className="mt-1 text-clinical-moderate">22 კვირამდე ექოსკოპიის გარეშე ვადა ნაკლებად ზუსტია — ექიმთან განიხილეთ.</p>}
          </div>
        )}

        {edd && pregnantNow && (
          <button
            type="button"
            onClick={() => {
              onEdd(edd);
              onOpenCalendar();
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-cyan-brand px-5 py-3 text-[14px] font-semibold text-white shadow-soft transition hover:bg-cyan-deep"
          >
            <CalendarDays className="h-4 w-4" /> ჩემი ორსულობის კალენდარი და შეხსენებები →
          </button>
        )}
        <p className="text-[11.5px] leading-relaxed text-slate-500">ეს გამოთვლაა და არა დიაგნოზი. საბოლოო ვადას ექიმი ადგენს და აღარ ცვლის, თუ ამის მკაცრი საფუძველი არ არის.</p>
      </div>
    </article>
  );
}

/* ── antenatal calendar ───────────────────────────────────────────────── */

const KIND_ICON: Record<PrenatalKind, LucideIcon> = { visit: CalendarCheck, scan: ScanLine, test: FlaskConical, vaccine: Syringe, discuss: MessageCircle, birth: Baby };
const STATE_KA = { done: 'გავლილი', now: 'ახლა', next: 'წინ' } as const;
const STATE_TONE = { done: 'bg-ink-700 text-slate-400', now: 'bg-cyan-brand text-white', next: 'bg-ink-850 text-slate-300' } as const;

export function CalendarTool({ today, edd, setEdd, rh, setRh, done, toggleDone, lead, setLead, onDue }: {
  today: string;
  edd: string | null;
  setEdd: (v: string) => void;
  rh: RhStatus;
  setRh: (v: RhStatus) => void;
  done: Record<string, boolean>;
  toggleDone: (id: string) => void;
  lead: ReminderLead;
  setLead: (v: ReminderLead) => void;
  onDue: () => void;
}) {
  const [draft, setDraft] = useState(edd ?? addDaysIso(today, 200));
  const events = useMemo(() => (edd ? prenatalCalendar(edd, today, rh) : []), [edd, today, rh]);

  if (!edd) {
    return (
      <Card title="ორსულობის კალენდარი" icon={CalendarDays}>
        <p className="text-[13.5px] leading-relaxed text-slate-300">კალენდრისთვის საჭიროა მშობიარობის სავარაუდო თარიღი. თუ იცით, შეიყვანეთ; თუ არა — გამოთვალეთ.</p>
        <DateField label="მშობიარობის სავარაუდო თარიღი" value={draft} min={today} max={addDaysIso(today, 300)} onChange={setDraft} />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!draft} onClick={() => setEdd(draft)} className="rounded-full bg-cyan-brand px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-cyan-deep disabled:opacity-50">
            კალენდრის აგება
          </button>
          <button type="button" onClick={onDue} className="rounded-full bg-ink-850 px-5 py-2.5 text-[14px] text-slate-200 hover:text-fg">
            თარიღის გამოთვლა
          </button>
        </div>
      </Card>
    );
  }

  const ga = gestationalAge(edd, today);
  const ahead = events.filter((e) => e.state !== 'done' && !done[e.id]);
  const exportIcs = () => {
    const { ics } = buildIcsFromSchedule(toScheduleEvents(ahead, today), today, lead, PREGNANCY_LABELS);
    downloadBlob('chemi-orsuloba.ics', ics, 'text/calendar;charset=utf-8');
  };
  const nextUp = ahead[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 rounded-2xl bg-navy p-5 text-white lg:grid-cols-[auto_1fr_auto] lg:items-center">
        <div>
          <p className="text-[12.5px] text-white/60">სავარაუდო თარიღი</p>
          <p className="text-[20px] font-bold">{fmtLong(edd)}</p>
          {ga.totalDays >= 0 && ga.totalDays <= 294 && (
            <p className="text-[13px] text-white/75">
              დღეს {ga.weeks} კვირა და {ga.days} დღე
            </p>
          )}
          <button type="button" onClick={() => setEdd('')} className="mt-1 text-[12px] text-cyan-brand hover:underline">
            თარიღის შეცვლა
          </button>
        </div>
        <div>
          <p className="text-[12.5px] text-white/70">სისხლის Rh-ფაქტორი</p>
          <div className="mt-2 grid max-w-md grid-cols-3 gap-2">
            {(
              [
                ['positive', 'დადებითი'],
                ['negative', 'უარყოფითი'],
                ['unknown', 'არ ვიცი'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={rh === id} onClick={() => setRh(id)} className={cn('rounded-xl py-2 text-[13px] font-semibold transition', rh === id ? 'bg-cyan-brand text-white' : 'bg-white/10 text-white/80 hover:bg-white/15')}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12.5px] text-white/75">
            <BellRing className="h-4 w-4" />
            <select value={lead} onChange={(e) => setLead(Number(e.target.value) as ReminderLead)} className="rounded-lg bg-white/10 px-2 py-1.5 text-[13px] text-white">
              <option value={1} className="text-black">1 დღით ადრე</option>
              <option value={7} className="text-black">1 კვირით ადრე</option>
              <option value={14} className="text-black">2 კვირით ადრე</option>
            </select>
          </label>
          <button type="button" onClick={exportIcs} disabled={ahead.length === 0} className="inline-flex items-center gap-2 rounded-full bg-cyan-brand px-4 py-2.5 text-[13.5px] font-semibold text-white transition hover:bg-cyan-deep disabled:opacity-50">
            <Download className="h-4 w-4" /> ტელეფონის კალენდარში ({ahead.length})
          </button>
        </div>
      </div>

      {nextUp && (
        <p className="flex items-center gap-2 rounded-2xl border border-cyan/30 bg-cyan-brand/10 px-4 py-3 text-[13.5px] text-slate-200">
          <CircleDot className="h-4 w-4 shrink-0 text-cyan" />
          შემდეგი: <b className="text-fg">{nextUp.titleKa}</b> — {nextUp.state === 'now' ? 'ახლა' : fmtShort(nextUp.date)}
        </p>
      )}

      <ol className="relative space-y-3 border-l-2 border-line pl-5 sm:pl-6">
        {events.map((e) => {
          const Icon = KIND_ICON[e.kind];
          const isDone = done[e.id] || e.state === 'done';
          const sched = toScheduleEvents([e], today)[0];
          return (
            <li key={e.id} className={cn('relative rounded-2xl border p-4 transition', e.state === 'now' && !done[e.id] ? 'border-cyan/50 bg-cyan-brand/5' : 'border-line bg-ink-900', isDone && 'opacity-60')}>
              <span aria-hidden className={cn('absolute -left-[31px] top-5 grid h-6 w-6 place-items-center rounded-full ring-4 ring-[rgb(var(--bg))] sm:-left-[35px]', isDone ? 'bg-clinical-low text-white' : e.state === 'now' ? 'bg-cyan-brand text-white' : 'bg-ink-700 text-slate-300')}>
                {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              </span>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-fg">{e.titleKa}</p>
                  <p className="text-[12.5px] text-slate-400">
                    {windowKa(e)} · {e.date === e.endDate ? fmtShort(e.date) : `${fmtShort(e.date)} – ${fmtShort(e.endDate)}`}
                  </p>
                </div>
                <span className={cn('rounded-full px-2.5 py-1 text-[11.5px] font-semibold', done[e.id] ? 'bg-clinical-low/20 text-clinical-low' : STATE_TONE[e.state])}>{done[e.id] ? 'შესრულდა' : STATE_KA[e.state]}</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-300">{e.detailKa}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Sources ids={e.sources} />
                <span className="flex-1" />
                {sched && !done[e.id] && (
                  <a href={googleCalendarUrl(sched, PREGNANCY_LABELS.suffix)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-300 hover:text-fg">
                    <CalendarPlus className="h-4 w-4" /> Google კალენდარი
                  </a>
                )}
                {e.kind !== 'birth' && (
                  <button type="button" onClick={() => toggleDone(e.id)} className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-300 hover:text-fg">
                    <Check className="h-4 w-4" /> {done[e.id] ? 'გაუქმება' : 'შევასრულე'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-[11.5px] leading-relaxed text-slate-500">
        კალენდარი ორსულობის რუტინულ ვიზიტებს აჩვენებს — ექიმმა შეიძლება დამატებითი კვლევებიც დაგინიშნოთ. თუ რამე გაწუხებთ (სისხლდენა, ძლიერი ტკივილი, ნაყოფის მოძრაობის შემცირება), ნუ დაელოდებით გეგმურ ვიზიტს — მიმართეთ ექიმს.
      </p>
    </div>
  );
}
