'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Flower2, Hourglass, Phone, Scale } from 'lucide-react';
import { addDaysIso } from '@/prevention/schedule';
import { CONCEPTION_DAY_FIVE_BEFORE, CONCEPTION_OVULATION_DAY, fertileWindows, regularCycle, TIME_TO_PREGNANCY, whenToSeeDoctor, type Cycle } from '@/reproductive/fertility';
import { daysBetween, weightGainRange, type GwgBand } from '@/reproductive/pregnancy';
import { WHATSAPP_URL } from '@/components/layout/nav';
import { cn } from '@/lib/utils';
import { Slider, Toggle } from '@/features/prevention/simulator';
import { Card, DateField, fmtShort, MONTHS, Sources } from './ui';

/* ── fertile window ───────────────────────────────────────────────────── */

const WEEKDAYS = ['ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ', 'კვი'];
type DayKind = 'period' | 'fertile' | 'ovulation';

function dayMap(cycles: Cycle[]): Map<string, DayKind> {
  const m = new Map<string, DayKind>();
  for (const c of cycles) {
    for (let d = c.periodStart; d <= c.periodEnd; d = addDaysIso(d, 1)) m.set(d, 'period');
    for (let d = c.fertileStart; d < c.ovulation; d = addDaysIso(d, 1)) m.set(d, 'fertile');
    m.set(c.ovulation, 'ovulation');
  }
  return m;
}

const DAY_TONE: Record<DayKind, string> = {
  period: 'bg-rose-500/80 text-white',
  fertile: 'bg-clinical-low/80 text-white',
  ovulation: 'bg-cyan-brand text-white ring-2 ring-cyan-brand/40',
};

export function OvulationTool({ today, lastPeriod, setLastPeriod, cycle, setCycle, periodDays, setPeriodDays }: {
  today: string;
  lastPeriod: string;
  setLastPeriod: (v: string) => void;
  cycle: number;
  setCycle: (v: number) => void;
  periodDays: number;
  setPeriodDays: (v: number) => void;
}) {
  // Move forward whole cycles so the first one shown is the current one.
  const current = useMemo(() => {
    if (!lastPeriod) return '';
    const behind = Math.max(0, Math.floor(daysBetween(lastPeriod, today) / cycle));
    return addDaysIso(lastPeriod, behind * cycle);
  }, [lastPeriod, today, cycle]);
  const cycles = useMemo(() => (current ? fertileWindows(addDaysIso(current, -cycle), cycle, periodDays, 5) : []), [current, cycle, periodDays]);
  const upcoming = cycles.filter((c) => c.ovulation >= today).slice(0, 3);
  const map = useMemo(() => dayMap(cycles), [cycles]);
  const [offset, setOffset] = useState(0);
  const base = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  base.setUTCMonth(base.getUTCMonth() + offset);
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array.from({ length: lead + daysInMonth }, (_, i) => (i < lead ? null : addDaysIso(first, i - lead)));

  return (
    <article className="panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1.15fr]">
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-[16px] font-bold text-fg">
          <Flower2 className="h-5 w-5 text-cyan" /> ნაყოფიერი დღეები და ოვულაცია
        </h3>
        <DateField label="ბოლო მენსტრუაციის პირველი დღე" value={lastPeriod} max={today} onChange={setLastPeriod} />
        <Slider label="ციკლის ხანგრძლივობა" value={cycle} min={20} max={45} step={1} unit="დღე" onChange={setCycle} marks={[{ at: 28, label: '28' }]} />
        <Slider label="მენსტრუაციის ხანგრძლივობა" value={periodDays} min={2} max={8} step={1} unit="დღე" onChange={setPeriodDays} />
        {!regularCycle(cycle) && <p className="rounded-xl bg-clinical-moderate/10 p-3 text-[13px] text-slate-200">21-ზე მოკლე ან 35-ზე გრძელი ციკლი დარღვეულად ითვლება — კალენდრით გამოთვლა არასანდოა. ღირს ექიმთან კონსულტაცია.</p>}
        {upcoming.length > 0 && (
          <ul className="space-y-2">
            {upcoming.map((c, i) => (
              <li key={c.ovulation} className={cn('rounded-xl p-3 text-[13px]', i === 0 ? 'bg-clinical-low/10 text-slate-200' : 'bg-ink-850 text-slate-300')}>
                <b className="text-fg">
                  {fmtShort(c.fertileStart)} – {fmtShort(c.ovulation)}
                </b>{' '}
                ნაყოფიერი დღეები · ოვულაცია ≈ {fmtShort(c.ovulation)} · შემდეგი მენსტრუაცია ≈ {fmtShort(c.nextPeriod)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setOffset(offset - 1)} aria-label="წინა თვე" className="grid h-9 w-9 place-items-center rounded-full bg-ink-850 text-slate-300 hover:text-fg">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-[15px] font-semibold text-fg">
            {MONTHS[month]} {year}
          </p>
          <button type="button" onClick={() => setOffset(offset + 1)} aria-label="შემდეგი თვე" className="grid h-9 w-9 place-items-center rounded-full bg-ink-850 text-slate-300 hover:text-fg">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-500">
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <span key={`x${i}`} />;
            const k = map.get(d);
            return (
              <span key={d} className={cn('grid aspect-square place-items-center rounded-lg text-[13px] tabular-nums', k ? DAY_TONE[k] : 'bg-ink-850 text-slate-300', d === today && 'outline outline-2 outline-offset-1 outline-fg')}>
                {Number(d.slice(8, 10))}
              </span>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 text-[12px] text-slate-400">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-rose-500/80" /> მენსტრუაცია</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-clinical-low/80" /> ნაყოფიერი დღე</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-cyan-brand" /> ოვულაცია</span>
        </div>
        <div className="rounded-2xl bg-ink-850 p-4 text-[12.5px] leading-relaxed text-slate-300">
          <p>
            ჩასახვა ხდება მხოლოდ 6-დღიან პერიოდში, რომელიც ოვულაციის დღით მთავრდება: შანსი ≈{Math.round(CONCEPTION_DAY_FIVE_BEFORE * 100)}%-დან (5 დღით ადრე) ≈{Math.round(CONCEPTION_OVULATION_DAY * 100)}%-მდე (ოვულაციის დღეს).
          </p>
          <p className="mt-2 text-slate-400">მნიშვნელოვანია: მხოლოდ ქალების ≈30%-ს აქვს ნაყოფიერი დღეები ზუსტად ციკლის 10–17 დღეებში, რეგულარული ციკლის დროსაც კი. კალენდარი მიახლოებითია; ოვულაციის ტესტი უფრო ზუსტია. ეს მეთოდი კონტრაცეფციად არ გამოდგება.</p>
          <p className="mt-2"><Sources ids={['wilcox_1995', 'wilcox_2000']} /></p>
        </div>
      </div>
    </article>
  );
}

/* ── chance over time + when to see a doctor ─────────────────────────── */

export function ChanceTool() {
  const [age, setAge] = useState(32);
  const [months, setMonths] = useState(4);
  const advice = whenToSeeDoctor(age, months);
  return (
    <article className="panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-[16px] font-bold text-fg">
          <Hourglass className="h-5 w-5 text-cyan" /> რამდენ ხანში დგება ორსულობა?
        </h3>
        <p className="text-[13px] leading-relaxed text-slate-300">წყვილების რა ნაწილს უდგება ორსულობა, თუ ნაყოფიერ დღეებში ცდილობენ:</p>
        <div className="space-y-3" role="img" aria-label={TIME_TO_PREGNANCY.map((r) => `${r.cycles} ციკლი: ${r.pct}%`).join(', ')}>
          {TIME_TO_PREGNANCY.map((r) => (
            <div key={r.cycles} className="grid grid-cols-[88px_1fr_44px] items-center gap-3">
              <span className="text-[13px] text-slate-300">{r.cycles === 1 ? '1 თვეში' : `${r.cycles} თვეში`}</span>
              <span className="h-4 overflow-hidden rounded-full bg-ink-850">
                <span className="block h-full rounded-full bg-gradient-to-r from-[#1FC3F5] to-[#0B8DB8] transition-all duration-700" style={{ width: `${r.pct}%` }} />
              </span>
              <span className="text-right text-[14px] font-bold tabular-nums text-fg">{r.pct}%</span>
            </div>
          ))}
        </div>
        <p className="text-[12.5px] leading-relaxed text-slate-400">ანუ 10-დან თითქმის 4 წყვილს პირველივე თვეში უდგება ორსულობა, 10-დან 9-ს კი — წლის განმავლობაში. თუ 6 თვეში ორსულობა არ დადგა, ასეთი წყვილების დაახლოებით ნახევარს, სავარაუდოდ, ნაყოფიერების პრობლემა აქვს. ასაკთან ერთად ეს ციფრები მცირდება. <Sources ids={['gnoth_2003']} /></p>
      </div>

      <div className="space-y-4">
        <Slider label="ქალის ასაკი" value={age} min={18} max={50} step={1} unit="წელი" onChange={setAge} marks={[{ at: 35, label: '35' }, { at: 40, label: '40' }]} />
        <Slider label="რამდენი თვეა, რაც ცდილობთ" value={months} min={0} max={24} step={1} unit="თვე" onChange={setMonths} />
        <div className={cn('rounded-2xl p-5', advice.now ? 'bg-navy text-white' : 'bg-ink-850 text-slate-200')}>
          {advice.now ? (
            <>
              <p className="text-[17px] font-bold">დროა ექიმთან მიხვიდეთ</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-white/80">
                {age > 40 ? '40 წლის შემდეგ შეფასება ლოდინის გარეშეა რეკომენდებული.' : `${advice.afterMonths} თვის მცდელობის შემდეგ რეკომენდებულია ორივე პარტნიორის შეფასება.`}
              </p>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-brand px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-cyan-deep">
                <Phone className="h-4 w-4" /> ჩაეწერეთ კონსულტაციაზე
              </a>
            </>
          ) : (
            <>
              <p className="text-[17px] font-bold text-fg">ჯერ ნორმის ფარგლებშია</p>
              <p className="mt-1 text-[13.5px] leading-relaxed">
                {age >= 35 ? '35 წლიდან' : '35 წლამდე'} ექიმთან მისვლა რეკომენდებულია {advice.afterMonths} თვის შემდეგ — დარჩა {advice.monthsLeft} თვე. თუ ციკლი დარღვეულია ან ცნობილი პრობლემა გაქვთ, ნუ დაელოდებით.
              </p>
            </>
          )}
        </div>
        <Sources ids={['asrm_infertility_2020', 'acog_age_2022']} />
      </div>
    </article>
  );
}

/* ── weight gain ──────────────────────────────────────────────────────── */

const BAND_KA: Record<GwgBand, string> = { under: 'წონის დეფიციტი', normal: 'ნორმალური წონა', over: 'ჭარბი წონა', obese: 'სიმსუქნე' };

export function WeightTool() {
  const [height, setHeight] = useState(165);
  const [before, setBefore] = useState(60);
  const [now, setNow] = useState(66);
  const [week, setWeek] = useState(24);
  const [twins, setTwins] = useState(false);
  const bmi = Math.round((before / Math.pow(height / 100, 2)) * 10) / 10;
  const range = weightGainRange(bmi, twins);
  const gained = Math.round((now - before) * 10) / 10;
  const top = Math.max(range.maxKg ?? 20, gained, 0) + 4;
  const pos = (v: number) => `${(Math.max(0, v) / top) * 100}%`;
  return (
    <Card title="წონის მატება ორსულობისას" icon={Scale}>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <Slider label="სიმაღლე" value={height} min={140} max={200} step={1} unit="სმ" onChange={setHeight} />
          <Slider label="წონა ორსულობამდე" value={before} min={38} max={150} step={1} unit="კგ" onChange={setBefore} />
          <Slider label="ახლანდელი წონა" value={now} min={38} max={170} step={0.5} unit="კგ" onChange={setNow} />
          <Slider label="ორსულობის ვადა" value={week} min={4} max={42} step={1} unit="კვირა" onChange={setWeek} />
          <Toggle on={twins} onChange={setTwins} label="ტყუპი" />
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl bg-navy p-5 text-white">
            <p className="text-[12.5px] text-white/60">
              BMI ორსულობამდე: {bmi} · {BAND_KA[range.band]}
            </p>
            {range.minKg !== null ? (
              <p className="mt-1 text-[24px] font-bold">
                რეკომენდებული მატება: {range.minKg}–{range.maxKg} კგ
              </p>
            ) : (
              <p className="mt-1 text-[17px] font-bold">ტყუპის და წონის დეფიციტის დროს ზოგადი ნორმა არ არსებობს — ნორმას ექიმი განსაზღვრავს.</p>
            )}
            <p className="mt-1 text-[13px] text-white/70">მთელი ორსულობის განმავლობაში, {twins ? 'ტყუპი' : 'ერთი ნაყოფი'}.</p>
          </div>
          {range.minKg !== null && (
            <div className="rounded-2xl bg-ink-850 p-4">
              <div className="relative h-5 rounded-full bg-ink-700">
                <span className="absolute inset-y-0 rounded-full bg-clinical-low/70" style={{ left: pos(range.minKg), width: `${((range.maxKg - range.minKg) / top) * 100}%` }} />
                <span className="absolute -top-1.5 h-8 w-1 -translate-x-1/2 rounded bg-fg transition-all duration-500" style={{ left: pos(gained) }} aria-hidden />
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-slate-500">
                <span>0 კგ</span>
                <span>{Math.round(top)} კგ</span>
              </div>
              <p className="mt-3 text-[13.5px] text-slate-200">
                ჯერჯერობით მოიმატეთ <b className="text-fg">{gained} კგ</b> ({week} კვირა).{' '}
                {week >= 37
                  ? gained < range.minKg
                    ? 'ეს რეკომენდებულზე ნაკლებია — განიხილეთ ექიმთან.'
                    : gained > range.maxKg
                      ? 'ეს რეკომენდებულზე მეტია — განიხილეთ ექიმთან.'
                      : 'ეს რეკომენდებული დიაპაზონის ფარგლებშია.'
                  : gained > range.maxKg
                    ? 'ეს უკვე აღემატება მთელი ორსულობის რეკომენდებულ მატებას — განიხილეთ ექიმთან.'
                    : 'მატება ძირითადად მეორე და მესამე ტრიმესტრზე მოდის.'}
              </p>
            </div>
          )}
          <p className="text-[11.5px] text-slate-500">
            ნორმები ორსულობამდე BMI-ის მიხედვით. <Sources ids={['iom_gwg_2009', 'cdc_gwg']} />
          </p>
        </div>
      </div>
    </Card>
  );
}
