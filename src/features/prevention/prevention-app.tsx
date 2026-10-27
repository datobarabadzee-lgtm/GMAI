'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CalendarHeart, SlidersHorizontal, HeartPulse, Lock, Phone, PiggyBank, RotateCcw, ShieldCheck, Siren, Sparkles, Timer } from 'lucide-react';
import { buildPlan } from '@/prevention/engine';
import { localToday, type ReminderLead } from '@/prevention/schedule';
import { STATUS_KA } from '@/prevention/labels';
import type { PreventionInput, PreventionPlan } from '@/prevention/types';
import { cn } from '@/lib/utils';
import { IntakeForm } from './intake-form';
import { PlanView } from './plan-view';
import { PulseLine } from './visuals';
import { QuickSimulator } from './simulator';

/**
 * „ჩემი პრევენცია“ — the whole module runs in the browser.
 *
 * The rules engine is a pure TypeScript function, so the plan is computed on the
 * device: no login, nothing sent to a server, and it keeps working offline once
 * the page has been opened. Only „რატომ მჭირდება?“ calls the server, and only
 * after consent.
 */

const KEY_INPUT = 'gmai.prevention.input.v1';
const KEY_SNAPSHOT = 'gmai.prevention.snapshot.v1';
const KEY_PROGRESS = 'gmai.prevention.progress.v1';
const KEY_PLANNED = 'gmai.prevention.planned.v1';
const KEY_LEAD = 'gmai.prevention.lead.v1';

const read = <T,>(k: string): T | null => {
  try {
    const raw = window.localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const write = (k: string, v: unknown) => {
  try {
    window.localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage blocked: the plan still works for this visit */
  }
};

type Snapshot = { at: string; statuses: Record<string, { status: string; titleKa: string }> };
type Stage = 'intro' | 'form' | 'result' | 'sim' | 'quick';

export function PreventionApp() {
  const [stage, setStage] = useState<Stage>('intro');
  const [input, setInput] = useState<PreventionInput>({});
  const [saved, setSaved] = useState(false);
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [changes, setChanges] = useState<string[]>([]);
  const today = useMemo(() => localToday(), []);
  const [planned, setPlannedState] = useState<Record<string, string>>({});
  const [lead, setLeadState] = useState<ReminderLead>(7);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [pendingTool, setPendingTool] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const i = read<PreventionInput>(KEY_INPUT);
    if (i?.age && i.sex) {
      setInput({ ...i, redFlags: [] });
      setSaved(true);
    }
    setProgress(read<Record<string, boolean>>(KEY_PROGRESS) ?? {});
    setPlannedState(read<Record<string, string>>(KEY_PLANNED) ?? {});
    const l = read<number>(KEY_LEAD);
    if (l === 1 || l === 7 || l === 14) setLeadState(l);
    setLoaded(true);
  }, []);

  // Direct links (also from the menu while already on this page): ?tool=simulator | ?tool=calendar
  const tool = useSearchParams().get('tool');
  useEffect(() => {
    if (loaded && tool) setPendingTool(tool);
  }, [tool, loaded]);

  useEffect(() => {
    if (stage !== 'result' || !scrollTarget) return;
    const t = setTimeout(() => {
      document.getElementById(scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollTarget(null);
    }, 120);
    return () => clearTimeout(t);
  }, [stage, scrollTarget]);

  const set = useCallback((patch: Partial<PreventionInput>) => setInput((prev) => ({ ...prev, ...patch })), []);

  const plan: PreventionPlan | null = useMemo(() => (stage === 'result' ? buildPlan(input, today) : null), [stage, input, today]);

  const generate = (from: PreventionInput = input, target?: string) => {
    const p = buildPlan(from, today);
    if (p.kind === 'PLAN') {
      // Remember the last plan's statuses so the next visit can say what changed.
      const prev = read<Snapshot>(KEY_SNAPSHOT);
      if (prev) {
        const diff: string[] = [];
        for (const s of p.screening) {
          const before = prev.statuses[s.id];
          if (!before && s.status !== 'not_needed') diff.push(`ახალი: ${s.shortKa} — ${STATUS_KA[s.status]}`);
          else if (before && before.status !== s.status) diff.push(`${s.shortKa}: ${STATUS_KA[before.status as keyof typeof STATUS_KA] ?? before.status} → ${STATUS_KA[s.status]}`);
        }
        setChanges(diff);
      }
      write(KEY_SNAPSHOT, { at: today, statuses: Object.fromEntries(p.screening.map((s) => [s.id, { status: s.status, titleKa: s.titleKa }])) } satisfies Snapshot);
      const { redFlags: _drop, ...keep } = from;
      void _drop;
      write(KEY_INPUT, keep);
      setSaved(true);
    }
    setStage('result');
    if (target) setScrollTarget(target);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openCalendar = () => (saved ? generate(input, 'agenda') : setStage('quick'));
  const openSimulator = () => {
    setStage('sim');
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (!pendingTool) return;
    if (pendingTool === 'simulator') openSimulator();
    if (pendingTool === 'calendar') openCalendar();
    setPendingTool(null);
  }, [pendingTool]); // eslint-disable-line react-hooks/exhaustive-deps

  const setPlanned = (group: string, date: string | undefined) =>
    setPlannedState((p) => {
      const next = { ...p };
      if (date) next[group] = date;
      else delete next[group];
      write(KEY_PLANNED, next);
      return next;
    });
  const setLead = (l: ReminderLead) => {
    setLeadState(l);
    write(KEY_LEAD, l);
  };

  const markDone = (group: string, date: string) => {
    setPlanned(group, undefined);
    const vid = group.startsWith('vaccine:') ? (group.slice(8) as keyof NonNullable<PreventionInput['vaccines']>) : null;
    const next: PreventionInput = vid
      ? { ...input, vaccines: { ...(input.vaccines ?? {}), [vid]: { done: true, lastDate: date } } }
      : { ...input, lastDone: { ...(input.lastDone ?? {}), [group]: date } };
    setInput(next);
    const { redFlags: _drop, ...keep } = next;
    void _drop;
    write(KEY_INPUT, keep);
  };

  const toggleProgress = (key: string) =>
    setProgress((p) => {
      const next = { ...p, [key]: !p[key] };
      write(KEY_PROGRESS, next);
      return next;
    });

  const forget = () => {
    [KEY_INPUT, KEY_SNAPSHOT, KEY_PROGRESS, KEY_PLANNED, KEY_LEAD].forEach((k) => {
      try {
        window.localStorage.removeItem(k);
      } catch {
        /* nothing stored */
      }
    });
    setInput({});
    setSaved(false);
    setProgress({});
    setPlannedState({});
    setChanges([]);
    setStage('intro');
  };

  if (stage === 'intro') return <Intro saved={saved} onStart={() => setStage('form')} onResume={() => generate()} onForget={forget} onSim={openSimulator} onCalendar={openCalendar} />;
  if (stage === 'sim') return <QuickSimulator onBack={() => setStage('intro')} onPlan={() => setStage('form')} />;
  if (stage === 'quick') return <QuickStart input={input} set={set} onBack={() => setStage('intro')} onGo={() => generate(input, 'agenda')} />;
  if (stage === 'form') return <IntakeForm input={input} set={set} onSubmit={() => generate()} />;

  if (!plan) return null;
  if (plan.kind === 'RED_FLAG_STOP') {
    return (
      <div className="mx-auto max-w-2xl animate-fade-up space-y-4">
        <section className={cn('rounded-3xl p-6 text-white sm:p-8', plan.emergency ? 'bg-clinical-critical' : 'bg-navy')}>
          <Siren className="h-10 w-10" />
          <h1 className="mt-3 text-[26px] font-bold leading-tight">{plan.emergency ? 'ეს შეიძლება გადაუდებელი მდგომარეობა იყოს' : 'ჯერ ექიმს მიმართეთ'}</h1>
          <p className="mt-2 text-[15px] text-white/85">
            {plan.emergency ? 'პრევენციის გეგმა ახლა შეჩერებულია. ნუ დაელოდებით — დარეკეთ 112-ზე.' : 'თქვენ მიერ მონიშნული სიმპტომი გამოკვლევას საჭიროებს. პრევენციის გეგმა მას ვერ ჩაანაცვლებს.'}
          </p>
          {plan.emergency && (
            <a href="tel:112" className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-[16px] font-bold text-clinical-critical shadow-soft">
              <Phone className="h-5 w-5" /> დარეკე 112-ზე
            </a>
          )}
        </section>
        <ul className="space-y-2">
          {plan.flags.map((f) => (
            <li key={f.id} className="panel p-4">
              <p className="text-[14.5px] font-semibold text-fg">{f.labelKa}</p>
              <p className="mt-1 text-[13.5px] text-slate-300">{f.adviceKa}</p>
            </li>
          ))}
        </ul>
        <button type="button" className="btn" onClick={() => setStage('form')}>
          დაბრუნება
        </button>
      </div>
    );
  }
  if (plan.kind === 'NEEDS_PATIENT_DATA') {
    return (
      <div className="mx-auto max-w-xl space-y-3 text-center">
        <p className="text-[15px] text-slate-200">გეგმისთვის საჭიროა: {plan.missingKa.join(', ')}.</p>
        <button type="button" className="btn btn-primary" onClick={() => setStage('form')}>
          შევსება
        </button>
      </div>
    );
  }
  return (
    <>
      <PlanView plan={plan} input={input} onEdit={() => setStage('form')} onDone={markDone} changes={changes} progress={progress} toggleProgress={toggleProgress} today={today} planned={planned} setPlanned={setPlanned} lead={lead} setLead={setLead} />
      <div className="no-print mx-auto mt-2 max-w-6xl text-center">
        <button type="button" onClick={forget} className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-clinical-critical">
          <RotateCcw className="h-3.5 w-3.5" /> ჩემი მონაცემების წაშლა ამ მოწყობილობიდან
        </button>
      </div>
    </>
  );
}

function QuickStart({ input, set, onBack, onGo }: { input: PreventionInput; set: (p: Partial<PreventionInput>) => void; onBack: () => void; onGo: () => void }) {
  const ready = Boolean(input.age && input.age >= 18 && input.age <= 110 && input.sex);
  return (
    <div className="mx-auto max-w-xl">
      <section className="panel animate-fade-up p-6">
        <button type="button" onClick={onBack} className="text-[12.5px] text-slate-400 hover:text-fg">
          ← უკან
        </button>
        <h1 className="mt-2 flex items-center gap-2 text-[22px] font-bold text-fg">
          <CalendarHeart className="h-6 w-6 text-cyan" /> კალენდარი და შეხსენებები
        </h1>
        <p className="mt-1 text-[13.5px] text-slate-400">კალენდრისთვის საკმარისია ასაკი და სქესი. დანარჩენი მოგვიანებით შეგიძლიათ დაამატოთ.</p>
        <div className="mt-5 grid grid-cols-[110px_1fr] items-end gap-3">
          <label className="block">
            <span className="label">ასაკი</span>
            <input type="number" inputMode="numeric" className="field mt-1 text-center text-lg font-bold" value={input.age ?? ''} placeholder="—" onChange={(e) => set({ age: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['female', 'male'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={input.sex === s} onClick={() => set({ sex: s })} className={cn('h-[46px] rounded-xl border text-[14px] font-semibold transition', input.sex === s ? 'border-transparent bg-navy text-white dark:bg-cyan-brand' : 'border-line bg-ink-950 text-slate-300 hover:border-cyan/50')}>
                {s === 'female' ? 'ქალი' : 'მამაკაცი'}
              </button>
            ))}
          </div>
        </div>
        <button type="button" disabled={!ready} onClick={onGo} className="btn btn-primary mt-5 h-12 w-full text-[15px]">
          კალენდრის გახსნა <ArrowRight className="h-4 w-4" />
        </button>
      </section>
    </div>
  );
}

function Intro({ saved, onStart, onResume, onForget, onSim, onCalendar }: { saved: boolean; onStart: () => void; onResume: () => void; onForget: () => void; onSim: () => void; onCalendar: () => void }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-navy px-6 py-10 text-white ring-white/10 dark:ring-1 sm:px-12 sm:py-14">
        <span aria-hidden className="prev-float pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-cyan-brand/30 blur-2xl" />
        <span aria-hidden className="prev-float-slow pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-leadermed-green/20 blur-3xl" />
        <PulseLine className="absolute -bottom-6 left-0 h-16 w-full opacity-30" />
        <div className="relative grid items-center gap-8 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12.5px] text-cyan-brand">
              <Timer className="h-3.5 w-3.5" /> 2 წუთი · უფასოდ · რეგისტრაციის გარეშე
            </p>
            <h1 className="mt-4 text-[30px] font-bold leading-[1.12] sm:text-[44px]">
              თქვენი პირადი <span className="text-cyan-brand">პრევენციის გეგმა</span>
            </h1>
            <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-white/80">
              რა კვლევა გჭირდებათ, რა ვაქცინა, როდის და რატომ — და რაზე <b className="text-white">არ</b> ღირს ფულის დახარჯვა. ყველა რეკომენდაცია ეფუძნება WHO-ს, USPSTF-ის და ESC-ის მოქმედ გაიდლაინებს.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {saved ? (
                <>
                  <button type="button" onClick={onResume} className="inline-flex items-center gap-2 rounded-full bg-cyan-brand px-6 py-3.5 text-[15px] font-semibold text-white shadow-soft transition hover:bg-cyan-deep">
                    ჩემი გეგმის ნახვა <ArrowRight className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={onStart} className="rounded-full border border-white/25 px-5 py-3.5 text-[14px] text-white/90 transition hover:border-cyan-brand">
                    მონაცემების განახლება
                  </button>
                  <button type="button" onClick={onForget} className="text-[12.5px] text-white/55 underline-offset-2 hover:underline">
                    თავიდან დაწყება
                  </button>
                </>
              ) : (
                <button type="button" onClick={onStart} className="inline-flex items-center gap-2 rounded-full bg-cyan-brand px-7 py-4 text-[16px] font-semibold text-white shadow-soft transition hover:bg-cyan-deep">
                  დავიწყოთ <ArrowRight className="h-5 w-5" />
                </button>
              )}
            </div>
            <div className="mt-5 grid max-w-xl gap-2.5 sm:grid-cols-2">
              {[
                { on: onSim, icon: SlidersHorizontal, t: 'რისკის სიმულატორი', d: 'პირდაპირ, ფორმის გარეშე' },
                { on: onCalendar, icon: CalendarHeart, t: 'კალენდარი და შეხსენებები', d: saved ? 'თქვენი გეგმიდან' : 'მხოლოდ ასაკი და სქესი' },
              ].map((b) => (
                <button key={b.t} type="button" onClick={b.on} className="group flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3.5 text-left ring-1 ring-white/15 transition hover:bg-white/15 hover:ring-cyan-brand">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-brand text-white shadow-soft">
                    <b.icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold">{b.t}</span>
                    <span className="block text-[12px] text-white/65">{b.d}</span>
                  </span>
                  <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-white/50 transition group-hover:translate-x-0.5 group-hover:text-white" />
                </button>
              ))}
            </div>
          </div>
          <div className="relative hidden lg:block" aria-hidden>
            <div className="prev-float rounded-3xl bg-white/10 p-5 backdrop-blur">
              {[
                ['მამოგრაფია', 'დროა ჩატარდეს', '#FF9652'],
                ['არტერიული წნევა', 'ვადაშია', '#60CD94'],
                ['მსხვილი ნაწლავი (FIT)', 'ვადა გავიდა', '#FF6370'],
                ['გრიპის ვაქცინა', 'რეკომენდებულია', '#70ACF5'],
              ].map(([t, s, c], i) => (
                <div key={t} className="mb-2.5 flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3 animate-fade-up last:mb-0" style={{ animationDelay: `${200 + i * 120}ms` }}>
                  <span className="text-[14px] font-medium">{t}</span>
                  <span className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold text-navy" style={{ background: c }}>
                    {s}
                  </span>
                </div>
              ))}
            </div>
            <div className="prev-float-slow absolute -bottom-10 -right-4 rounded-2xl bg-white px-4 py-3 text-navy shadow-soft">
              <p className="text-[11px] text-slate-500">10-წლიანი რისკი · მაგალითი</p>
              <p className="text-[22px] font-bold">
                9.4% <span className="text-[12px] font-medium text-leadermed-green">→ 5.1%</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: CalendarHeart, t: 'პირადი სკრინინგ-კალენდარი', d: 'მხოლოდ ის, რაც თქვენ გეხებათ — ბოლო და შემდეგი ვადით.' },
          { icon: HeartPulse, t: 'ინფარქტის და დიაბეტის რისკი', d: 'SCORE2 საქართველოსთვის და FINDRISC — ერთი წინადადებით, რა შეამცირებს რისკს.' },
          { icon: PiggyBank, t: '„ეს არ გჭირდებათ“', d: 'რომელ „პროფილაქტიკურ“ კურსს და ანალიზს არ აქვს მტკიცებულება.' },
          { icon: Sparkles, t: 'შეხსენება კალენდარში', d: 'ერთი დაჭერით — ტელეფონის კალენდარში, სერვერის გარეშე.' },
        ].map((x, i) => (
          <div key={x.t} className="panel p-5 animate-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-b from-[#1FC3F5] to-[#D5EEF6] text-navy dark:from-[#0B8DB8] dark:to-[#173B52] dark:text-white">
              <x.icon className="h-5 w-5" />
            </span>
            <p className="mt-4 text-[15px] font-semibold text-fg">{x.t}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{x.d}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 pt-1 sm:grid-cols-3">
        {[
          { icon: ShieldCheck, t: 'ყოველ რეკომენდაციას — წყარო', d: 'წყარო, წელი და მტკიცებულების დონე ყოველ პუნქტზე ჩანს.' },
          { icon: Lock, t: 'არაფერი ინახება სერვერზე', d: 'გეგმა თქვენს მოწყობილობაზე იქმნება და ინახება.' },
          { icon: Siren, t: 'უსაფრთხოება პირველ რიგში', d: 'მწვავე სიმპტომისას გეგმა ჩერდება და გეტყვით, რა გააკეთოთ.' },
        ].map((x) => (
          <div key={x.t} className="flex gap-3">
            <x.icon className="mt-0.5 h-5 w-5 shrink-0 text-cyan" />
            <div>
              <p className="text-[14px] font-semibold text-fg">{x.t}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{x.d}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
