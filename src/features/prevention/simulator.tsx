'use client';

import { useState } from 'react';
import { RotateCcw, SlidersHorizontal, TriangleAlert, User } from 'lucide-react';
import { bmiOf } from '@/prevention/engine';
import { findriscBand, findriscPoints } from '@/prevention/risk/findrisc';
import { mgdlToMmolChol, score2, score2Band, SCORE2_BAND_KA } from '@/prevention/risk/score2';
import type { PreventionInput, RiskBand } from '@/prevention/types';
import { cn } from '@/lib/utils';
import { BAND_COLOR, Gauge } from './visuals';

/**
 * „რა მოხდება, თუ…?“ — the same SCORE2 and FINDRISC functions the plan uses,
 * recomputed live while the person moves a slider. Nothing here is an
 * approximation of the model: it *is* the model.
 */

const toBand = (b: 'moderate' | 'high' | 'very_high'): RiskBand => (b === 'moderate' ? 'low' : b);

function Slider({ label, value, min, max, step, unit, onChange, marks, start }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; marks?: { at: number; label: string }[]; start?: number }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-slate-300">{label}</span>
        <span className="text-[15px] font-bold tabular-nums text-fg">
          {Number.isInteger(step) ? value : value.toFixed(1)} <span className="text-[11.5px] font-normal text-slate-500">{unit}</span>
        </span>
      </span>
      <span className="relative mt-2 block">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="prev-range w-full"
          style={{ background: `linear-gradient(to right, #08C6FF ${pct}%, rgb(var(--ink-700)) ${pct}%)` }}
          aria-label={label}
        />
        {start !== undefined && start >= min && start <= max && (
          <span aria-hidden className="pointer-events-none absolute -top-1 h-4 w-0.5 rounded bg-slate-400" style={{ left: `calc(${((start - min) / (max - min)) * 100}% - 1px)` }} title="თქვენი მნიშვნელობა" />
        )}
      </span>
      {marks && (
        <span className="relative mt-1 block h-4 text-[10.5px] text-slate-500">
          {marks.map((m) => (
            <span key={m.label} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${((m.at - min) / (max - min)) * 100}%` }}>
              {m.label}
            </span>
          ))}
        </span>
      )}
    </label>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-ink-850 px-3.5 py-2.5 text-left">
      <span className="text-[13px] text-slate-200">{label}</span>
      <span className={cn('relative h-6 w-11 shrink-0 rounded-full transition', on ? 'bg-cyan-brand' : 'bg-ink-600')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

/** 100 figures; the first `n` are coloured. */
function People({ n, color }: { n: number; color: string }) {
  const k = Math.max(0, Math.min(100, Math.round(n)));
  return (
    <div className="grid grid-cols-10 gap-1" role="img" aria-label={`100 ადამიანიდან ${k}`}>
      {Array.from({ length: 100 }).map((_, i) => (
        <User key={i} className="h-4 w-4 transition-colors duration-300" style={{ color: i < k ? color : 'rgb(var(--ink-600))' }} strokeWidth={2.4} />
      ))}
    </div>
  );
}

export function Score2Simulator({ input, age, standalone = false }: { input: PreventionInput; age: number; standalone?: boolean }) {
  const sex = input.sex!;
  const mgdl = input.cholUnit !== 'mmol/L';
  const fromUser = {
    smoker: input.smoking === 'current',
    sbp: input.systolicBp ?? 130,
    tc: input.totalChol ?? (mgdl ? 210 : 5.4),
    hdl: input.hdlChol ?? (mgdl ? 50 : 1.3),
  };
  const missing = !input.systolicBp || !input.totalChol || !input.hdlChol || !input.smoking;
  const [s, setS] = useState(fromUser);
  const toMmol = (v: number) => (mgdl ? mgdlToMmolChol(v) : v);

  const base = score2({ age, sex, smoker: fromUser.smoker, systolicBp: fromUser.sbp, totalChol: toMmol(fromUser.tc), hdlChol: toMmol(fromUser.hdl) });
  const now = score2({ age, sex, smoker: s.smoker, systolicBp: s.sbp, totalChol: toMmol(s.tc), hdlChol: toMmol(s.hdl) });
  if (base === null || now === null) return null;
  const band = score2Band(age, now);
  const delta = Math.round((now - base) * 10) / 10;
  const out = s.sbp < 100 || s.sbp > 200 || toMmol(s.tc) < 3 || toMmol(s.tc) > 8 || toMmol(s.hdl) < 0.6 || toMmol(s.hdl) > 2.5;
  const cholRange = mgdl ? { min: 120, max: 320, step: 1, unit: 'მგ/დლ' } : { min: 3, max: 8.5, step: 0.1, unit: 'მმოლ/ლ' };
  const hdlRange = mgdl ? { min: 25, max: 100, step: 1, unit: 'მგ/დლ' } : { min: 0.6, max: 2.6, step: 0.05, unit: 'მმოლ/ლ' };

  return (
    <article className="panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[16px] font-bold text-fg">
            <SlidersHorizontal className="h-5 w-5 text-cyan" /> რა მოხდება, თუ…? — გულის რისკი
          </h3>
          <button type="button" onClick={() => setS(fromUser)} className="inline-flex items-center gap-1 text-[12px] text-slate-400 hover:text-fg">
            <RotateCcw className="h-3.5 w-3.5" /> თავიდან
          </button>
        </div>
        {missing && !standalone && <p className="rounded-xl bg-clinical-moderate/10 px-3 py-2 text-[12.5px] text-clinical-moderate">ზოგი მონაცემი არ შეგიყვანიათ — სლაიდერი საშუალო მნიშვნელობიდან იწყება. ზუსტი შედეგისთვის შეავსეთ წნევა და ქოლესტერინი.</p>}
        <Toggle on={s.smoker} onChange={(v) => setS({ ...s, smoker: v })} label="ვეწევი" />
        <Slider label="ზედა (სისტოლური) წნევა" value={s.sbp} min={95} max={200} step={1} unit="მმ ვწყ. სვ." onChange={(v) => setS({ ...s, sbp: v })} start={fromUser.sbp} marks={[{ at: 130, label: 'სამიზნე: 130-ზე ნაკლები' }]} />
        <Slider label="საერთო ქოლესტერინი" value={s.tc} {...cholRange} onChange={(v) => setS({ ...s, tc: v })} start={fromUser.tc} />
        <Slider label="HDL („კარგი“) ქოლესტერინი" value={s.hdl} {...hdlRange} onChange={(v) => setS({ ...s, hdl: v })} start={fromUser.hdl} />
        {out && (
          <p className="flex items-start gap-1.5 text-[12px] text-clinical-moderate">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> მნიშვნელობა ჩვეულებრივ დიაპაზონს სცდება — მოდელის შედეგი ასეთ დროს ნაკლებად სანდოა.
          </p>
        )}
        <p className="text-[11.5px] leading-relaxed text-slate-500">ნაცრისფერი ხაზი სლაიდერზე — თქვენი ამჟამინდელი მნიშვნელობა. გათვლა: SCORE2 / SCORE2-OP, ESC-ის ძალიან მაღალი რისკის რეგიონი (საქართველო). ეს არ არის დიაგნოზი და მკურნალობის დანიშვნა.</p>
      </div>
      <div className="space-y-4">
        <Gauge fraction={Math.min(1, now / 30)} band={toBand(band)} label={`${now}%`} sub={SCORE2_BAND_KA[band]} />
        <div className="flex justify-center">
          <span className={cn('rounded-full px-3 py-1 text-[13px] font-semibold tabular-nums', delta < 0 ? 'bg-clinical-low/15 text-clinical-low' : delta > 0 ? 'bg-clinical-critical/10 text-clinical-critical' : 'bg-ink-800 text-slate-400')}>
            {delta === 0 ? 'თქვენი ამჟამინდელი რისკი' : `${delta > 0 ? '+' : ''}${delta} პროცენტული პუნქტი (იყო ${base}%)`}
          </span>
        </div>
        <div className="rounded-2xl bg-ink-850 p-4">
          <People n={now} color={BAND_COLOR[toBand(band)]} />
          <p className="mt-3 text-[13px] leading-relaxed text-slate-300">
            100 თქვენნაირი ადამიანიდან დაახლოებით <b className="text-fg tabular-nums">{Math.round(now)}</b>-ს მომდევნო 10 წელიწადში ინფარქტი ან ინსულტი დაემართება.
          </p>
        </div>
      </div>
    </article>
  );
}

export function FindriscSimulator({ input, age, standalone = false }: { input: PreventionInput; age: number; standalone?: boolean }) {
  const sex = input.sex!;
  const start = {
    weight: input.weightKg ?? 75,
    waist: input.waistCm ?? (sex === 'male' ? 94 : 84),
    active: input.activeDaily30 ?? false,
    veg: input.vegFruitDaily ?? false,
  };
  const [s, setS] = useState(start);
  if (!input.heightCm) return null;
  const fixed = {
    age, sex, bpMedication: (input.conditions ?? []).includes('hypertension_treated'), everHighGlucose: input.everHighGlucose ?? false, familyDiabetes: input.family?.diabetes ?? 'none',
  } as const;
  const bmiStart = bmiOf({ heightCm: input.heightCm, weightKg: start.weight }) ?? 25;
  const bmiNow = bmiOf({ heightCm: input.heightCm, weightKg: s.weight }) ?? 25;
  const p0 = findriscPoints({ ...fixed, bmi: bmiStart, waistCm: start.waist, activeDaily30: start.active, vegFruitDaily: start.veg });
  const p = findriscPoints({ ...fixed, bmi: bmiNow, waistCm: s.waist, activeDaily30: s.active, vegFruitDaily: s.veg });
  const b = findriscBand(p);
  const lost = Math.round((start.weight - s.weight) * 10) / 10;
  const lostPct = Math.round((lost / start.weight) * 1000) / 10;
  const partial = input.everHighGlucose === undefined || !input.family?.diabetes;

  return (
    <article className="panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[16px] font-bold text-fg">
            <SlidersHorizontal className="h-5 w-5 text-cyan" /> რა მოხდება, თუ…? — დიაბეტის რისკი
          </h3>
          <button type="button" onClick={() => setS(start)} className="inline-flex items-center gap-1 text-[12px] text-slate-400 hover:text-fg">
            <RotateCcw className="h-3.5 w-3.5" /> თავიდან
          </button>
        </div>
        {partial && !standalone && <p className="rounded-xl bg-clinical-moderate/10 px-3 py-2 text-[12.5px] text-clinical-moderate">ოჯახური ანამნეზი ან „ოდესმე მაღალი შაქარი“ არ არის შევსებული — ითვლება „არა“-დ. ზუსტი ქულისთვის შეავსეთ ფორმაში.</p>}
        <Slider label="წონა" value={s.weight} min={Math.max(35, Math.round(start.weight * 0.7))} max={Math.round(start.weight * 1.15)} step={0.5} unit="კგ" onChange={(v) => setS({ ...s, weight: v })} start={start.weight} />
        <Slider label="წელის გარშემოწერილობა" value={s.waist} min={60} max={140} step={1} unit="სმ" onChange={(v) => setS({ ...s, waist: v })} start={start.waist} marks={sex === 'male' ? [{ at: 94, label: '94' }, { at: 102, label: '102' }] : [{ at: 80, label: '80' }, { at: 88, label: '88' }]} />
        <Toggle on={s.active} onChange={(v) => setS({ ...s, active: v })} label="ყოველდღე 30+ წუთი მოძრაობა" />
        <Toggle on={s.veg} onChange={(v) => setS({ ...s, veg: v })} label="ყოველდღე ხილი ან ბოსტნეული" />
      </div>
      <div className="space-y-4">
        <Gauge fraction={Math.min(1, p / 26)} band={b.band} label={`${p}`} sub={`${b.labelKa} · ქულა`} />
        <div className="flex justify-center">
          <span className={cn('rounded-full px-3 py-1 text-[13px] font-semibold tabular-nums', p < p0 ? 'bg-clinical-low/15 text-clinical-low' : p > p0 ? 'bg-clinical-critical/10 text-clinical-critical' : 'bg-ink-800 text-slate-400')}>
            {p === p0 ? 'თქვენი ამჟამინდელი ქულა' : `${p > p0 ? '+' : ''}${p - p0} ქულა (იყო ${p0})`}
          </span>
        </div>
        <div className="rounded-2xl bg-ink-850 p-4 text-[13px] leading-relaxed text-slate-300">
          <p>
            10 წელიწადში 2-ტიპის დიაბეტი განუვითარდება <b className="text-fg">{b.riskKa}</b> ადამიანს.
          </p>
          <p className="mt-2">
            BMI: <b className="text-fg tabular-nums">{bmiNow}</b>
            {lost > 0 && (
              <>
                {' '}· კლება <b className="text-clinical-low tabular-nums">{lost} კგ ({lostPct}%)</b>
                {lostPct >= 5 && lostPct <= 7 && <span className="text-clinical-low"> — ზუსტად DPP-ის სამიზნე (5–7%)</span>}
              </>
            )}
          </p>
        </div>
      </div>
    </article>
  );
}

/**
 * Straight into the simulators — no form first. Age, sex and height are set
 * here with sliders; everything else starts from typical values the person
 * then moves themselves.
 */
export function QuickSimulator({ onBack, onPlan }: { onBack: () => void; onPlan: () => void }) {
  const [age, setAge] = useState(55);
  const [sex, setSex] = useState<'female' | 'male'>('male');
  const [height, setHeight] = useState(170);
  const input: PreventionInput = { age, sex, heightCm: height, cholUnit: 'mg/dL' };
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-navy px-6 py-7 text-white sm:px-9">
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-brand/25 blur-2xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <button type="button" onClick={onBack} className="text-[12.5px] text-white/60 hover:text-white">
              ← უკან
            </button>
            <h1 className="mt-2 flex items-center gap-2 text-[26px] font-bold sm:text-[32px]">
              <SlidersHorizontal className="h-7 w-7 text-cyan-brand" /> რისკის სიმულატორი
            </h1>
            <p className="mt-1 max-w-xl text-[14px] text-white/75">აირჩიეთ ასაკი და სქესი, მერე გადაწიეთ სლაიდერები — ინფარქტის, ინსულტის და დიაბეტის რისკი მაშინვე გადაითვლება.</p>
          </div>
          <button type="button" onClick={onPlan} className="self-start rounded-full bg-cyan-brand px-5 py-3 text-[14px] font-semibold text-white shadow-soft transition hover:bg-cyan-deep lg:self-auto">
            სრული პრევენციის გეგმა →
          </button>
        </div>
        <div className="relative mt-6 grid gap-5 rounded-2xl bg-white/10 p-5 sm:grid-cols-3">
          <label className="block">
            <span className="flex items-baseline justify-between text-[13px] text-white/80">
              ასაკი <b className="text-[18px] tabular-nums text-white">{age}</b>
            </span>
            <input type="range" min={18} max={89} value={age} onChange={(e) => setAge(Number(e.target.value))} className="prev-range mt-2 w-full" aria-label="ასაკი" style={{ background: `linear-gradient(to right, #08C6FF ${((age - 18) / 71) * 100}%, rgba(255,255,255,0.2) ${((age - 18) / 71) * 100}%)` }} />
          </label>
          <div>
            <span className="text-[13px] text-white/80">სქესი</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['female', 'male'] as const).map((s) => (
                <button key={s} type="button" aria-pressed={sex === s} onClick={() => setSex(s)} className={cn('rounded-xl py-2.5 text-[14px] font-semibold transition', sex === s ? 'bg-cyan-brand text-white' : 'bg-white/10 text-white/80 hover:bg-white/15')}>
                  {s === 'female' ? 'ქალი' : 'მამაკაცი'}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="flex items-baseline justify-between text-[13px] text-white/80">
              სიმაღლე <b className="text-[18px] tabular-nums text-white">{height} სმ</b>
            </span>
            <input type="range" min={140} max={210} value={height} onChange={(e) => setHeight(Number(e.target.value))} className="prev-range mt-2 w-full" aria-label="სიმაღლე" style={{ background: `linear-gradient(to right, #08C6FF ${((height - 140) / 70) * 100}%, rgba(255,255,255,0.2) ${((height - 140) / 70) * 100}%)` }} />
          </label>
        </div>
      </section>
      {age >= 40 ? (
        <Score2Simulator key={`s2-${sex}`} input={input} age={age} standalone />
      ) : (
        <p className="panel p-5 text-[13.5px] leading-relaxed text-slate-300">ინფარქტისა და ინსულტის 10-წლიანი რისკის მოდელი (SCORE2) 40 წლიდან გამოიყენება. ამ ასაკში მთავარია წნევის, წონის და მოწევის კონტროლი — დიაბეტის რისკი კი ქვემოთ ჩანს.</p>
      )}
      <FindriscSimulator key={`fr-${sex}`} input={input} age={age} standalone />
      <p className="text-center text-[12px] text-slate-500">სიმულატორი არ ინახავს მონაცემებს და არ ცვლის ექიმთან კონსულტაციას.</p>
    </div>
  );
}
