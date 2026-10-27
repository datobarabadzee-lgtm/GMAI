'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertOctagon, ArrowRight, Baby, BadgeCheck, Ban, CalendarCheck2, CalendarPlus, Check, CheckCircle2, ChevronDown, CircleHelp, Clock, ExternalLink,
  FileDown, Gauge as GaugeIcon, SlidersHorizontal, Loader2, MessageCircle, Pencil, PiggyBank, Phone, Printer, ShieldAlert, Siren, Sparkles, Syringe, Target, TriangleAlert,
} from 'lucide-react';
import type { PlanItem, PreventionInput, PreventionPlan, RiskResult, Source } from '@/prevention/types';
import { STATUS_KA, VACCINE_STATUS_KA } from '@/prevention/labels';
import { useConsent } from '@/features/settings/consent-store';
import { whatsappLink } from '@/lib/contact';
import { cn } from '@/lib/utils';
import { BAND_COLOR, Gauge, ICONS, LeverBars, PulseLine, ScaleBar, StatusRing } from './visuals';
import { downloadBlob, planSections, planText } from './export';
import { CalendarView } from './calendar-view';
import { SimulatorHub } from './simulator-hub';
import { localToday, type ReminderLead } from '@/prevention/schedule';

type Plan = Extract<PreventionPlan, { kind: 'PLAN' }>;

const STATUS_STYLE: Record<PlanItem['status'], { pill: string; tile: string; dot: string }> = {
  overdue: { pill: 'bg-clinical-critical/10 text-clinical-critical border-clinical-critical/40', tile: 'bg-clinical-critical/10 text-clinical-critical', dot: 'rgb(var(--c-critical))' },
  due: { pill: 'bg-clinical-high/10 text-clinical-high border-clinical-high/40', tile: 'bg-clinical-high/10 text-clinical-high', dot: 'rgb(var(--c-high))' },
  discuss: { pill: 'bg-clinical-info/10 text-clinical-info border-clinical-info/40', tile: 'bg-clinical-info/10 text-clinical-info', dot: 'rgb(var(--c-info))' },
  needs_data: { pill: 'bg-clinical-moderate/10 text-clinical-moderate border-clinical-moderate/40', tile: 'bg-clinical-moderate/10 text-clinical-moderate', dot: 'rgb(var(--c-moderate))' },
  up_to_date: { pill: 'bg-clinical-low/10 text-clinical-low border-clinical-low/40', tile: 'bg-clinical-low/10 text-clinical-low', dot: 'rgb(var(--c-low))' },
  not_needed: { pill: 'bg-ink-800 text-slate-400 border-line', tile: 'bg-ink-800 text-slate-400', dot: 'rgb(var(--slate-500))' },
};

const STATUS_ICON: Record<PlanItem['status'], LucideIcon> = {
  up_to_date: CheckCircle2, overdue: TriangleAlert, due: Clock, discuss: Clock, needs_data: Clock, not_needed: Clock,
};

const BAND_SHORT: Record<NonNullable<RiskResult['band']>, string> = { low: 'დაბალი', moderate: 'ზომიერი', high: 'მაღალი', very_high: 'ძალიან მაღალი' };

const fmtDate = (iso?: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
  return `${d} ${months[m - 1]}, ${y}`;
};

function Sources({ sources }: { sources: Source[] }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-slate-500">
      <span>წყარო:</span>
      {sources.map((s) => (
        <a key={s.url + s.title} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan hover:underline" title={s.title}>
          {s.org} {s.year}
          {s.grade ? ` · ${s.grade}` : ''}
          <ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </p>
  );
}

function SectionHead({ id, icon: Icon, eyebrow, title, sub }: { id: string; icon: LucideIcon; eyebrow: string; title: string; sub?: string }) {
  return (
    <header id={id} className="scroll-mt-28">
      <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-cyan">
        <Icon className="h-4 w-4" /> {eyebrow}
      </p>
      <h2 className="mt-1 text-[22px] font-bold leading-tight text-fg sm:text-[26px]">{title}</h2>
      {sub && <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-slate-400">{sub}</p>}
    </header>
  );
}

/* ── explain ("რატომ მჭირდება") ─────────────────────────────────────────── */

function Explain({ input, kind, id, fallback }: { input: PreventionInput; kind: 'screening' | 'vaccine' | 'risk'; id: string; fallback: string }) {
  const { granted } = useConsent();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [text, setText] = useState('');
  const [ai, setAi] = useState(false);
  const open = state !== 'idle';

  const run = async () => {
    if (open) {
      setState('idle');
      return;
    }
    if (!granted) {
      setText(fallback);
      setAi(false);
      setState('done');
      return;
    }
    setState('loading');
    try {
      const r = await fetch('/api/prevention/explain', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input, kind, id, today: localToday() }) });
      const j = (await r.json()) as { textKa?: string; ai?: boolean };
      setText(j.textKa || fallback);
      setAi(Boolean(j.ai));
    } catch {
      setText(fallback);
      setAi(false);
    }
    setState('done');
  };

  return (
    <div>
      <button type="button" onClick={run} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-full border border-cyan/35 bg-cyan/5 px-3 py-1.5 text-[12.5px] font-medium text-cyan transition hover:bg-cyan/10">
        {state === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleHelp className="h-3.5 w-3.5" />}
        რატომ მჭირდება?
      </button>
      {state === 'loading' && (
        <div className="mt-3 space-y-2">
          {[92, 78, 64].map((w) => (
            <div key={w} className="h-2.5 animate-pulse-soft rounded bg-ink-700/60" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}
      {state === 'done' && (
        <div className="mt-3 animate-fade-up rounded-xl bg-ink-850 p-3.5 text-[13.5px] leading-relaxed text-slate-200">
          {text}
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
            {ai ? <Sparkles className="h-3 w-3 text-cyan" /> : <BadgeCheck className="h-3 w-3" />}
            {ai ? 'AI-ის ახსნა თქვენი გეგმის მიხედვით — რიცხვები ავტომატურად შემოწმებულია.' : granted ? 'წესის ტექსტი.' : 'წესის ტექსტი. პერსონალური AI-ახსნისთვის საჭიროა თანხმობა.'}
            {!granted && !ai && (
              <Link href="/patient" className="text-cyan hover:underline">
                თანხმობა
              </Link>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/* ── hero ───────────────────────────────────────────────────────────────── */

type HeroProps = { plan: Plan; onEdit: () => void; changes: string[] };

function Hero({ plan, onEdit, changes }: HeroProps) {
  const c = plan.counts;
  const todo = c.overdue + c.due;
  const [msg, setMsg] = useState('');
  const today = localToday();

  const exportDocx = async () => {
    setMsg('Word ფაილი მზადდება…');
    try {
      const r = await fetch('/api/documents/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateId: 'patient-instructions', sections: planSections(plan), institution: 'ლიდერმედი', date: today, reviewState: 'draft' }),
      });
      if (!r.ok) throw new Error();
      downloadBlob('prevention-plan.docx', await r.blob(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      setMsg('');
    } catch {
      setMsg('Word ფაილი ვერ მომზადდა — სცადეთ „ბეჭდვა / PDF“.');
    }
  };

  return (
    <section className="relative overflow-hidden rounded-3xl bg-navy px-5 py-7 text-white ring-white/10 dark:ring-1 sm:px-9 sm:py-10">
      <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-brand/25 blur-2xl" />
      <PulseLine className="absolute -bottom-2 left-0 h-16 w-full opacity-40" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-cyan-brand">თქვენი პირადი პრევენციის გეგმა</p>
          <h1 className="mt-2 text-[26px] font-bold leading-tight sm:text-[34px]">
            {todo > 0 ? (
              <>
                დღეს <span className="text-cyan-brand">{todo} ნაბიჯი</span> გაქვთ გადასადგმელი
              </>
            ) : (
              <>
                ყველაფერი <span className="text-cyan-brand">ვადაშია</span> — შესანიშნავია!
              </>
            )}
          </h1>
          <p className="mt-2 text-[14px] text-white/75">
            {plan.ageYears} წელი · {plan.sex === 'female' ? 'ქალი' : 'მამაკაცი'} · გეგმა შედგენილია {fmtDate(plan.generatedFor)}
          </p>
          <div className="mt-6 grid gap-2.5 sm:grid-cols-3">
            {[
              { id: 'agenda', icon: CalendarPlus, t: 'ჩემი კალენდარი', d: 'დაგეგმვა და შეხსენებები' },
              { id: 'simulator', icon: SlidersHorizontal, t: 'რისკის სიმულატორი', d: '„რა მოხდება, თუ…?“' },
              { id: 'calendar', icon: CalendarCheck2, t: 'ჩემი კვლევები', d: `${plan.screening.filter((s) => s.status !== 'not_needed').length} პუნქტი` },
            ].map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => document.getElementById(b.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="group flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3.5 text-left ring-1 ring-white/15 transition hover:bg-white/15 hover:ring-cyan-brand"
              >
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
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-4 py-2.5 text-[13px] text-white/90 transition hover:border-cyan-brand">
              <Printer className="h-4 w-4" /> ბეჭდვა / PDF
            </button>
            <button type="button" onClick={exportDocx} className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-4 py-2.5 text-[13px] text-white/90 transition hover:border-cyan-brand">
              <FileDown className="h-4 w-4" /> Word
            </button>
            <a href={whatsappLink(planText(plan))} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-4 py-2.5 text-[13px] text-white/90 transition hover:border-cyan-brand">
              <MessageCircle className="h-4 w-4" /> ექიმს WhatsApp-ით
            </a>
            <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] text-white/70 transition hover:text-white">
              <Pencil className="h-4 w-4" /> მონაცემების შეცვლა
            </button>
          </div>
          {msg && <p className="mt-3 text-[12.5px] text-cyan-brand">{msg}</p>}
        </div>
        <div className="flex items-center gap-5">
          <StatusRing
            center={String(todo)}
            caption="გასაკეთებელი"
            segments={[
              { value: c.overdue, color: '#FF6370', label: 'ვადა გავიდა' },
              { value: c.due, color: '#FF9652', label: 'დროა ჩატარდეს' },
              { value: c.discuss + c.needsData, color: '#70ACF5', label: 'გადასაწყვეტი' },
              { value: c.upToDate, color: '#60CD94', label: 'ვადაშია' },
            ]}
          />
          <ul className="space-y-1.5 text-[12.5px]">
            {[
              ['#FF6370', 'ვადა გავიდა', c.overdue],
              ['#FF9652', 'დროა ჩატარდეს', c.due],
              ['#70ACF5', 'ექიმთან / მონაცემი', c.discuss + c.needsData],
              ['#60CD94', 'ვადაშია', c.upToDate],
            ].map(([color, label, n]) => (
              <li key={label as string} className="flex items-center gap-2 text-white/80">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color as string }} />
                {label} <span className="font-semibold text-white tabular-nums">{n as number}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {changes.length > 0 && (
        <div className="relative mt-6 rounded-2xl bg-white/10 p-4 backdrop-blur">
          <p className="text-[13px] font-semibold text-white">წინა ვიზიტის შემდეგ შეიცვალა:</p>
          <ul className="mt-1.5 space-y-1 text-[12.5px] text-white/80">
            {changes.slice(0, 6).map((x) => (
              <li key={x}>• {x}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ── screening ──────────────────────────────────────────────────────────── */

function Timeline({ items, today }: { items: PlanItem[]; today: string }) {
  const [ty, tm] = today.split('-').map(Number);
  const months = (iso: string) => {
    const [y, m] = iso.split('-').map(Number);
    return (y - ty) * 12 + (m - tm);
  };
  const now = items.filter((s) => s.status === 'due' || s.status === 'overdue');
  const later = items
    .filter((s) => s.status === 'up_to_date' && s.nextDue && months(s.nextDue) <= 60)
    .sort((a, b) => a.nextDue!.localeCompare(b.nextDue!));
  if (!now.length && !later.length) return null;
  const years = Array.from({ length: 6 }, (_, i) => ty + i);
  return (
    <div className="panel grid gap-5 p-5 md:grid-cols-[minmax(0,240px)_1fr] md:gap-8">
      <div>
        <p className="text-[13px] font-semibold text-fg">ახლა გასაკეთებელი</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {now.length ? (
            now.map((s, i) => {
              const Icon = ICONS[s.icon] ?? Clock;
              return (
                <span key={s.id} className="inline-flex animate-fade-up items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-white" style={{ background: STATUS_STYLE[s.status].dot, animationDelay: `${i * 50}ms` }}>
                  <Icon className="h-3.5 w-3.5" /> {s.shortKa}
                </span>
              );
            })
          ) : (
            <span className="text-[13px] text-clinical-low">არაფერი — ყველაფერი ვადაშია.</span>
          )}
        </div>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <p className="text-[13px] font-semibold text-fg">შემდეგი 5 წელი</p>
        <div className="relative mt-3 h-[132px] min-w-[460px]">
          <div className="absolute inset-x-0 top-[62px] h-1 rounded-full bg-gradient-to-r from-cyan-brand via-cyan/40 to-ink-700" />
          {years.map((y, i) => (
            <span key={y} className={cn('absolute top-[72px] text-[11px] text-slate-500', i === 0 ? '' : i === 5 ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: `${(i / 5) * 100}%` }}>
              {y}
            </span>
          ))}
          {later.map((s, i) => {
            const Icon = ICONS[s.icon] ?? Clock;
            const x = Math.max(2, Math.min(98, ((months(s.nextDue!) + tm - 1) / 60) * 100));
            const up = i % 2 === 0;
            return (
              <div key={s.id} className="absolute -translate-x-1/2 animate-fade-up text-center" style={{ left: `${x}%`, top: up ? 0 : 84, animationDelay: `${i * 70}ms` }} title={`${s.shortKa} — ${fmtDate(s.nextDue)}`}>
                {!up && <span className="mx-auto block h-3 w-px bg-line" />}
                <span className="mx-auto grid h-8 w-8 place-items-center rounded-full text-white shadow-soft" style={{ background: STATUS_STYLE.up_to_date.dot }}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="mt-0.5 block whitespace-nowrap text-[10.5px] text-slate-400">{s.shortKa}</span>
                {up && <span className="mx-auto block h-2 w-px bg-line" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ScreeningCard({ s, input, onDone, i }: { s: PlanItem; input: PreventionInput; onDone: (group: string, date: string) => void; i: number }) {
  const Icon = ICONS[s.icon] ?? Clock;
  const st = STATUS_STYLE[s.status];
  const StatusIcon = STATUS_ICON[s.status];
  const [picking, setPicking] = useState(false);
  return (
    <article className="group panel flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:shadow-soft animate-fade-up" style={{ animationDelay: `${i * 45}ms` }}>
      <div className="flex items-start gap-3">
        <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', st.tile)}>
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15.5px] font-semibold leading-snug text-fg">{s.titleKa}</h3>
          <span className={cn('mt-1.5 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium', st.pill)}>
            <StatusIcon className="h-3 w-3" />
            {STATUS_KA[s.status]}
          </span>
        </div>
      </div>
      <dl className="grid gap-1.5 text-[13px]">
        <div className="flex gap-2">
          <dt className="shrink-0 text-slate-500">სიხშირე:</dt>
          <dd className="text-slate-200">{s.frequencyKa}</dd>
        </div>
        {s.lastDone && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-slate-500">ბოლოს:</dt>
            <dd className="text-slate-200">{fmtDate(s.lastDone)}</dd>
          </div>
        )}
        {s.nextDue && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-slate-500">შემდეგი:</dt>
            <dd className="font-semibold text-fg">{fmtDate(s.nextDue)}</dd>
          </div>
        )}
      </dl>
      <p className="text-[12.5px] leading-relaxed text-slate-400">{s.reasonKa}</p>
      {s.missingKa && (
        <p className="rounded-lg bg-clinical-moderate/10 px-3 py-2 text-[12.5px] text-clinical-moderate">აკლია: {s.missingKa.join('; ')}</p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Explain input={input} kind="screening" id={s.id} fallback={`${s.whyKa}${s.howKa ? ` ${s.howKa}` : ''}`} />
        {(s.status === 'due' || s.status === 'overdue' || s.status === 'up_to_date') &&
          (picking ? (
            <input
              type="date"
              autoFocus
              aria-label="ჩატარების თარიღი"
              className="rounded-full border border-line bg-ink-950 px-3 py-1.5 text-[12.5px] text-slate-200"
              max={localToday()}
              onChange={(e) => {
                if (e.target.value) {
                  onDone(s.group, e.target.value);
                  setPicking(false);
                }
              }}
              onBlur={() => setPicking(false)}
            />
          ) : (
            <button type="button" onClick={() => setPicking(true)} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12.5px] text-slate-300 transition hover:border-clinical-low/60 hover:text-clinical-low">
              <Check className="h-3.5 w-3.5" /> ჩავიტარე
            </button>
          ))}
      </div>
      <Sources sources={s.sources} />
    </article>
  );
}

function Screening({ plan, input, onDone }: { plan: Plan; input: PreventionInput; onDone: (g: string, d: string) => void }) {
  const [showNo, setShowNo] = useState(false);
  const order: PlanItem['status'][] = ['overdue', 'due', 'needs_data', 'discuss', 'up_to_date'];
  const active = plan.screening.filter((s) => s.status !== 'not_needed').sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const no = plan.screening.filter((s) => s.status === 'not_needed');
  return (
    <div className="space-y-5">
      <SectionHead id="calendar" icon={CalendarCheck2} eyebrow="4.1 · სკრინინგ-კალენდარი" title="რა კვლევა გჭირდებათ და როდის" sub="მხოლოდ ის, რაც თქვენს ასაკს, სქესს და რისკს შეესაბამება. ყოველ პუნქტს აქვს წყარო და მტკიცებულების დონე." />
      <Timeline items={active} today={plan.generatedFor} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {active.map((s, i) => (
          <ScreeningCard key={s.id} s={s} input={input} onDone={onDone} i={i} />
        ))}
      </div>
      {no.length > 0 && (
        <div className="rounded-2xl border border-dashed border-line">
          <button type="button" onClick={() => setShowNo((v) => !v)} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left" aria-expanded={showNo}>
            <span className="flex items-center gap-2 text-[14px] font-medium text-slate-200">
              <BadgeCheck className="h-4 w-4 text-clinical-low" /> {no.length} კვლევა თქვენ ახლა არ გჭირდებათ
            </span>
            <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', showNo && 'rotate-180')} />
          </button>
          {showNo && (
            <ul className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
              {no.map((s) => (
                <li key={s.id} className="rounded-xl bg-ink-850 px-3.5 py-2.5">
                  <p className="text-[13.5px] font-medium text-slate-200">{s.shortKa}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">{s.reasonKa}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ── risks ──────────────────────────────────────────────────────────────── */

function RiskCard({ r, input, onAdd }: { r: RiskResult; input: PreventionInput; onAdd: () => void }) {
  let visual: ReactNode = null;
  if (r.available && r.band && r.value !== undefined) {
    if (r.id === 'score2') visual = <Gauge fraction={Math.min(1, r.value / 30)} band={r.band} label={`${r.value}%`} sub={r.bandKa} />;
    else if (r.id === 'findrisc') visual = <Gauge fraction={Math.min(1, r.value / 26)} band={r.band} label={`${r.value}`} sub={`${r.bandKa} · ქულა`} />;
    else if (r.id === 'bmi')
      visual = (
        <ScaleBar min={15} max={40} value={r.value} unit="" zones={[{ to: 18.5, band: 'moderate', label: '<18.5' }, { to: 25, band: 'low', label: 'ნორმა' }, { to: 30, band: 'moderate', label: '25–30' }, { to: 40, band: 'high', label: '30+' }]} />
      );
    else if (r.id === 'waist') {
      const [a, b] = input.sex === 'male' ? [94, 102] : [80, 88];
      visual = <ScaleBar min={a - 25} max={b + 25} value={r.value} unit="სმ" zones={[{ to: a, band: 'low', label: `<${a}` }, { to: b, band: 'moderate', label: `${a}–${b}` }, { to: b + 25, band: 'high', label: `>${b}` }]} />;
    } else
      visual = (
        <div className="flex items-baseline gap-2">
          <span className="text-[34px] font-bold leading-none tabular-nums text-fg">{r.id === 'bp' && input.diastolicBp ? `${r.value}/${input.diastolicBp}` : r.value}</span>
          <span className="text-[13px] text-slate-400">{r.unitKa}</span>
        </div>
      );
  }
  return (
    <article className="panel flex flex-col gap-3 p-5 animate-fade-up">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[14.5px] font-semibold leading-snug text-fg">{r.titleKa}</h3>
        {r.band && (
          <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: BAND_COLOR[r.band] }}>
            {BAND_SHORT[r.band]}
          </span>
        )}
      </div>
      {visual}
      <p className="text-[13px] leading-relaxed text-slate-300">{r.summaryKa}</p>
      {r.leverKa && (
        <div className="rounded-xl bg-clinical-low/10 p-3.5">
          <p className="flex items-start gap-2 text-[13px] font-medium text-fg">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-clinical-low" /> {r.leverKa}
          </p>
          {r.leverFrom !== undefined && r.leverTo !== undefined && (
            <div className="mt-3">
              <LeverBars from={r.leverFrom} to={r.leverTo} />
            </div>
          )}
        </div>
      )}
      {r.missingKa && (
        <button type="button" onClick={onAdd} className="inline-flex items-center gap-1.5 self-start rounded-full border border-clinical-moderate/50 px-3 py-1.5 text-[12.5px] text-clinical-moderate transition hover:bg-clinical-moderate/10">
          დაამატეთ: {r.missingKa.join(', ')} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2">{r.available && <Explain input={input} kind="risk" id={r.id} fallback={r.summaryKa} />}</div>
      <Sources sources={r.sources} />
    </article>
  );
}

/* ── main view ──────────────────────────────────────────────────────────── */

const NAV = [
  { id: 'agenda', label: 'კალენდარი' },
  { id: 'simulator', label: 'სიმულატორი' },
  { id: 'calendar', label: 'კვლევები' },
  { id: 'risk', label: 'რისკი' },
  { id: 'vaccines', label: 'ვაქცინები' },
  { id: 'pregnancy', label: 'ორსულობამდე' },
  { id: 'notneeded', label: 'არ გჭირდებათ' },
  { id: 'goals', label: 'მიზნები' },
  { id: 'warnings', label: 'გაფრთხილება' },
];

export function PlanView({
  plan, input, onEdit, onDone, changes, progress, toggleProgress, today, planned, setPlanned, lead, setLead,
}: {
  plan: Plan;
  input: PreventionInput;
  onEdit: () => void;
  onDone: (group: string, date: string) => void;
  changes: string[];
  progress: Record<string, boolean>;
  toggleProgress: (key: string) => void;
  today: string;
  planned: Record<string, string>;
  setPlanned: (group: string, date: string | undefined) => void;
  lead: ReminderLead;
  setLead: (l: ReminderLead) => void;
}) {
  const nav = NAV.filter((n) => n.id !== 'pregnancy' || plan.preconception);
  const [showAllLow, setShowAllLow] = useState(false);
  return (
    <div className="mx-auto max-w-6xl space-y-10 pb-16">
      <Hero plan={plan} onEdit={onEdit} changes={changes} />

      <nav aria-label="გეგმის ნაწილები" className="no-print sticky top-[60px] z-20 -mx-3 overflow-x-auto bg-[rgb(var(--bg)/0.85)] px-3 py-2 backdrop-blur-md">
        <div className="flex gap-2">
          {nav.map((n) => (
            <a key={n.id} href={`#${n.id}`} className="shrink-0 rounded-full border border-line bg-ink-900 px-3.5 py-1.5 text-[12.5px] text-slate-300 transition hover:border-cyan/50 hover:text-fg">
              {n.label}
            </a>
          ))}
        </div>
      </nav>

      {plan.missingKa.length > 0 && (
        <button type="button" onClick={onEdit} className="flex w-full items-start gap-3 rounded-2xl border border-clinical-moderate/40 bg-clinical-moderate/[0.07] p-4 text-left transition hover:bg-clinical-moderate/10">
          <GaugeIcon className="mt-0.5 h-5 w-5 shrink-0 text-clinical-moderate" />
          <span className="text-[13.5px] leading-relaxed text-slate-200">
            <b className="text-fg">გეგმა შეიძლება უფრო ზუსტი იყოს.</b> აკლია: {plan.missingKa.slice(0, 6).join(', ')}. სისტემა გამოტოვებულს არ ივარაუდებს — დაამატეთ, როცა გეცოდინებათ.
          </span>
        </button>
      )}

      <div className="space-y-5">
        <SectionHead id="agenda" icon={CalendarPlus} eyebrow="კალენდარი და შეხსენებები" title="დაგეგმეთ — და აღარ დაგავიწყდებათ" sub="დაუნიშნეთ თარიღი ყოველ კვლევას. განმეორებითი კვლევები თავისით დაემატება სწორი ინტერვალით და შეწყდება იმ ასაკში, როცა აღარ არის საჭირო. შეხსენება — ტელეფონის კალენდარში ან Google Calendar-ში." />
        <CalendarView plan={plan} today={today} planned={planned} setPlanned={setPlanned} onDone={onDone} lead={lead} setLead={setLead} />
      </div>

      <div className="space-y-5">
        <SectionHead id="simulator" icon={SlidersHorizontal} eyebrow="რისკის სიმულატორი" title="რა მოხდება, თუ…?" sub="7 სიმულატორი: გული, დიაბეტი, ფილტვის კიბო, ჰიპერტენზია, ოსტეოპოროზი, ალკოჰოლი და მოწევის შეწყვეტა. ყოველი — ოფიციალური, გამოქვეყნებული მოდელით." />
        <SimulatorHub initial={{ age: plan.ageYears, sex: plan.sex, heightCm: input.heightCm, weightKg: input.weightKg }} extra={input} />
      </div>

      <Screening plan={plan} input={input} onDone={onDone} />

      <div className="space-y-5">
        <SectionHead id="risk" icon={GaugeIcon} eyebrow="4.2 · რისკის კალკულატორები" title="თქვენი რისკი — და რა შეამცირებს მას ყველაზე მეტად" sub="SCORE2 გათვლილია საქართველოსთვის (ESC-ის ძალიან მაღალი რისკის რეგიონი), FINDRISC — დიაბეტის რისკი ანალიზის გარეშე." />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plan.risks.map((r) => (
            <RiskCard key={r.id} r={r} input={input} onAdd={onEdit} />
          ))}
        </div>
      </div>

      <div className="space-y-5">
        <SectionHead id="vaccines" icon={Syringe} eyebrow="4.3 · ვაქცინაცია" title="მოზრდილთა ვაქცინაციის კალენდარი" sub="WHO-სა და საერთაშორისო კალენდრების მიხედვით. საქართველოს ეროვნული კალენდარი და უფასო ვაქცინები დააზუსტეთ NCDC-ში ან ოჯახის ექიმთან." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {plan.vaccines.map((v, i) => (
            <article key={v.id} className="panel flex flex-col gap-2 p-4 animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[14.5px] font-semibold text-fg">{v.titleKa}</h3>
                <span
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                    v.status === 'up_to_date' ? STATUS_STYLE.up_to_date.pill : v.status === 'recommended' ? STATUS_STYLE.due.pill : STATUS_STYLE.discuss.pill,
                  )}
                >
                  {VACCINE_STATUS_KA[v.status]}
                </span>
              </div>
              <p className="text-[12.5px] font-medium text-slate-300">{v.frequencyKa}</p>
              <p className="text-[12.5px] leading-relaxed text-slate-400">{v.reasonKa}</p>
              {v.noteKa && <p className="text-[12.5px] text-clinical-info">{v.noteKa}</p>}
              {v.nextDue && <p className="text-[12.5px] text-slate-300">შემდეგი: {fmtDate(v.nextDue)}</p>}
              <div className="mt-auto pt-1">
                <Sources sources={v.sources} />
              </div>
            </article>
          ))}
        </div>
      </div>

      {plan.preconception && (
        <div className="space-y-5">
          <SectionHead id="pregnancy" icon={Baby} eyebrow="4.4 · ორსულობამდე მომზადება" title="მზადება ჯანმრთელი ორსულობისთვის" sub="მონიშნეთ, რაც უკვე გააკეთეთ — პროგრესი თქვენს ტელეფონზე ინახება." />
          <div className="grid gap-3 md:grid-cols-2">
            {plan.preconception.map((p) => {
              const key = `pre:${p.id}`;
              const done = progress[key];
              return (
                <article key={p.id} className={cn('panel flex gap-3 p-4 transition', done && 'opacity-75')}>
                  <button
                    type="button"
                    aria-pressed={done}
                    aria-label={`${p.titleKa} — მონიშვნა`}
                    onClick={() => toggleProgress(key)}
                    className={cn('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition', done ? 'border-clinical-low bg-clinical-low text-white' : 'border-line')}
                  >
                    {done && <Check className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 space-y-1.5">
                    <h3 className={cn('text-[14.5px] font-semibold text-fg', done && 'line-through')}>{p.titleKa}</h3>
                    <p className="text-[13px] leading-relaxed text-slate-300">{p.textKa}</p>
                    {p.actionKa &&
                      (p.link ? (
                        <Link href={p.link} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-cyan hover:underline">
                          {p.actionKa} <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      ) : (
                        <p className="text-[12.5px] font-medium text-cyan">{p.actionKa}</p>
                      ))}
                    <Sources sources={p.sources} />
                  </div>
                </article>
              );
            })}
          </div>
          <a href={whatsappLink('გამარჯობა, ორსულობის დაგეგმვაზე კონსულტაცია მსურს.')} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
            <Phone className="h-4 w-4" /> ჩაეწერეთ კონსულტაციაზე
          </a>
        </div>
      )}

      <div className="space-y-5">
        <SectionHead id="notneeded" icon={PiggyBank} eyebrow="4.5 · ეს არ გჭირდებათ" title="რაზე არ ღირს ფულის დახარჯვა" sub="პოპულარული „პროფილაქტიკა“, რომელსაც მტკიცებულება არ აქვს. დაზოგილი თანხა თქვენი კალენდრის რეალურ კვლევებს მოახმარეთ — ისინი ხშირად იაფია ან უფასოა." />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(showAllLow ? plan.lowValue : plan.lowValue.slice(0, 6)).map((l, i) => (
            <article key={l.id} className="group relative overflow-hidden rounded-2xl border border-line bg-ink-900 p-5 shadow-panel animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
              <span aria-hidden className="absolute -right-6 -top-6 grid h-20 w-20 place-items-center rounded-full bg-clinical-critical/10">
                <Ban className="h-7 w-7 text-clinical-critical/70" />
              </span>
              <h3 className="pr-14 text-[15px] font-semibold leading-snug text-fg">{l.titleKa}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-300">{l.whyNotKa}</p>
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-clinical-low/10 p-3 text-[12.5px] leading-relaxed text-slate-200">
                <PiggyBank className="mt-0.5 h-4 w-4 shrink-0 text-clinical-low" /> {l.insteadKa}
              </p>
              <div className="mt-3 space-y-1.5">
                <Sources sources={l.sources} />
                {l.registryId && (
                  <Link href="/medication-review" className="inline-flex items-center gap-1 text-[12px] text-cyan hover:underline">
                    შეამოწმეთ თქვენი წამლები <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      {plan.lowValue.length > 6 && (
        <div className="-mt-5 text-center">
          <button type="button" className="btn" onClick={() => setShowAllLow((v) => !v)}>
            {showAllLow ? 'ნაკლების ჩვენება' : `კიდევ ${plan.lowValue.length - 6} ჩანაწერი`}
          </button>
        </div>
      )}

      {plan.goals.length > 0 && (
        <div className="space-y-5">
          <SectionHead id="goals" icon={Target} eyebrow="4.6 · ცხოვრების წესი" title="თქვენი გაზომვადი მიზნები" sub="ზოგადი რჩევების ნაცვლად — 1–3 კონკრეტული მიზანი, თქვენი რისკის მიხედვით. მონიშნეთ შესრულებული ნაბიჯები." />
          <div className="grid gap-4 lg:grid-cols-3">
            {plan.goals.map((g, gi) => {
              const done = g.stepsKa.filter((_, i) => progress[`goal:${g.id}:${i}`]).length;
              const pct = Math.round((done / g.stepsKa.length) * 100);
              return (
                <article key={g.id} className="rounded-3xl bg-gradient-to-b from-[#1FC3F5] to-[#D5EEF6] p-5 text-navy shadow-panel animate-fade-up dark:from-[#0B8DB8] dark:to-[#173B52] dark:text-white" style={{ animationDelay: `${gi * 80}ms` }}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[17px] font-bold leading-snug">{g.titleKa}</h3>
                    <span className="shrink-0 rounded-full bg-navy px-2.5 py-1 text-[12px] font-semibold text-white tabular-nums dark:bg-white dark:text-navy">{pct}%</span>
                  </div>
                  <p className="mt-2 text-[13.5px] font-semibold">{g.targetKa}</p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed opacity-80">{g.whyKa}</p>
                  <ul className="mt-4 space-y-2">
                    {g.stepsKa.map((step, i) => {
                      const key = `goal:${g.id}:${i}`;
                      const on = progress[key];
                      return (
                        <li key={step}>
                          <button type="button" aria-pressed={on} onClick={() => toggleProgress(key)} className="flex w-full items-start gap-2.5 rounded-xl bg-white/60 px-3 py-2 text-left text-[13px] transition hover:bg-white/80 dark:bg-white/10 dark:hover:bg-white/15">
                            <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2', on ? 'border-leadermed-green bg-leadermed-green text-white' : 'border-navy/40 dark:border-white/50')}>
                              {on && <Check className="h-3 w-3" />}
                            </span>
                            <span className={cn(on && 'line-through opacity-70')}>{step}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-3 text-navy/70 dark:text-white/70">
                    <Sources sources={g.sources} />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-5">
        <SectionHead id="warnings" icon={ShieldAlert} eyebrow="4.7 · გაფრთხილების ნიშნები" title="როდის არ უნდა დაელოდოთ" sub="ეს ბარათები ინტერნეტის გარეშეც იხსნება, თუ გვერდი ერთხელ უკვე გახსენით." />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plan.warnings.map((w) => (
            <article key={w.id} className={cn('flex flex-col gap-3 rounded-2xl border p-5', w.call112 ? 'border-clinical-critical/40 bg-clinical-critical/[0.06]' : 'border-clinical-high/35 bg-clinical-high/[0.05]')}>
              <h3 className="flex items-center gap-2 text-[16px] font-bold text-fg">
                {w.call112 ? <Siren className="h-5 w-5 text-clinical-critical" /> : <AlertOctagon className="h-5 w-5 text-clinical-high" />} {w.titleKa}
              </h3>
              <ul className="space-y-1.5">
                {w.signsKa.map((s) => (
                  <li key={s} className="flex gap-2 text-[13px] leading-relaxed text-slate-200">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-clinical-critical/70" />
                    {s}
                  </li>
                ))}
              </ul>
              <p className="text-[13px] font-medium leading-relaxed text-fg">{w.actionKa}</p>
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                {w.id === 'cancer-flags' ? (
                  <a href={whatsappLink('გამარჯობა, მინდა ექიმთან კონსულტაცია სიმპტომის გამო.')} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-clinical-high px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110">
                    <MessageCircle className="h-4 w-4" /> ექიმთან კავშირი
                  </a>
                ) : (
                  <a href="tel:112" className="inline-flex items-center gap-2 rounded-full bg-clinical-critical px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110">
                    <Phone className="h-4 w-4" /> დარეკე 112-ზე
                  </a>
                )}
                <Sources sources={w.sources} />
              </div>
            </article>
          ))}
        </div>
      </div>

      <footer className="rounded-2xl border border-line bg-ink-900 p-5 text-[12px] leading-relaxed text-slate-400">
        <p>
          <b className="text-slate-200">როგორ შედგა ეს გეგმა.</b> გეგმას ადგენს ვერსიონირებული, დეტერმინისტული წესები (ვერსია {plan.rulesVersion}). AI მხოლოდ ხსნის გეგმას და ვერც დაამატებს, ვერც ამოიღებს რეკომენდაციას. ყოველ პუნქტს აქვს წყარო. წესები კლინიკური რევიუს პროცესშია (სამუშაო ვერსია).
        </p>
        <p className="mt-2">მონაცემები ინახება მხოლოდ თქვენს ტელეფონზე ან კომპიუტერზე, სერვერზე არაფერი ინახება. გეგმა არ ცვლის ექიმთან კონსულტაციას.</p>
      </footer>
    </div>
  );
}
