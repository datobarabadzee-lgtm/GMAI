'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ExternalLink } from 'lucide-react';
import { sourcesFor } from '@/prevention/engine';

export const MONTHS = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
export const MONTHS_SHORT = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];

/** 8 ოქტომბერი 2026 */
export const fmtLong = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
/** 8 ოქტ */
export const fmtShort = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]}`;

export const KEY = {
  edd: 'gmai.repro.edd.v1',
  rh: 'gmai.repro.rh.v1',
  done: 'gmai.repro.done.v1',
  lead: 'gmai.repro.lead.v1',
  cycle: 'gmai.repro.cycle.v1',
};

export const read = <T,>(k: string): T | null => {
  try {
    const raw = window.localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
export const write = (k: string, v: unknown) => {
  try {
    window.localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage blocked: works for this visit */
  }
};

export function Sources({ ids }: { ids: string[] }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {sourcesFor(ids).map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" title={s.title} className="inline-flex items-center gap-1 text-[11.5px] text-cyan hover:underline">
          {s.org} {s.year} <ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </span>
  );
}

export function Card({ title, icon: Icon, children, aside }: { title: string; icon: LucideIcon; children: ReactNode; aside?: ReactNode }) {
  return (
    <article className="panel p-5 sm:p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[16px] font-bold text-fg">
            <Icon className="h-5 w-5 text-cyan" /> {title}
          </h3>
          {aside}
        </div>
        {children}
      </div>
    </article>
  );
}

export function DateField({ label, value, onChange, max, min }: { label: string; value: string; onChange: (v: string) => void; max?: string; min?: string }) {
  return (
    <label className="block text-[13px] text-slate-300">
      {label}
      <input type="date" value={value} max={max} min={min} onChange={(e) => onChange(e.target.value)} className="field mt-1" />
    </label>
  );
}

export function Choice<T extends string | number>({ value, options, onChange }: { value: T; options: { id: T; labelKa: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={value === o.id ? 'rounded-xl bg-navy py-2.5 text-[13px] font-medium text-white transition dark:bg-cyan-brand' : 'rounded-xl bg-ink-850 py-2.5 text-[13px] font-medium text-slate-300 transition hover:text-fg'}
        >
          {o.labelKa}
        </button>
      ))}
    </div>
  );
}

/** Ring that fills with the share of the 40 weeks already behind. */
export function ProgressRing({ fraction, center, caption }: { fraction: number; center: string; caption: string }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <div className="relative h-[150px] w-[150px] shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`${center} ${caption}`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="#08C6FF" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${f * c} ${c}`} className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-[30px] font-bold leading-none text-white">{center}</p>
          <p className="mt-1 text-[11px] leading-tight text-white/70">{caption}</p>
        </div>
      </div>
    </div>
  );
}
