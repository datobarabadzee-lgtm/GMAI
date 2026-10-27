'use client';

import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity, Bone, CigaretteOff, Dna, Droplet, Flower2, HeartPulse, Ribbon, Scan, Shield, Smile, TestTube, User, Waves, Wind, Wine,
} from 'lucide-react';
import type { RiskBand } from '@/prevention/types';
import { cn } from '@/lib/utils';

export const ICONS: Record<string, LucideIcon> = {
  'heart-pulse': HeartPulse, activity: Activity, droplet: Droplet, scan: Scan, ribbon: Ribbon, flower: Flower2, wind: Wind,
  waves: Waves, bone: Bone, 'test-tube': TestTube, shield: Shield, user: User, smile: Smile, wine: Wine,
  'cigarette-off': CigaretteOff, dna: Dna,
};

export const BAND_COLOR: Record<RiskBand, string> = {
  low: 'rgb(var(--c-low))',
  moderate: 'rgb(var(--c-moderate))',
  high: 'rgb(var(--c-high))',
  very_high: 'rgb(var(--c-critical))',
};

/** Animates a number from 0 to `value` once it mounts. Respects reduced motion. */
export function useCountUp(value: number, ms = 900): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setV(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setV(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return v;
}

/**
 * Half-ring gauge. `fraction` 0–1 sets the needle; colour comes from the band.
 * The ring is drawn as one muted track and one coloured arc.
 */
export function Gauge({ fraction, band, label, sub }: { fraction: number; band: RiskBand; label: string; sub?: string }) {
  const f = useCountUp(Math.max(0, Math.min(1, fraction)));
  const r = 80;
  const len = Math.PI * r;
  const angle = Math.PI * (1 - f);
  const nx = 100 + (r - 2) * Math.cos(angle);
  const ny = 100 - (r - 2) * Math.sin(angle);
  return (
    <div className="relative mx-auto w-full max-w-[240px]">
      <svg viewBox="0 0 200 116" className="w-full" role="img" aria-label={`${label}${sub ? ` — ${sub}` : ''}`}>
        <defs>
          <linearGradient id="gauge-track" x1="0" x2="1">
            <stop offset="0%" stopColor="rgb(var(--c-low))" stopOpacity="0.28" />
            <stop offset="55%" stopColor="rgb(var(--c-moderate))" stopOpacity="0.28" />
            <stop offset="100%" stopColor="rgb(var(--c-critical))" stopOpacity="0.28" />
          </linearGradient>
        </defs>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#gauge-track)" strokeWidth="14" strokeLinecap="round" />
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          stroke={BAND_COLOR[band]}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${len * f} ${len}`}
        />
        <circle cx={nx} cy={ny} r="7" fill="white" stroke={BAND_COLOR[band]} strokeWidth="4" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="text-[30px] font-bold leading-none text-fg tabular-nums">{label}</p>
        {sub && <p className="mt-1 text-[12px] font-medium" style={{ color: BAND_COLOR[band] }}>{sub}</p>}
      </div>
    </div>
  );
}

/** Horizontal scale with coloured zones and a marker (BMI, waist). */
export function ScaleBar({ min, max, value, zones, unit }: { min: number; max: number; value: number; zones: { to: number; band: RiskBand; label: string }[]; unit: string }) {
  const pos = useCountUp(((Math.max(min, Math.min(max, value)) - min) / (max - min)) * 100);
  const widths = zones.map((z, i) => ((Math.min(z.to, max) - (i ? zones[i - 1].to : min)) / (max - min)) * 100);
  return (
    <div className="pt-6">
      <div className="relative h-3 overflow-hidden rounded-full">
        <div className="flex h-full">
          {zones.map((z, i) => (
            <span key={z.label} style={{ width: `${widths[i]}%`, background: BAND_COLOR[z.band], opacity: 0.55 }} />
          ))}
        </div>
      </div>
      <div className="relative -mt-[22px] h-0" style={{ left: `${pos}%` }}>
        <span className="absolute -translate-x-1/2 -translate-y-1 rounded-full bg-navy px-2 py-0.5 text-[11px] font-semibold text-white shadow-soft">
          {value} {unit}
        </span>
      </div>
      <div className="mt-6 flex justify-between gap-1 text-[10.5px] text-slate-500">
        {zones.map((z) => (
          <span key={z.label}>{z.label}</span>
        ))}
      </div>
    </div>
  );
}

/** Donut summary of the screening calendar. */
export function StatusRing({ segments, center, caption }: { segments: { value: number; color: string; label: string }[]; center: string; caption: string }) {
  const total = Math.max(1, segments.reduce((a, s) => a + s.value, 0));
  const grow = useCountUp(1, 1100);
  const r = 42;
  const c = 2 * Math.PI * r;
  const lens = segments.map((s) => (s.value / total) * c * grow);
  const offsets = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div className="relative h-[132px] w-[132px] shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(', ')}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="10" />
        {segments.map((s, i) => (
          <circle key={s.label} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="10" strokeDasharray={`${lens[i]} ${c}`} strokeDashoffset={-offsets[i]} strokeLinecap="butt" />
        ))}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-[30px] font-bold leading-none text-white">{center}</p>
          <p className="mt-1 text-[10.5px] leading-tight text-white/70">{caption}</p>
        </div>
      </div>
    </div>
  );
}

/** Before → after bars for the strongest modifiable factor. */
export function LeverBars({ from, to }: { from: number; to: number }) {
  const max = Math.max(from, 1);
  const a = useCountUp(from);
  const b = useCountUp(to, 1300);
  return (
    <div className="space-y-2">
      {[
        { label: 'ახლა', v: a, raw: from, color: 'rgb(var(--c-high))' },
        { label: 'ცვლილების შემდეგ', v: b, raw: to, color: 'rgb(var(--c-low))' },
      ].map((x) => (
        <div key={x.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-[12px] text-slate-400">{x.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-800">
            <div className="h-full rounded-full" style={{ width: `${(x.v / max) * 100}%`, background: x.color }} />
          </div>
          <span className="w-12 shrink-0 text-right text-[13px] font-semibold tabular-nums text-fg">{x.raw}%</span>
        </div>
      ))}
    </div>
  );
}

/** Small animated heartbeat line for the hero. Decorative. */
export function PulseLine({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 120" className={cn('pointer-events-none', className)} aria-hidden>
      <path
        d="M0 60 H170 L190 60 L205 25 L222 98 L240 12 L258 85 L272 60 H600"
        fill="none"
        stroke="#08C6FF"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="prev-pulse"
      />
    </svg>
  );
}
