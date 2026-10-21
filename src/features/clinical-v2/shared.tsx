'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, ZoomIn, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── data shapes of /public/clinical-v2 (written by scripts/import-clinical-v2.mjs) ── */

export type Setting = 'emergency' | 'intensive_care';
export type CType = 'assessment' | 'criteria' | 'management' | 'dosing' | 'safety' | 'clinical_context';

export type CatalogTopic = { id: string; title: string; category: string; setting: Setting; sectionCount: number; unitCount: number; facets: CType[]; hasMedia: boolean };
export type Catalog = { collection: string; package_id: string; categories: Record<string, string>; topics: CatalogTopic[] };

export type Media = { kind: 'image' | 'attachment'; path: string; file: string };
export type Item = { id: string; kind: 'statement' | 'heading' | 'table'; clinical_type: CType; text: string; rows?: string[][]; media: Media[] };
export type Unit = { id: string; title: string; order: number; clinical_types: CType[]; items: Item[] };
export type Section = { id: string; title: string; units: Unit[] };
export type TopicData = { topic: CatalogTopic; sections: Section[] };

export const SETTING_KA: Record<Setting, string> = { emergency: 'გადაუდებელი მედიცინა', intensive_care: 'ინტენსიური თერაპია' };
export const SETTING_SHORT: Record<Setting, string> = { emergency: 'გადაუდებელი', intensive_care: 'ინტენსიური' };

/** Filters a reader can apply; clinical_context is background, not a filter. */
export const TYPE_FILTERS: { id: CType; ka: string }[] = [
  { id: 'assessment', ka: 'შეფასება' },
  { id: 'criteria', ka: 'კრიტერიუმები' },
  { id: 'management', ka: 'მართვა' },
  { id: 'dosing', ka: 'დოზირება' },
  { id: 'safety', ka: 'უსაფრთხოება' },
];
export const TYPE_KA: Record<CType, string> = { assessment: 'შეფასება', criteria: 'კრიტერიუმები', management: 'მართვა', dosing: 'დოზირება', safety: 'უსაფრთხოება', clinical_context: 'კონტექსტი' };

export const DISCLAIMER_KA = 'სასწავლო საცნობარო მასალა. კლინიკური ვალიდაცია არ ჩატარებულა და უახლეს გაიდლაინებთან არ შედარებულა.';

export const unitHref = (topicId: string, unitId: string) => `/academy/clinical/${topicId}?u=${unitId}`;
export const LIST_STATE_KEY = 'gmai.clinical-v2.list';

/** Same-subject topics in the other setting (BLS, ACS, difficult airway…). Never merged. */
const titleWords = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2)
      .map((w) => w.slice(0, 6)),
  );
export function twinsOf(topic: CatalogTopic, all: CatalogTopic[]): CatalogTopic[] {
  const wa = titleWords(topic.title);
  return all.filter((b) => {
    if (b.id === topic.id || b.setting === topic.setting) return false;
    const wb = titleWords(b.title);
    const shared = [...wa].filter((w) => wb.has(w)).length;
    return shared > 0 && shared / Math.min(wa.size, wb.size) >= 0.6;
  });
}

/** Leading list markers in source text ("- ", "• ") — the list renders its own. */
export const stripMarker = (s: string) => s.replace(/^\s*[-–•·]\s+/, '');

/** Case-insensitive Georgian/Latin match highlighting. */
export function Highlight({ text, q }: { text: string; q: string }) {
  const needle = q.trim();
  if (needle.length < 2) return <>{text}</>;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  const n = needle.toLowerCase();
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const j = lower.indexOf(n, i);
    if (j < 0) {
      parts.push(text.slice(i));
      break;
    }
    if (j > i) parts.push(text.slice(i, j));
    parts.push(
      <mark key={k++} className="rounded bg-cyan/25 px-0.5 text-fg">
        {text.slice(j, j + n.length)}
      </mark>,
    );
    i = j + n.length;
  }
  return <>{parts}</>;
}

/** Dosing and safety are marked with a text label and a side rule — never colour alone. */
function Flag({ type }: { type: CType }) {
  if (type !== 'dosing' && type !== 'safety') return null;
  return (
    <span
      className={cn(
        'mr-1.5 inline-flex shrink-0 items-center rounded-md border px-1.5 py-px align-[1px] text-[10.5px] font-semibold',
        type === 'dosing' ? 'border-cyan/40 text-cyan' : 'border-clinical-high/45 text-clinical-high',
      )}
    >
      {type === 'dosing' ? 'დოზა' : 'უსაფრთხოება'}
    </span>
  );
}

export function ItemView({ item, q, emphasis }: { item: Item; q: string; emphasis?: CType | '' }) {
  const marked = item.clinical_type === 'dosing' || item.clinical_type === 'safety';
  const dim = emphasis && item.kind !== 'heading' && item.clinical_type !== emphasis;
  const media = item.media.map(mediaView);

  if (item.kind === 'heading')
    return (
      <>
        <h4 className="mt-3 text-[13.5px] font-semibold text-fg first:mt-0">
          <Highlight text={item.text.replace(/:\s*$/, '')} q={q} />
        </h4>
        {media}
      </>
    );

  if (item.kind === 'table' && item.rows?.length) {
    const [head, ...body] = item.rows;
    return (
      <div className={cn('my-2 overflow-x-auto rounded-lg border border-line', dim && 'opacity-55')}>
        <table className="w-full min-w-[420px] border-collapse text-[13px] leading-snug">
          <thead className="bg-ink-850">
            <tr>
              {head.map((c, i) => (
                <th key={i} scope="col" className="border-b border-line px-2.5 py-2 text-left align-top font-semibold text-fg">
                  <Highlight text={c} q={q} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, i) => (
              <tr key={i} className="odd:bg-ink-950/40">
                {r.map((c, j) => (
                  <td key={j} className="border-t border-line px-2.5 py-1.5 align-top text-slate-300">
                    <Highlight text={c} q={q} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {media}
      </div>
    );
  }

  if (!item.text) return <>{media}</>;
  return (
    <div className={cn('relative py-1 pl-3.5 text-[14px] leading-relaxed text-slate-300', marked && 'border-l-2', item.clinical_type === 'dosing' && 'border-cyan/60', item.clinical_type === 'safety' && 'border-clinical-high/60', dim && 'opacity-55')}>
      {!marked && <span aria-hidden className="absolute left-0 top-[0.95em] h-1 w-1 rounded-full bg-slate-500" />}
      <Flag type={item.clinical_type} />
      <Highlight text={stripMarker(item.text)} q={q} />
      {media}
    </div>
  );
}

function mediaView(m: Media) {
  if (m.kind === 'image') return <ZoomImage key={m.path} src={m.path} />;
  return <Attachment key={m.path} m={m} />;
}

function Attachment({ m }: { m: Media }) {
  return (
    <a href={m.path} download className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] text-cyan hover:underline">
      <Paperclip className="h-3.5 w-3.5" aria-hidden /> დანართი ({m.file.split('.').pop()?.toUpperCase()})
    </a>
  );
}

/** Lazy image; opens full size in a modal dialog (Esc or the button closes it). */
export function ZoomImage({ src }: { src: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <p className="my-2 text-[12px] text-slate-500">
        სურათი ვერ ჩაიტვირთა —{' '}
        <a href={src} className="text-cyan hover:underline">
          გახსნა
        </a>
      </p>
    );
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="group relative my-2 block max-w-full overflow-hidden rounded-lg border border-line bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan"
        aria-label="სურათის გადიდება"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="სქემა / ცხრილი წყაროდან" loading="lazy" decoding="async" onError={() => setFailed(true)} className="max-h-[420px] w-auto max-w-full object-contain" />
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white opacity-90 group-hover:opacity-100">
          <ZoomIn className="h-3 w-3" aria-hidden /> გადიდება
        </span>
      </button>
      <dialog
        ref={ref}
        className="m-auto max-h-[96vh] max-w-[96vw] rounded-xl border border-line bg-white p-0 backdrop:bg-black/70"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
      >
        <div className="sticky top-0 flex justify-end bg-white/90 p-1.5">
          <button type="button" onClick={() => ref.current?.close()} className="btn btn-ghost !min-h-0 !px-2 !py-1 text-slate-700" aria-label="დახურვა">
            <X className="h-4 w-4" /> დახურვა
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="სქემა / ცხრილი წყაროდან (სრული ზომა)" className="block h-auto w-auto max-w-none" />
      </dialog>
    </>
  );
}

/** Fetch JSON with loading / error state and a retry. */
export function useJson<T>(url: string | null): { data: T | null; error: string | null; loading: boolean; retry: () => void } {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: Boolean(url) });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'ვერ მოიძებნა' : `შეცდომა ${r.status}`);
        return (await r.json()) as T;
      })
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: unknown) => alive && setState({ data: null, error: e instanceof Error ? e.message : 'ქსელის შეცდომა', loading: false }));
    return () => {
      alive = false;
    };
  }, [url, n]);
  return { ...state, retry: () => setN((x) => x + 1) };
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; ka: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-line bg-ink-950 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'rounded-full px-3 py-1.5 text-[12.5px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan',
            value === o.id ? 'bg-cyan-brand text-white' : 'text-slate-400 hover:text-fg',
          )}
        >
          {o.ka}
        </button>
      ))}
    </div>
  );
}

export function ChipToggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan',
        on ? 'border-cyan/60 bg-cyan/15 text-fg' : 'border-line text-slate-400 hover:text-fg',
      )}
    >
      {on && <span aria-hidden>✓</span>}
      {children}
    </button>
  );
}
