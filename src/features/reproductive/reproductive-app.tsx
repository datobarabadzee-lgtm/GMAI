'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { Baby, CalendarDays, Flower2, HeartHandshake, Hourglass, Lock, Scale } from 'lucide-react';
import { addDaysIso, localToday, type ReminderLead } from '@/prevention/schedule';
import type { RhStatus } from '@/reproductive/pregnancy';
import { cn } from '@/lib/utils';
import { CalendarTool, DueTool } from './pregnancy-tools';
import { ChanceTool, OvulationTool, WeightTool } from './fertility-tools';
import { KEY, read, write } from './ui';

/**
 * „ორსულობა და ნაყოფიერება“ — five tools, all computed in the browser.
 * Nothing is sent to a server; dates stay on the device (localStorage).
 */

type ToolId = 'due' | 'calendar' | 'ovulation' | 'chance' | 'weight';

const TOOLS: { id: ToolId; icon: LucideIcon; titleKa: string; subKa: string }[] = [
  { id: 'due', icon: Baby, titleKa: 'ორსულობის ვადა', subKa: 'მშობიარობის თარიღი · ACOG' },
  { id: 'calendar', icon: CalendarDays, titleKa: 'ორსულობის კალენდარი', subKa: 'კვლევები, ვაქცინები, შეხსენებები' },
  { id: 'ovulation', icon: Flower2, titleKa: 'ოვულაცია', subKa: 'ნაყოფიერი დღეები' },
  { id: 'chance', icon: Hourglass, titleKa: 'ორსულობის შანსი', subKa: 'როდის მივიდე ექიმთან' },
  { id: 'weight', icon: Scale, titleKa: 'წონის მატება', subKa: 'ნორმა BMI-ის მიხედვით · IOM' },
];

const isTool = (v: string | null): v is ToolId => TOOLS.some((t) => t.id === v);

export function ReproductiveApp() {
  const today = useMemo(() => localToday(), []);
  const param = useSearchParams().get('tool');
  const [tool, setTool] = useState<ToolId>(isTool(param) ? param : 'due');
  const [edd, setEddState] = useState<string | null>(null);
  const [rh, setRhState] = useState<RhStatus>('unknown');
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [lead, setLeadState] = useState<ReminderLead>(7);
  const [cycle, setCycleState] = useState({ lastPeriod: addDaysIso(today, -10), days: 28, periodDays: 5 });

  useEffect(() => {
    setEddState(read<string>(KEY.edd));
    const r = read<RhStatus>(KEY.rh);
    if (r === 'positive' || r === 'negative' || r === 'unknown') setRhState(r);
    setDone(read<Record<string, boolean>>(KEY.done) ?? {});
    const l = read<number>(KEY.lead);
    if (l === 1 || l === 7 || l === 14) setLeadState(l);
    const c = read<typeof cycle>(KEY.cycle);
    if (c?.lastPeriod && c.days) setCycleState(c);
  }, []);

  // Direct links, also while already on this page: ?tool=calendar etc.
  useEffect(() => {
    if (isTool(param)) setTool(param);
  }, [param]);

  const setEdd = (v: string) => {
    setEddState(v || null);
    write(KEY.edd, v || null);
    if (!v) {
      setDone({});
      write(KEY.done, {});
    }
  };
  const setRh = (v: RhStatus) => {
    setRhState(v);
    write(KEY.rh, v);
  };
  const setLead = (v: ReminderLead) => {
    setLeadState(v);
    write(KEY.lead, v);
  };
  const toggleDone = (id: string) => {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    write(KEY.done, next);
  };
  const setCycle = (patch: Partial<typeof cycle>) => {
    const next = { ...cycle, ...patch };
    setCycleState(next);
    write(KEY.cycle, next);
  };
  const open = (id: ToolId) => {
    setTool(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-navy px-6 py-7 text-white sm:px-9">
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-brand/25 blur-2xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-rose-400/15 blur-2xl" />
        <div className="relative">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-cyan-brand">LeaderMed · რეპროდუქციული მედიცინა</p>
          <h1 className="mt-2 flex items-center gap-2 text-[26px] font-bold sm:text-[32px]">
            <HeartHandshake className="h-7 w-7 text-cyan-brand" /> ორსულობა და ნაყოფიერება
          </h1>
          <p className="mt-1 max-w-2xl text-[14px] text-white/75">ვადის გამოთვლა, ორსულობის კვირა-კვირა კალენდარი შეხსენებებით, ოვულაციის დღეები და ორსულობის შანსი. ყველა ციფრი ოფიციალური გაიდლაინიდანაა, წყაროს ბმულით.</p>
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-white/55">
            <Lock className="h-3.5 w-3.5" /> მონაცემები მხოლოდ თქვენს მოწყობილობაზე ინახება.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="tablist" aria-label="ინსტრუმენტები">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tool === t.id}
            onClick={() => setTool(t.id)}
            className={cn(
              'flex flex-col items-start gap-2 rounded-2xl border p-3 text-left transition',
              tool === t.id ? 'border-transparent bg-gradient-to-b from-[#1FC3F5] to-[#0B8DB8] text-white shadow-soft' : 'border-line bg-ink-900 text-slate-300 hover:border-cyan/50',
            )}
          >
            <t.icon className="h-5 w-5" />
            <span className="text-[13.5px] font-semibold leading-tight">{t.titleKa}</span>
            <span className={cn('text-[11px] leading-tight', tool === t.id ? 'text-white/80' : 'text-slate-500')}>{t.subKa}</span>
          </button>
        ))}
      </div>

      <div key={tool} className="animate-fade-up">
        {tool === 'due' && <DueTool today={today} onEdd={setEdd} onOpenCalendar={() => open('calendar')} />}
        {tool === 'calendar' && <CalendarTool today={today} edd={edd} setEdd={setEdd} rh={rh} setRh={setRh} done={done} toggleDone={toggleDone} lead={lead} setLead={setLead} onDue={() => open('due')} />}
        {tool === 'ovulation' && (
          <OvulationTool
            today={today}
            lastPeriod={cycle.lastPeriod}
            setLastPeriod={(v) => setCycle({ lastPeriod: v })}
            cycle={cycle.days}
            setCycle={(v) => setCycle({ days: v })}
            periodDays={cycle.periodDays}
            setPeriodDays={(v) => setCycle({ periodDays: v })}
          />
        )}
        {tool === 'chance' && <ChanceTool />}
        {tool === 'weight' && <WeightTool />}
      </div>

      <p className="text-center text-[12px] text-slate-500">ეს ინსტრუმენტები ექიმის კონსულტაციას არ ცვლის.</p>
    </div>
  );
}
