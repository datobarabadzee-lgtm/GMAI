'use client';

import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle, ArrowRight, Baby, Cigarette, ClipboardCheck, FlaskConical, HeartHandshake, Minus, Plus, Ruler, Stethoscope, Syringe, Users, Sparkles, ChevronDown,
} from 'lucide-react';
import { RED_FLAGS, bmiOf } from '@/prevention/engine';
import { localToday } from '@/prevention/schedule';
import type { ChronicCondition, PreventionInput, VaccineId } from '@/prevention/types';
import { cn } from '@/lib/utils';

type Patch = (patch: Partial<PreventionInput>) => void;

/* ── small inputs ──────────────────────────────────────────────────────── */

function Choice<T extends string | boolean>({ value, options, onChange, size = 'sm' }: { value: T | undefined; options: { v: T; label: string }[]; onChange: (v: T | undefined) => void; size?: 'sm' | 'lg' }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? undefined : o.v)}
            className={cn(
              'rounded-full border transition',
              size === 'lg' ? 'px-5 py-2.5 text-[15px]' : 'px-3.5 py-1.5 text-[13px]',
              on ? 'border-transparent bg-cyan-brand text-white shadow-soft' : 'border-line bg-ink-950 text-slate-300 hover:border-cyan/50',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Num({ label, unit, value, onChange, min, max, step = 1, placeholder }: { label: string; unit?: string; value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: number; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="mt-1 flex items-center rounded-xl border border-line bg-ink-950 pr-3 focus-within:border-cyan/60 focus-within:ring-2 focus-within:ring-cyan/20">
        <input
          type="number"
          inputMode="decimal"
          className="w-full min-w-0 bg-transparent px-3.5 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          value={value ?? ''}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          onChange={(e) => {
            const v = e.target.value === '' ? undefined : Number(e.target.value);
            onChange(v === undefined || Number.isNaN(v) ? undefined : v);
          }}
        />
        {unit && <span className="shrink-0 text-[12px] text-slate-500">{unit}</span>}
      </span>
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input type="date" className="field mt-1" value={value ?? ''} max={localToday()} onChange={(e) => onChange(e.target.value || undefined)} />
    </label>
  );
}

function Section({ icon: Icon, title, hint, filled, children, defaultOpen = false, id }: { icon: LucideIcon; title: string; hint: string; filled: number; children: ReactNode; defaultOpen?: boolean; id?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className={cn('overflow-hidden rounded-2xl border bg-ink-900 transition', open ? 'border-cyan/40 shadow-panel' : 'border-line')}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5">
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl transition', filled ? 'bg-cyan-brand text-white' : 'bg-ink-850 text-cyan')}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-fg">{title}</span>
          <span className="block truncate text-[12px] text-slate-400">{hint}</span>
        </span>
        {filled > 0 && <span className="chip shrink-0 border-clinical-low/40 text-clinical-low">✓ {filled}</span>}
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="animate-fade-up space-y-4 border-t border-line px-4 py-4 sm:px-5">{children}</div>}
    </section>
  );
}

const CONDITIONS: { v: ChronicCondition; label: string }[] = [
  { v: 'diabetes', label: 'დიაბეტი' },
  { v: 'cvd', label: 'ინფარქტი, ინსულტი ან გულის იშემიური დაავადება' },
  { v: 'hypertension_treated', label: 'წნევის წამალს ვიღებ' },
  { v: 'ckd', label: 'თირკმლის ქრონიკული დაავადება' },
  { v: 'copd_asthma', label: 'ასთმა ან ფილტვის ქრონიკული დაავადება' },
  { v: 'liver', label: 'ღვიძლის ქრონიკული დაავადება' },
  { v: 'immunosuppression', label: 'დაქვეითებული იმუნიტეტი' },
];

const LAST_TESTS: { group: string; label: string; female?: boolean; male?: boolean; minAge?: number }[] = [
  { group: 'bp', label: 'წნევის გაზომვა' },
  { group: 'crc', label: 'FIT ან კოლონოსკოპია', minAge: 40 },
  { group: 'breast', label: 'მამოგრაფია', female: true, minAge: 38 },
  { group: 'cervical', label: 'PAP ან HPV ტესტი', female: true },
  { group: 'diabetes', label: 'შაქრის ანალიზი', minAge: 30 },
  { group: 'lung', label: 'დაბალდოზიანი CT', minAge: 48 },
  { group: 'hcv', label: 'C ჰეპატიტის ტესტი' },
  { group: 'hiv', label: 'აივ ტესტი' },
  { group: 'hbv', label: 'B ჰეპატიტის ტესტი' },
  { group: 'osteo', label: 'დენსიტომეტრია', female: true, minAge: 50 },
  { group: 'aaa', label: 'აორტის ექო', male: true, minAge: 63 },
];

const VACCINES: { id: VaccineId; label: string }[] = [
  { id: 'influenza', label: 'გრიპი (ბოლო)' },
  { id: 'td', label: 'ტეტანუსი / Td (ბოლო)' },
  { id: 'pneumococcal', label: 'პნევმოკოკი' },
  { id: 'hpv', label: 'HPV' },
  { id: 'hepb', label: 'B ჰეპატიტი' },
  { id: 'mmr', label: 'წითელა (MMR)' },
  { id: 'zoster', label: 'ზოსტერი' },
  { id: 'rsv', label: 'RSV' },
];

function Hint({ children, action }: { children: ReactNode; action?: { label: string; run: () => void } }) {
  return (
    <p className="flex flex-wrap items-center gap-2 rounded-xl bg-clinical-moderate/10 px-3 py-2 text-[12.5px] text-clinical-moderate">
      <span>{children}</span>
      {action && (
        <button type="button" onClick={action.run} className="rounded-full bg-clinical-moderate px-2.5 py-0.5 text-[12px] font-medium text-white">
          {action.label}
        </button>
      )}
    </p>
  );
}

function BmiLive({ input }: { input: PreventionInput }) {
  const bmi = bmiOf(input);
  if (bmi === null) return null;
  const [label, tone] = bmi < 18.5 ? ['წონის ნაკლებობა', 'text-clinical-moderate'] : bmi < 25 ? ['ნორმა', 'text-clinical-low'] : bmi < 30 ? ['ჭარბი წონა', 'text-clinical-moderate'] : ['სიმსუქნე', 'text-clinical-high'];
  return (
    <p className="text-[13px] text-slate-300">
      BMI: <b className="tabular-nums text-fg">{bmi}</b> <span className={tone}>· {label}</span>
    </p>
  );
}

/** cigarettes per day × years ÷ 20 = pack-years */
function PackYears({ onUse }: { onUse: (v: number) => void }) {
  const [perDay, setPerDay] = useState<number | undefined>();
  const [years, setYears] = useState<number | undefined>();
  const py = perDay && years ? Math.round(((perDay * years) / 20) * 10) / 10 : null;
  return (
    <div className="rounded-xl border border-dashed border-line p-3">
      <p className="text-[12.5px] font-medium text-slate-300">არ იცით კოლოფ-წლები? გამოვთვალოთ:</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <Num label="ღერი დღეში" value={perDay} onChange={setPerDay} placeholder="20" />
        <Num label="რამდენი წელი" value={years} onChange={setYears} placeholder="25" />
      </div>
      {py !== null && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-slate-200">
          = <b className="tabular-nums text-fg">{py}</b> კოლოფ-წელი
          <button type="button" onClick={() => onUse(py)} className="rounded-full bg-cyan-brand px-3 py-1 text-[12px] font-medium text-white">
            გამოყენება
          </button>
        </div>
      )}
    </div>
  );
}

/* ── the form ──────────────────────────────────────────────────────────── */

export function completeness(i: PreventionInput): number {
  const checks = [
    i.heightCm && i.weightKg, i.waistCm, i.smoking, i.systolicBp, i.totalChol && i.hdlChol, i.glucoseFasting || i.hba1c,
    i.family && Object.keys(i.family).length, i.activeDaily30 !== undefined && i.vegFruitDaily !== undefined, i.lastDone && Object.keys(i.lastDone).length, i.vaccines && Object.keys(i.vaccines).length,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function IntakeForm({ input, set, onSubmit }: { input: PreventionInput; set: Patch; onSubmit: () => void }) {
  const female = input.sex === 'female';
  const age = input.age ?? 0;
  const ready = Boolean(input.age && input.age >= 18 && input.sex);
  const pct = completeness(input);
  const flags = new globalThis.Set(input.redFlags ?? []);
  const conditions = new globalThis.Set(input.conditions ?? []);
  const family = input.family ?? {};
  const setFamily = (p: Partial<NonNullable<PreventionInput['family']>>) => set({ family: { ...family, ...p } });
  // Switching units converts what is already typed, so 230 mg/dL never becomes 230 mmol/L.
  const switchCholUnit = (u: 'mg/dL' | 'mmol/L') => {
    const cur = input.cholUnit ?? 'mg/dL';
    if (u === cur) return;
    const f = u === 'mmol/L' ? 1 / 38.67 : 38.67;
    const conv = (v?: number) => (v === undefined ? undefined : u === 'mmol/L' ? Math.round(v * f * 10) / 10 : Math.round(v * f));
    set({ cholUnit: u, totalChol: conv(input.totalChol), hdlChol: conv(input.hdlChol) });
  };
  const tc = input.totalChol;
  const cholSuspect = tc === undefined ? null : (input.cholUnit ?? 'mg/dL') === 'mg/dL' && tc < 20 ? 'mmol' : input.cholUnit === 'mmol/L' && tc > 25 ? 'mgdl' : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-6">
      {/* Required — age and sex */}
      <section className="panel animate-fade-up p-5 sm:p-6">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-cyan">ნაბიჯი 1 · სავალდებულო</p>
        <h2 className="mt-1 text-xl font-bold text-fg">ვისთვის ვადგენთ გეგმას?</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <span className="label">ასაკი</span>
            <div className="mt-2 flex items-center gap-3">
              <button type="button" className="btn h-12 w-12 !p-0" aria-label="ასაკის შემცირება" onClick={() => set({ age: Math.max(18, (input.age ?? 40) - 1) })}>
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                aria-label="ასაკი წლებში"
                className="h-14 w-24 rounded-2xl border border-line bg-ink-950 text-center text-3xl font-bold text-fg outline-none focus:border-cyan/60 focus:ring-2 focus:ring-cyan/20"
                value={input.age ?? ''}
                placeholder="—"
                onChange={(e) => set({ age: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
              <button type="button" className="btn h-12 w-12 !p-0" aria-label="ასაკის გაზრდა" onClick={() => set({ age: Math.min(110, (input.age ?? 39) + 1) })}>
                <Plus className="h-4 w-4" />
              </button>
              <span className="text-sm text-slate-400">წელი</span>
            </div>
            {input.age !== undefined && input.age < 18 && <p className="mt-2 text-[12px] text-clinical-moderate">მოდული 18 წლიდან მოზრდილებისთვისაა.</p>}
          </div>
          <div>
            <span className="label">სქესი</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['female', 'male'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={input.sex === s}
                  onClick={() => set({ sex: s, ...(s === 'male' ? { pregnant: undefined, planningPregnancy: undefined, postmenopausal: undefined } : {}) })}
                  className={cn(
                    'h-14 rounded-2xl border text-[15px] font-semibold transition',
                    input.sex === s ? 'border-transparent bg-navy text-white shadow-soft dark:bg-cyan-brand' : 'border-line bg-ink-950 text-slate-300 hover:border-cyan/50',
                  )}
                >
                  {s === 'female' ? 'ქალი' : 'მამაკაცი'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Red-flag gate */}
      <section className="rounded-2xl border border-clinical-critical/35 bg-clinical-critical/[0.06] p-5 animate-fade-up">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-clinical-critical" />
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-fg">დღეს რომელიმე ეს ხომ არ გაწუხებთ?</h2>
            <p className="mt-0.5 text-[12.5px] text-slate-400">თუ კი — პრევენციის გეგმა ახლა არ არის პრიორიტეტი, და გეტყვით, რა გააკეთოთ.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {RED_FLAGS.map((f) => {
                const on = flags.has(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const next = new globalThis.Set(flags);
                      if (on) next.delete(f.id);
                      else next.add(f.id);
                      set({ redFlags: [...next] });
                    }}
                    className={cn('rounded-full border px-3 py-1.5 text-[12.5px] transition', on ? 'border-clinical-critical bg-clinical-critical text-white' : 'border-line bg-ink-950 text-slate-300 hover:border-clinical-critical/60')}
                  >
                    {f.labelKa}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-end justify-between gap-3 px-1 pt-2">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-cyan">ნაბიჯი 2 · სურვილისამებრ</p>
          <h2 className="mt-1 text-lg font-bold text-fg">რაც მეტს გვეტყვით, მით უფრო ზუსტი იქნება გეგმა</h2>
          <p className="text-[12.5px] text-slate-400">არ იცით? გამოტოვეთ — სისტემა ცხადად დაწერს, რა აკლია, და არაფერს ივარაუდებს.</p>
        </div>
      </div>

      <Section icon={Ruler} title="სხეული" hint="სიმაღლე, წონა, წელის გარშემოწერილობა" filled={[input.heightCm, input.weightKg, input.waistCm].filter(Boolean).length}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Num label="სიმაღლე" unit="სმ" value={input.heightCm} onChange={(v) => set({ heightCm: v })} placeholder="170" />
          <Num label="წონა" unit="კგ" value={input.weightKg} onChange={(v) => set({ weightKg: v })} placeholder="75" />
          <Num label="წელის გარშემოწერილობა" unit="სმ" value={input.waistCm} onChange={(v) => set({ waistCm: v })} placeholder="ჭიპის დონეზე" />
        </div>
        <BmiLive input={input} />
      </Section>

      <Section icon={Cigarette} title="მოწევა" hint="სტატუსი და კოლოფ-წლები" filled={input.smoking ? 1 : 0}>
        <Choice value={input.smoking} onChange={(v) => set({ smoking: v })} options={[{ v: 'never', label: 'არასოდეს მომიწევია' }, { v: 'former', label: 'თავი დავანებე' }, { v: 'current', label: 'ვეწევი' }]} />
        {input.smoking && input.smoking !== 'never' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Num label="კოლოფ-წლები" unit="კოლოფი × წელი" value={input.packYears} onChange={(v) => set({ packYears: v })} placeholder="მაგ. 1 კოლოფი × 20 წელი = 20" />
            {input.smoking === 'former' && <Num label="რომელ წელს დაანებეთ თავი" value={input.quitYear} onChange={(v) => set({ quitYear: v })} placeholder="2015" />}
          </div>
        )}
        {input.smoking && input.smoking !== 'never' && <PackYears onUse={(v) => set({ packYears: v })} />}
        {input.smoking === 'former' && input.quitYear !== undefined && (input.quitYear > Number(localToday().slice(0, 4)) || (input.age !== undefined && input.quitYear < Number(localToday().slice(0, 4)) - input.age + 10)) && (
          <Hint>წელი არადამაჯერებელია — შეამოწმეთ.</Hint>
        )}
      </Section>

      <Section icon={FlaskConical} title="წნევა და ანალიზები" hint="წნევა, ქოლესტერინი, შაქარი" filled={[input.systolicBp, input.totalChol, input.hdlChol, input.glucoseFasting, input.hba1c].filter(Boolean).length}>
        <div className="grid grid-cols-2 gap-3">
          <Num label="ზედა წნევა" unit="მმ ვწყ. სვ." value={input.systolicBp} onChange={(v) => set({ systolicBp: v })} placeholder="120" />
          <Num label="ქვედა წნევა" unit="მმ ვწყ. სვ." value={input.diastolicBp} onChange={(v) => set({ diastolicBp: v })} placeholder="80" />
        </div>
        {input.systolicBp !== undefined && input.diastolicBp !== undefined && input.systolicBp <= input.diastolicBp && <Hint>ზედა წნევა ქვედაზე მეტი უნდა იყოს — ადგილები ხომ არ აგერიათ?</Hint>}
        {input.systolicBp !== undefined && (input.systolicBp < 70 || input.systolicBp > 250) && <Hint>ეს მნიშვნელობა ძალიან უჩვეულოა — შეამოწმეთ გაზომვა.</Hint>}
        <div>
          <span className="label">ქოლესტერინის ერთეული</span>
          <div className="mt-1.5">
            <Choice value={input.cholUnit ?? 'mg/dL'} onChange={(v) => switchCholUnit(v ?? 'mg/dL')} options={[{ v: 'mg/dL', label: 'მგ/დლ' }, { v: 'mmol/L', label: 'მმოლ/ლ' }]} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Num label="საერთო ქოლესტერინი" unit={input.cholUnit === 'mmol/L' ? 'მმოლ/ლ' : 'მგ/დლ'} step={0.1} value={input.totalChol} onChange={(v) => set({ totalChol: v, cholUnit: input.cholUnit ?? 'mg/dL' })} />
          <Num label="HDL („კარგი“) ქოლესტერინი" unit={input.cholUnit === 'mmol/L' ? 'მმოლ/ლ' : 'მგ/დლ'} step={0.1} value={input.hdlChol} onChange={(v) => set({ hdlChol: v, cholUnit: input.cholUnit ?? 'mg/dL' })} />
        </div>
        {cholSuspect && (
          <Hint action={{ label: cholSuspect === 'mmol' ? 'გადართვა მმოლ/ლ-ზე' : 'გადართვა მგ/დლ-ზე', run: () => set({ cholUnit: cholSuspect === 'mmol' ? 'mmol/L' : 'mg/dL' }) }}>
            {cholSuspect === 'mmol' ? 'ეს რიცხვები მმოლ/ლ-ს ჰგავს, არა მგ/დლ-ს.' : 'ეს რიცხვები მგ/დლ-ს ჰგავს, არა მმოლ/ლ-ს.'}
          </Hint>
        )}
        {input.totalChol !== undefined && input.hdlChol !== undefined && input.hdlChol >= input.totalChol && <Hint>HDL საერთო ქოლესტერინზე ნაკლები უნდა იყოს — შეამოწმეთ.</Hint>}
        <div className="grid grid-cols-2 gap-3">
          <Num label="უზმოზე გლუკოზა" unit="მგ/დლ" value={input.glucoseFasting} onChange={(v) => set({ glucoseFasting: v, glucoseUnit: 'mg/dL' })} placeholder="95" />
          <Num label="HbA1c" unit="%" step={0.1} value={input.hba1c} onChange={(v) => set({ hba1c: v })} placeholder="5.4" />
        </div>
        {input.glucoseFasting !== undefined && input.glucoseFasting < 30 && (
          <Hint action={{ label: `გადაყვანა: ${Math.round(input.glucoseFasting * 18)} მგ/დლ`, run: () => set({ glucoseFasting: Math.round(input.glucoseFasting! * 18), glucoseUnit: 'mg/dL' }) }}>ეს მმოლ/ლ-ს ჰგავს (მგ/დლ = მმოლ/ლ × 18).</Hint>
        )}
        {input.hba1c !== undefined && input.hba1c > 20 && <Hint>HbA1c პროცენტებში იწერება (მაგ. 5.6) — mmol/mol ხომ არ არის?</Hint>}
      </Section>

      <Section icon={Users} title="ოჯახური ანამნეზი" hint="მშობლები, და-ძმა, შვილები" filled={Object.values(family).filter((v) => v !== undefined && v !== 'none' && v !== false).length}>
        {[
          { k: 'earlyCvd' as const, label: 'ინფარქტი ან ინსულტი ახალგაზრდა ასაკში (მამაკაცი <55, ქალი <65)' },
          { k: 'colorectalCancer' as const, label: 'მსხვილი ნაწლავის კიბო' },
          { k: 'breastOrOvarianCancer' as const, label: 'სარძევე ჯირკვლის ან საკვერცხის კიბო' },
        ].map((x) => (
          <div key={x.k} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13.5px] text-slate-200">{x.label}</span>
            <Choice value={family[x.k]} onChange={(v) => setFamily({ [x.k]: v })} options={[{ v: true, label: 'კი' }, { v: false, label: 'არა' }]} />
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13.5px] text-slate-200">დიაბეტი ოჯახში</span>
          <Choice value={family.diabetes} onChange={(v) => setFamily({ diabetes: v })} options={[{ v: 'none', label: 'არა' }, { v: 'second', label: 'ბებია/ბაბუა, ბიძა, დეიდა, ბიძაშვილი' }, { v: 'first', label: 'მშობელი, და-ძმა, შვილი' }]} />
        </div>
      </Section>

      <Section icon={HeartHandshake} title="ცხოვრების წესი" hint="დიაბეტის რისკის 3 მარტივი კითხვა" filled={[input.activeDaily30, input.vegFruitDaily, input.everHighGlucose].filter((v) => v !== undefined).length}>
        {[
          { k: 'activeDaily30' as const, label: 'ყოველდღე 30 წუთზე მეტს მოძრაობთ? (სიარული, სამუშაო, სპორტი)' },
          { k: 'vegFruitDaily' as const, label: 'ყოველდღე ჭამთ ხილს ან ბოსტნეულს?' },
          { k: 'everHighGlucose' as const, label: 'ოდესმე გითქვამთ, რომ შაქარი მომატებული გქონდათ? (მათ შორის ორსულობისას)' },
        ].map((x) => (
          <div key={x.k} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13.5px] text-slate-200">{x.label}</span>
            <Choice value={input[x.k]} onChange={(v) => set({ [x.k]: v })} options={[{ v: true, label: 'კი' }, { v: false, label: 'არა' }]} />
          </div>
        ))}
      </Section>

      <Section icon={Stethoscope} title="ქრონიკული დაავადებები" hint="ცვლის რისკის შეფასებას და ვაქცინებს" filled={conditions.size}>
        <div className="flex flex-wrap gap-2">
          {CONDITIONS.map((c) => {
            const on = conditions.has(c.v);
            return (
              <button
                key={c.v}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = new globalThis.Set(conditions);
                  if (on) next.delete(c.v);
                  else next.add(c.v);
                  set({ conditions: [...next] });
                }}
                className={cn('rounded-full border px-3 py-1.5 text-[12.5px] transition', on ? 'border-transparent bg-cyan-brand text-white' : 'border-line bg-ink-950 text-slate-300 hover:border-cyan/50')}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </Section>

      {female && (
        <Section icon={Baby} title="ქალის ჯანმრთელობა" hint="ორსულობა, დაგეგმვა, მენოპაუზა" filled={[input.pregnant, input.planningPregnancy, input.postmenopausal].filter((v) => v !== undefined).length}>
          {[
            { k: 'pregnant' as const, label: 'ამჟამად ორსულად ვარ' },
            { k: 'planningPregnancy' as const, label: 'ვგეგმავ ორსულობას' },
            { k: 'postmenopausal' as const, label: 'მენოპაუზა დამიდგა' },
          ].map((x) => (
            <div key={x.k} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13.5px] text-slate-200">{x.label}</span>
              <Choice value={input[x.k]} onChange={(v) => set({ [x.k]: v })} options={[{ v: true, label: 'კი' }, { v: false, label: 'არა' }]} />
            </div>
          ))}
        </Section>
      )}

      <Section icon={ClipboardCheck} title="ბოლო კვლევები" hint="როდის ჩაიტარეთ ბოლოს — გამოვთვლით შემდეგ ვადას" filled={Object.keys(input.lastDone ?? {}).length}>
        <div className="grid gap-3 sm:grid-cols-2">
          {LAST_TESTS.filter((t) => (!t.female || female) && (!t.male || input.sex === 'male') && (!t.minAge || age >= t.minAge)).map((t) => (
            <DateField
              key={t.group}
              label={t.label}
              value={input.lastDone?.[t.group]}
              onChange={(v) => {
                const next = { ...(input.lastDone ?? {}) };
                if (v) next[t.group] = v;
                else delete next[t.group];
                set({ lastDone: next });
              }}
            />
          ))}
        </div>
      </Section>

      <Section icon={Syringe} title="ვაქცინაცია" hint="მონიშნეთ, რაც გაკეთებული გაქვთ" filled={Object.values(input.vaccines ?? {}).filter((v) => v?.done).length}>
        <div className="space-y-2.5">
          {VACCINES.map((v) => {
            const cur = input.vaccines?.[v.id];
            const dated = v.id === 'influenza' || v.id === 'td';
            return (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-ink-950/60 px-3 py-2">
                <span className="text-[13.5px] text-slate-200">{v.label}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {dated && cur?.done && (
                    <input
                      type="date"
                      aria-label={`${v.label} — თარიღი`}
                      className="rounded-lg border border-line bg-ink-950 px-2 py-1 text-[12.5px] text-slate-200"
                      value={cur.lastDate ?? ''}
                      max={localToday()}
                      onChange={(e) => set({ vaccines: { ...(input.vaccines ?? {}), [v.id]: { done: true, lastDate: e.target.value || undefined } } })}
                    />
                  )}
                  <Choice
                    value={cur?.done}
                    onChange={(d) => {
                      const next = { ...(input.vaccines ?? {}) };
                      if (d === undefined) delete next[v.id];
                      else next[v.id] = { ...cur, done: d };
                      set({ vaccines: next });
                    }}
                    options={[{ v: true, label: 'გაკეთებულია' }, { v: false, label: 'არა / არ ვიცი' }]}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Sticky action bar */}
      <div className="no-print sticky bottom-[84px] z-30 lg:bottom-3 rounded-2xl border border-line bg-ink-900/95 px-4 py-3 shadow-panel backdrop-blur-md" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center gap-4">
          <div className="hidden min-w-0 flex-1 sm:block">
            <div className="flex items-center justify-between text-[12px] text-slate-400">
              <span>გეგმის სიზუსტე</span>
              <span className="font-semibold text-fg tabular-nums">{pct}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-800">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-brand to-leadermed-green transition-all duration-500" style={{ width: `${Math.max(6, pct)}%` }} />
            </div>
          </div>
          <button type="button" disabled={!ready} onClick={onSubmit} className="btn btn-primary h-12 flex-1 text-[15px] sm:flex-none sm:px-7">
            <Sparkles className="h-4 w-4" /> გეგმის შექმნა <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        {!ready && <p className="mt-1 text-center text-[11.5px] text-slate-500 sm:text-left">შეიყვანეთ ასაკი და სქესი</p>}
      </div>
    </div>
  );
}
