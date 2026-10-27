'use client';

import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bone, CigaretteOff, Droplet, ExternalLink, HeartPulse, Activity, RotateCcw, Wind, Wine, Clock3, Wallet } from 'lucide-react';
import { auditC, auditCPositive, framinghamHypertension, lifeYearsGained, ostScore, OST_DXA_BELOW, plcom2012, PLCO_THRESHOLD } from '@/prevention/risk/more-models';
import type { PreventionInput, RiskBand } from '@/prevention/types';
import { cn } from '@/lib/utils';
import { BAND_COLOR, Gauge } from './visuals';
import { FindriscSimulator, People, Score2Simulator, Slider, Toggle } from './simulator';

/**
 * SIMULATOR HUB — seven tools, one person.
 * Age, sex, height and weight are set once at the top and shared by every tool.
 * Each tool runs its own published model, named under it with a link.
 */

export type Person = { age: number; sex: 'female' | 'male'; heightCm: number; weightKg: number };

type ToolId = 'heart' | 'diabetes' | 'lung' | 'bp' | 'bone' | 'alcohol' | 'quit';

const TOOLS: { id: ToolId; icon: LucideIcon; titleKa: string; subKa: string }[] = [
  { id: 'heart', icon: HeartPulse, titleKa: 'ინფარქტი და ინსულტი', subKa: '10-წლიანი რისკი · SCORE2' },
  { id: 'diabetes', icon: Droplet, titleKa: 'დიაბეტი', subKa: '10-წლიანი რისკი · FINDRISC' },
  { id: 'lung', icon: Wind, titleKa: 'ფილტვის კიბო', subKa: 'მწეველებისთვის · PLCOm2012' },
  { id: 'bp', icon: Activity, titleKa: 'ჰიპერტენზია', subKa: '4-წლიანი რისკი · Framingham' },
  { id: 'bone', icon: Bone, titleKa: 'ოსტეოპოროზი', subKa: 'დენსიტომეტრია მჭირდება? · OST' },
  { id: 'alcohol', icon: Wine, titleKa: 'ალკოჰოლი', subKa: '3 კითხვა · AUDIT-C' },
  { id: 'quit', icon: CigaretteOff, titleKa: 'მოწევის შეწყვეტა', subKa: 'ფული, წლები, აღდგენა · WHO' },
];

function Source({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11.5px] text-cyan hover:underline">
      {children} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function Card({ title, icon: Icon, children, reset }: { title: string; icon: LucideIcon; children: ReactNode; reset?: () => void }) {
  return (
    <article className="panel p-5 sm:p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[16px] font-bold text-fg">
            <Icon className="h-5 w-5 text-cyan" /> {title}
          </h3>
          {reset && (
            <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-[12px] text-slate-400 hover:text-fg">
              <RotateCcw className="h-3.5 w-3.5" /> თავიდან
            </button>
          )}
        </div>
        {children}
      </div>
    </article>
  );
}

const bmiOfPerson = (p: Person) => Math.round((p.weightKg / Math.pow(p.heightCm / 100, 2)) * 10) / 10;

/* ── 🫁 lung ──────────────────────────────────────────────────────────── */

function LungTool({ person }: { person: Person }) {
  const start = { status: 'current' as 'current' | 'former', perDay: 20, years: Math.max(1, Math.min(person.age - 16, 30)), quit: 0, copd: false, family: false, cancer: false, education: 4 as 1 | 2 | 3 | 4 | 5 | 6 };
  const [s, setS] = useState(start);
  const input = { age: person.age, education: s.education, bmi: bmiOfPerson(person), copd: s.copd, personalCancer: s.cancer, familyLungCancer: s.family, cigsPerDay: s.perDay, yearsSmoked: s.years };
  const risk = plcom2012({ ...input, current: s.status === 'current', yearsSinceQuit: s.status === 'former' ? s.quit : 0 });
  const ifQuit = s.status === 'current' ? plcom2012({ ...input, current: false, yearsSinceQuit: 5 }) : null;
  const band: RiskBand = risk >= 5 ? 'very_high' : risk >= PLCO_THRESHOLD ? 'high' : risk >= 0.8 ? 'moderate' : 'low';
  const outOfRange = person.age < 50 || person.age > 80;
  return (
    <article className="panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[16px] font-bold text-fg">
            <Wind className="h-5 w-5 text-cyan" /> ფილტვის კიბოს 6-წლიანი რისკი
          </h3>
          <button type="button" onClick={() => setS(start)} className="inline-flex items-center gap-1 text-[12px] text-slate-400 hover:text-fg">
            <RotateCcw className="h-3.5 w-3.5" /> თავიდან
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(['current', 'former'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={s.status === v} onClick={() => setS({ ...s, status: v, quit: v === 'former' ? Math.max(1, s.quit) : 0 })} className={cn('rounded-xl py-2.5 text-[13.5px] font-medium transition', s.status === v ? 'bg-navy text-white dark:bg-cyan-brand' : 'bg-ink-850 text-slate-300')}>
              {v === 'current' ? 'ვეწევი' : 'თავი დავანებე'}
            </button>
          ))}
        </div>
        <Slider label="ღერი დღეში" value={s.perDay} min={1} max={60} step={1} unit="ღერი" onChange={(v) => setS({ ...s, perDay: v })} />
        <Slider label="რამდენი წელი ეწეოდით" value={s.years} min={1} max={Math.max(2, person.age - 10)} step={1} unit="წელი" onChange={(v) => setS({ ...s, years: v })} />
        {s.status === 'former' && <Slider label="რამდენი წელია, რაც თავი დაანებეთ" value={s.quit} min={1} max={40} step={1} unit="წელი" onChange={(v) => setS({ ...s, quit: v })} />}
        <Toggle on={s.copd} onChange={(v) => setS({ ...s, copd: v })} label="ფილტვის ქრონიკული ობსტრუქციული დაავადება (ფქოდ) ან ემფიზემა" />
        <Toggle on={s.family} onChange={(v) => setS({ ...s, family: v })} label="ოჯახში ფილტვის კიბო" />
        <Toggle on={s.cancer} onChange={(v) => setS({ ...s, cancer: v })} label="ადრე მქონდა სიმსივნე" />
        <label className="block text-[13px] text-slate-300">
          განათლება
          <select value={s.education} onChange={(e) => setS({ ...s, education: Number(e.target.value) as typeof s.education })} className="field mt-1">
            <option value={1}>საშუალოზე ნაკლები</option>
            <option value={2}>საშუალო</option>
            <option value={3}>პროფესიული</option>
            <option value={4}>არასრული უმაღლესი</option>
            <option value={5}>უმაღლესი</option>
            <option value={6}>მაგისტრატურა ან მეტი</option>
          </select>
        </label>
        <p className="text-[11.5px] leading-relaxed text-slate-500">
          მოდელი: PLCOm2012 (NEJM 2013), BMI {bmiOfPerson(person)} ზედა პარამეტრებიდან. განათლება მოდელის ნაწილია — ის ოფიციალურ ფორმულაში შედის. <Source href="https://pubmed.ncbi.nlm.nih.gov/23425165/">წყარო</Source>
        </p>
      </div>
      <div className="space-y-4">
        <Gauge fraction={Math.min(1, risk / 10)} band={band} label={`${risk.toFixed(2)}%`} sub="6 წელიწადში" />
        <div className="rounded-2xl bg-ink-850 p-4 text-[13px] leading-relaxed text-slate-300">
          {risk >= PLCO_THRESHOLD ? (
            <p>
              რისკი ≥{PLCO_THRESHOLD}% — ეს ის ზღვარია, რომლის ზემოთაც კვლევებში <b className="text-fg">დაბალდოზიანი CT სკრინინგი</b> რეკომენდებულია. განიხილეთ ექიმთან.
            </p>
          ) : (
            <p>რისკი სკრინინგის ზღვარზე ({PLCO_THRESHOLD}%) დაბალია.</p>
          )}
          {ifQuit !== null && (
            <p className="mt-2 font-medium text-clinical-low">
              თუ ახლა თავს დაანებებთ, 5 წლის შემდეგ რისკი იქნება ≈{ifQuit}% (ახლა {risk}%).
            </p>
          )}
          {outOfRange && <p className="mt-2 text-clinical-moderate">მოდელი შემუშავებულია 50–80 წლის ასაკისთვის — სხვა ასაკში შედეგი ნაკლებად სანდოა.</p>}
        </div>
      </div>
    </article>
  );
}

/* ── 🩺 hypertension ──────────────────────────────────────────────────── */

function BpTool({ person }: { person: Person }) {
  const start = { sbp: 125, dbp: 80, smoker: false, parents: 0 as 0 | 1 | 2, weight: person.weightKg };
  const [s, setS] = useState(start);
  const bmi = Math.round((s.weight / Math.pow(person.heightCm / 100, 2)) * 10) / 10;
  const base = { age: person.age, female: person.sex === 'female', sbp: s.sbp, dbp: s.dbp, smoker: s.smoker, parents: s.parents };
  const risk = framinghamHypertension({ ...base, bmi });
  const lighter = framinghamHypertension({ ...base, bmi: Math.max(18.5, Math.round(((s.weight * 0.93) / Math.pow(person.heightCm / 100, 2)) * 10) / 10) });
  const band: RiskBand = risk >= 40 ? 'very_high' : risk >= 20 ? 'high' : risk >= 10 ? 'moderate' : 'low';
  const valid = person.age >= 20 && person.age <= 69 && s.sbp < 140 && s.dbp < 90;
  return (
    <article className="panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[16px] font-bold text-fg">
            <Activity className="h-5 w-5 text-cyan" /> ჰიპერტენზიის რისკი 4 წელიწადში
          </h3>
          <button type="button" onClick={() => setS(start)} className="inline-flex items-center gap-1 text-[12px] text-slate-400 hover:text-fg">
            <RotateCcw className="h-3.5 w-3.5" /> თავიდან
          </button>
        </div>
        <Slider label="ზედა წნევა" value={s.sbp} min={95} max={139} step={1} unit="მმ ვწყ. სვ." onChange={(v) => setS({ ...s, sbp: v })} />
        <Slider label="ქვედა წნევა" value={s.dbp} min={55} max={89} step={1} unit="მმ ვწყ. სვ." onChange={(v) => setS({ ...s, dbp: v })} />
        <Slider label="წონა" value={s.weight} min={Math.round(person.weightKg * 0.7)} max={Math.round(person.weightKg * 1.2)} step={0.5} unit="კგ" onChange={(v) => setS({ ...s, weight: v })} start={person.weightKg} />
        <Toggle on={s.smoker} onChange={(v) => setS({ ...s, smoker: v })} label="ვეწევი" />
        <div>
          <span className="text-[13px] text-slate-300">მშობლებს ჰქონდათ ჰიპერტენზია</span>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {([0, 1, 2] as const).map((n) => (
              <button key={n} type="button" aria-pressed={s.parents === n} onClick={() => setS({ ...s, parents: n })} className={cn('rounded-xl py-2 text-[13px] transition', s.parents === n ? 'bg-navy text-white dark:bg-cyan-brand' : 'bg-ink-850 text-slate-300')}>
                {n === 0 ? 'არცერთს' : n === 1 ? 'ერთს' : 'ორივეს'}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11.5px] leading-relaxed text-slate-500">
          მოდელი: Framingham (Parikh, Ann Intern Med 2008), BMI {bmi}. მხოლოდ მათთვის, ვისაც ჯერ არ აქვს ჰიპერტენზია (წნევა 140/90-ზე ნაკლები) და დიაბეტი. <Source href="https://pubmed.ncbi.nlm.nih.gov/18195335/">წყარო</Source>
        </p>
      </div>
      <div className="space-y-4">
        <Gauge fraction={Math.min(1, risk / 60)} band={band} label={`${risk}%`} sub="4 წელიწადში" />
        <div className="rounded-2xl bg-ink-850 p-4 text-[13px] leading-relaxed text-slate-300">
          <People n={risk} color={BAND_COLOR[band]} />
          <p className="mt-3">100 თქვენნაირი ადამიანიდან ≈<b className="text-fg">{Math.round(risk)}</b>-ს 4 წელიწადში ჰიპერტენზია განუვითარდება.</p>
          {lighter < risk && <p className="mt-2 font-medium text-clinical-low">წონის 7%-ით კლება → ≈{lighter}%.</p>}
          {!valid && <p className="mt-2 text-clinical-moderate">მოდელი 20–69 წლისთვისაა — ამ ასაკის გარეთ შედეგი ნაკლებად სანდოა.</p>}
        </div>
      </div>
    </article>
  );
}

/* ── 🦴 bone ──────────────────────────────────────────────────────────── */

function BoneTool({ person }: { person: Person }) {
  const [w, setW] = useState(person.weightKg);
  const score = ostScore(w, person.age);
  const refer = score < OST_DXA_BELOW;
  const band: RiskBand = score < -3 ? 'very_high' : refer ? 'high' : score < 4 ? 'moderate' : 'low';
  return (
    <Card title="ოსტეოპოროზი — მჭირდება დენსიტომეტრია?" icon={Bone}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Slider label="წონა" value={w} min={35} max={130} step={0.5} unit="კგ" onChange={setW} start={person.weightKg} />
          <p className="text-[13px] text-slate-300">
            ასაკი: <b className="text-fg">{person.age}</b> (ზემოთ შეცვალეთ)
          </p>
          <p className="text-[11.5px] leading-relaxed text-slate-500">
            OST = 0.2 × (წონა − ასაკი). მე-2-ზე ნაკლები ქულისას დენსიტომეტრია (DXA) რეკომენდებულია. ვალიდირებულია მენოპაუზის შემდგომ ქალებში. <Source href="https://pubmed.ncbi.nlm.nih.gov/14702510/">წყარო</Source>
          </p>
        </div>
        <div className="space-y-3 text-center">
          <p className="text-[52px] font-bold leading-none tabular-nums" style={{ color: BAND_COLOR[band] }}>
            {score}
          </p>
          <p className="text-[13px] text-slate-400">OST ქულა</p>
          <p className={cn('rounded-2xl p-4 text-[13.5px] leading-relaxed', refer ? 'bg-clinical-high/10 text-fg' : 'bg-clinical-low/10 text-fg')}>
            {refer ? 'ქულა 2-ზე ნაკლებია — განიხილეთ ექიმთან ძვლის სიმკვრივის კვლევა (DXA).' : 'ქულა 2 ან მეტია — ამ ინსტრუმენტით რისკი დაბალია. 65 წლის შემდეგ ქალებში დენსიტომეტრია მაინც რეკომენდებულია.'}
          </p>
          {person.sex === 'male' && <p className="text-[12px] text-clinical-moderate">ეს ინსტრუმენტი ძირითადად ქალებშია შემოწმებული — მამაკაცებში შედეგი სავარაუდოა.</p>}
        </div>
      </div>
    </Card>
  );
}

/* ── 🍷 alcohol ───────────────────────────────────────────────────────── */

const AUDIT_Q: { q: string; options: string[] }[] = [
  { q: 'რამდენად ხშირად სვამთ ალკოჰოლს?', options: ['არასოდეს', 'თვეში ერთხელ ან უფრო იშვიათად', 'თვეში 2–4-ჯერ', 'კვირაში 2–3-ჯერ', 'კვირაში 4-ჯერ ან მეტჯერ'] },
  { q: 'დალევისას ჩვეულებრივ რამდენ სტანდარტულ დოზას სვამთ?', options: ['1–2', '3–4', '5–6', '7–9', '10 ან მეტი'] },
  { q: 'რამდენად ხშირად სვამთ ერთ ჯერზე 6 ან მეტ დოზას?', options: ['არასოდეს', 'თვეში ერთხელზე ნაკლებ', 'თვეში ერთხელ', 'კვირაში ერთხელ', 'ყოველდღე ან თითქმის ყოველდღე'] },
];

function AlcoholTool({ person }: { person: Person }) {
  const [a, setA] = useState<(number | null)[]>([null, null, null]);
  const done = a.every((x) => x !== null);
  const score = auditC(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0);
  const positive = auditCPositive(score, person.sex === 'female');
  return (
    <Card title="ალკოჰოლი — 3 კითხვა (AUDIT-C)" icon={Wine} reset={() => setA([null, null, null])}>
      <p className="text-[12.5px] text-slate-400">1 სტანდარტული დოზა ≈ 10 გ ალკოჰოლი: ღვინის პატარა ჭიქა (100 მლ), ლუდის 250 მლ ან არყის 30 მლ.</p>
      <div className="space-y-4">
        {AUDIT_Q.map((q, qi) => (
          <div key={q.q}>
            <p className="text-[13.5px] font-medium text-fg">
              {qi + 1}. {q.q}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {q.options.map((o, oi) => (
                <button key={o} type="button" aria-pressed={a[qi] === oi} onClick={() => setA(a.map((x, i) => (i === qi ? oi : x)))} className={cn('rounded-full border px-3 py-1.5 text-[12.5px] transition', a[qi] === oi ? 'border-transparent bg-cyan-brand text-white' : 'border-line bg-ink-950 text-slate-300 hover:border-cyan/50')}>
                  {o}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {done && (
        <div className={cn('animate-fade-up rounded-2xl p-4 text-[13.5px] leading-relaxed', positive ? 'bg-clinical-high/10' : 'bg-clinical-low/10')}>
          <p className="text-[22px] font-bold text-fg">
            {score} <span className="text-[13px] font-normal text-slate-400">/ 12 ქულა</span>
          </p>
          <p className="mt-1 text-fg">{positive ? 'შედეგი მიუთითებს ალკოჰოლის რისკიან მოხმარებაზე. მოკლე საუბარი ექიმთან მოხმარების შემცირებაში ეფექტურად გეხმარებათ.' : 'შედეგი რისკიან მოხმარებაზე არ მიუთითებს.'}</p>
          <p className="mt-2 text-slate-400">WHO: ჯანმრთელობისთვის უსაფრთხო ალკოჰოლის დონე არ არსებობს — რაც ნაკლები, მით უკეთესი.</p>
        </div>
      )}
      <p className="text-[11.5px] text-slate-500">
        ზღვარი: ქალებში ≥3, მამაკაცებში ≥4. <Source href="https://pubmed.ncbi.nlm.nih.gov/17451397/">წყარო</Source> · <Source href="https://www.who.int/publications/i/item/WHO-MSD-MSB-01.6a">WHO AUDIT</Source>
      </p>
    </Card>
  );
}

/* ── 🚭 quitting ──────────────────────────────────────────────────────── */

const RECOVERY: { at: string; ka: string }[] = [
  { at: '20 წუთი', ka: 'გულისცემა და წნევა მცირდება' },
  { at: '12 საათი', ka: 'სისხლში ნახშირჟანგი ნორმას უბრუნდება' },
  { at: '2–12 კვირა', ka: 'სისხლის მიმოქცევა და ფილტვის ფუნქცია უმჯობესდება' },
  { at: '1–9 თვე', ka: 'ხველა და ქოშინი მცირდება' },
  { at: '1 წელი', ka: 'გულის იშემიური დაავადების რისკი მწეველისაზე დაახლოებით ორჯერ ნაკლებია' },
  { at: '5–15 წელი', ka: 'ინსულტის რისკი არამწეველისას უტოლდება' },
  { at: '10 წელი', ka: 'ფილტვის კიბოს რისკი მწეველისაზე დაახლოებით ორჯერ ნაკლებია' },
  { at: '15 წელი', ka: 'გულის დაავადების რისკი არამწეველისას უტოლდება' },
];

function QuitTool({ person }: { person: Person }) {
  const [perDay, setPerDay] = useState(20);
  const [price, setPrice] = useState(7);
  const perYear = Math.round((perDay / 20) * price * 365);
  const gain = lifeYearsGained(person.age);
  return (
    <Card title="მოწევის შეწყვეტა — რას მოიგებთ" icon={CigaretteOff} reset={() => (setPerDay(20), setPrice(7))}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Slider label="ღერი დღეში" value={perDay} min={1} max={60} step={1} unit="ღერი" onChange={setPerDay} />
          <Slider label="კოლოფის ფასი" value={price} min={2} max={20} step={0.5} unit="₾" onChange={setPrice} />
          <div className="grid grid-cols-2 gap-3">
            {[
              { l: 'წელიწადში', v: perYear },
              { l: '10 წელიწადში', v: perYear * 10 },
            ].map((x) => (
              <div key={x.l} className="rounded-2xl bg-clinical-low/10 p-4 text-center">
                <Wallet className="mx-auto h-5 w-5 text-clinical-low" />
                <p className="mt-1 text-[24px] font-bold tabular-nums text-fg">{x.v.toLocaleString('ka-GE')} ₾</p>
                <p className="text-[12px] text-slate-400">დაზოგავთ {x.l}</p>
              </div>
            ))}
          </div>
          {gain && (
            <div className="rounded-2xl bg-navy p-4 text-white">
              <p className="text-[12px] text-white/70">დაახლოებით {gain.atAge} წლის ასაკში თავის დანებება სიცოცხლეს ამატებს</p>
              <p className="text-[28px] font-bold text-cyan-brand">
                {gain.almost ? 'თითქმის ' : ''}
                {gain.years} წელს
              </p>
            </div>
          )}
        </div>
        <ol className="relative space-y-3 border-l-2 border-cyan/40 pl-5">
          {RECOVERY.map((r, i) => (
            <li key={r.at} className="relative animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="absolute -left-[27px] top-1 grid h-4 w-4 place-items-center rounded-full bg-cyan-brand">
                <Clock3 className="h-2.5 w-2.5 text-white" />
              </span>
              <p className="text-[12.5px] font-semibold text-cyan">{r.at}</p>
              <p className="text-[13px] text-slate-200">{r.ka}</p>
            </li>
          ))}
        </ol>
      </div>
      <p className="text-[11.5px] text-slate-500">
        აღდგენის ეტაპები და სიცოცხლის წლები: <Source href="https://www.who.int/news-room/questions-and-answers/item/tobacco-health-benefits-of-smoking-cessation">WHO</Source>. ფასი — თქვენი შეყვანილი.
      </p>
    </Card>
  );
}

/* ── hub ──────────────────────────────────────────────────────────────── */

export function SimulatorHub({ initial, extra }: { initial?: Partial<Person>; extra?: PreventionInput }) {
  const [person, setPerson] = useState<Person>({
    age: initial?.age ?? 55,
    sex: initial?.sex ?? 'male',
    heightCm: initial?.heightCm ?? 170,
    weightKg: initial?.weightKg ?? 78,
  });
  const [tool, setTool] = useState<ToolId>('heart');
  const input: PreventionInput = { ...(extra ?? {}), age: person.age, sex: person.sex, heightCm: person.heightCm, weightKg: person.weightKg, cholUnit: extra?.cholUnit ?? 'mg/dL' };
  const pct = (v: number, a: number, b: number) => `${((v - a) / (b - a)) * 100}%`;
  const track = (v: number, a: number, b: number) => ({ background: `linear-gradient(to right, #08C6FF ${pct(v, a, b)}, rgba(255,255,255,0.2) ${pct(v, a, b)})` });
  const key = `${person.sex}-${person.age}-${person.heightCm}-${person.weightKg}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 rounded-2xl bg-navy p-5 text-white sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="flex items-baseline justify-between text-[13px] text-white/80">
            ასაკი <b className="text-[18px] tabular-nums text-white">{person.age}</b>
          </span>
          <input type="range" min={18} max={89} value={person.age} onChange={(e) => setPerson({ ...person, age: Number(e.target.value) })} className="prev-range mt-2 w-full" aria-label="ასაკი" style={track(person.age, 18, 89)} />
        </label>
        <div>
          <span className="text-[13px] text-white/80">სქესი</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['female', 'male'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={person.sex === s} onClick={() => setPerson({ ...person, sex: s })} className={cn('rounded-xl py-2 text-[13.5px] font-semibold transition', person.sex === s ? 'bg-cyan-brand text-white' : 'bg-white/10 text-white/80 hover:bg-white/15')}>
                {s === 'female' ? 'ქალი' : 'მამაკაცი'}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="flex items-baseline justify-between text-[13px] text-white/80">
            სიმაღლე <b className="text-[18px] tabular-nums text-white">{person.heightCm} სმ</b>
          </span>
          <input type="range" min={140} max={210} value={person.heightCm} onChange={(e) => setPerson({ ...person, heightCm: Number(e.target.value) })} className="prev-range mt-2 w-full" aria-label="სიმაღლე" style={track(person.heightCm, 140, 210)} />
        </label>
        <label className="block">
          <span className="flex items-baseline justify-between text-[13px] text-white/80">
            წონა <b className="text-[18px] tabular-nums text-white">{person.weightKg} კგ</b>
          </span>
          <input type="range" min={40} max={160} value={person.weightKg} onChange={(e) => setPerson({ ...person, weightKg: Number(e.target.value) })} className="prev-range mt-2 w-full" aria-label="წონა" style={track(person.weightKg, 40, 160)} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" role="tablist" aria-label="სიმულატორები">
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
        {tool === 'heart' &&
          (person.age >= 40 ? (
            <Score2Simulator key={key} input={input} age={person.age} standalone />
          ) : (
            <p className="panel p-5 text-[13.5px] text-slate-300">SCORE2 40–89 წლის ასაკისთვისაა — ზემოთ ასაკი გაზარდეთ 40-მდე ან მეტზე.</p>
          ))}
        {tool === 'diabetes' && <FindriscSimulator key={key} input={input} age={person.age} standalone />}
        {tool === 'lung' && <LungTool key={key} person={person} />}
        {tool === 'bp' && <BpTool key={key} person={person} />}
        {tool === 'bone' && <BoneTool key={key} person={person} />}
        {tool === 'alcohol' && <AlcoholTool person={person} />}
        {tool === 'quit' && <QuitTool person={person} />}
      </div>
      <p className="text-center text-[12px] text-slate-500">სიმულატორები არ ინახავს მონაცემებს და არ ცვლის ექიმთან კონსულტაციას.</p>
    </div>
  );
}
