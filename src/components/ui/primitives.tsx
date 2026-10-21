'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, Copy, Check, Printer, Download, FileJson, Eraser } from 'lucide-react';
import { cn, copyText, downloadText } from '@/lib/utils';

export function Panel({ children, className, title, subtitle, actions }: { children?: ReactNode; className?: string; title?: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <section className={cn('panel p-4 sm:p-5', className)}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-tight text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Collapsible({ title, badge, defaultOpen = true, tone = 'neutral', children }: { title: string; badge?: string; defaultOpen?: boolean; tone?: 'neutral' | 'warning' | 'critical' | 'positive'; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const toneRing =
    tone === 'critical' ? 'border-clinical-critical/40' : tone === 'warning' ? 'border-clinical-moderate/35' : tone === 'positive' ? 'border-clinical-low/35' : 'border-line';
  return (
    <div className={cn('rounded-lg border bg-ink-850/50', toneRing)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
          {title}
          {badge && <span className="chip text-[10px]">{badge}</span>}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-line px-3.5 py-3">{children}</div>}
    </div>
  );
}

export function Bullets({ items, className }: { items: string[]; className?: string }) {
  if (!items.length) return <p className="text-sm text-slate-500">—</p>;
  return (
    <ul className={cn('space-y-1.5', className)}>
      {items.map((b, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-300">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-cyan/70" />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'critical' | 'high' | 'moderate' | 'low' | 'info'; className?: string }) {
  const map = {
    neutral: 'border-line text-slate-300',
    critical: 'border-clinical-critical/45 text-clinical-critical bg-clinical-critical/10',
    high: 'border-clinical-high/45 text-clinical-high bg-clinical-high/10',
    moderate: 'border-clinical-moderate/45 text-clinical-moderate bg-clinical-moderate/10',
    low: 'border-clinical-low/45 text-clinical-low bg-clinical-low/10',
    info: 'border-clinical-info/45 text-clinical-info bg-clinical-info/10',
  } as const;
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', map[tone], className)}>{children}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-ink-850/40 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-200">{title}</p>
      <p className="max-w-md text-xs leading-relaxed text-slate-400">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title, detail, hint }: { title: string; detail?: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-clinical-critical/40 bg-clinical-critical/5 p-4">
      <p className="text-sm font-semibold text-clinical-critical">{title}</p>
      {detail && <p className="mt-1 text-xs leading-relaxed text-slate-300">{detail}</p>}
      {hint && <p className="mt-2 text-xs leading-relaxed text-slate-400">{hint}</p>}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 animate-pulse-soft rounded bg-ink-700/60" style={{ width: `${92 - i * 11}%` }} />
      ))}
    </div>
  );
}

/**
 * Actions on a produced result. `onClear` is offered next to copy and download
 * on purpose: the moment a clinician has taken the output is the moment they
 * want the screen empty for the next patient, and a stale result left on screen
 * is how one patient's answer gets read as another's.
 */
export function ExportBar({
  text,
  json,
  filename = 'clinical-output',
  onClear,
  clearLabelKa = 'გასუფთავება',
}: {
  text: string;
  json?: unknown;
  filename?: string;
  onClear?: () => void;
  clearLabelKa?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // Copy and print are what people use; file exports wait behind „მეტი".
  const [more, setMore] = useState(false);
  return (
    <div className="no-print flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        className="btn btn-ghost text-xs"
        onClick={async () => {
          const done = await copyText(text);
          setCopied(done);
          setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} კოპირება
      </button>
      <button type="button" className="btn btn-ghost text-xs" onClick={() => window.print()}>
        <Printer className="h-3.5 w-3.5" /> ბეჭდვა
      </button>
      {!more && (
        <button type="button" className="btn btn-ghost px-2.5 text-xs" onClick={() => setMore(true)} aria-label="მეტი მოქმედება">
          მეტი…
        </button>
      )}
      {more && (
      <button type="button" className="btn btn-ghost text-xs" onClick={() => downloadText(`${filename}.md`, text, 'text/markdown;charset=utf-8')}>
        <Download className="h-3.5 w-3.5" /> Markdown
      </button>
      )}
      {more && json !== undefined && (
        <button type="button" className="btn btn-ghost text-xs" onClick={() => downloadText(`${filename}.json`, JSON.stringify(json, null, 2), 'application/json')}>
          <FileJson className="h-3.5 w-3.5" /> JSON
        </button>
      )}
      {more && onClear && (
        <button
          type="button"
          className={cn('btn text-xs', confirmClear ? 'btn-primary' : 'btn-ghost')}
          onClick={() => {
            // Two taps: clearing discards work the clinician may not have saved.
            if (!confirmClear) {
              setConfirmClear(true);
              setTimeout(() => setConfirmClear(false), 4000);
              return;
            }
            setConfirmClear(false);
            onClear();
          }}
        >
          <Eraser className="h-3.5 w-3.5" /> {confirmClear ? 'დაადასტურეთ' : clearLabelKa}
        </button>
      )}
    </div>
  );
}

export function Table({ headers, rows, className }: { headers: string[]; rows: ReactNode[][]; className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-lg border border-line', className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-ink-850/80">
            {headers.map((h) => (
              <th key={h} className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-ink-900/40">
              {r.map((cell, j) => (
                <td key={j} className="border-b border-line/60 px-3 py-2.5 align-top text-slate-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
