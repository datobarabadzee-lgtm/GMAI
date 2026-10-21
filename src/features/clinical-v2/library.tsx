'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ImageIcon, Search, X } from 'lucide-react';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import {
  ChipToggle,
  DISCLAIMER_KA,
  Highlight,
  LIST_STATE_KEY,
  SETTING_SHORT,
  Segmented,
  TYPE_FILTERS,
  TYPE_KA,
  useJson,
  type CType,
  type Catalog,
  type CatalogTopic,
  type Setting,
} from './shared';

type Hit = {
  id: string;
  href: string;
  topicId: string;
  topicTitle: string;
  sectionTitle: string;
  unitTitle: string;
  setting: Setting;
  types: CType[];
  snippet: string;
  hasMedia: boolean;
};
type SearchResponse = { count: number; results: Hit[]; search: { labelKa: string } };

const SETTING_OPTIONS: { id: '' | Setting; ka: string }[] = [
  { id: '', ka: 'ყველა' },
  { id: 'emergency', ka: 'გადაუდებელი' },
  { id: 'intensive_care', ka: 'ინტენსიური' },
];

/**
 * Student page for collection gmai_clinical_v2: clinical directions → topic
 * cards → topic. Only the 16 KB catalog loads here; topic text loads on the
 * topic page, and full-text search runs on the server. All filters live in the
 * URL, so the back button and a shared link restore the same view.
 */
export function ClinicalLibrary() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const setting = (params.get('setting') ?? '') as '' | Setting;
  const type = (params.get('type') ?? '') as '' | CType;
  const cat = params.get('cat') ?? '';

  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Remember the list view so returning to it — by the back link or the menu —
  // restores the same search and filters. A bare URL on arrival restores the
  // last view of this tab; after that the URL is the only state.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!restored) {
      setRestored(true);
      try {
        const last = sessionStorage.getItem(LIST_STATE_KEY);
        if (!params.toString() && last) {
          router.replace(`${pathname}?${last}`, { scroll: false });
          return;
        }
      } catch {
        /* storage unavailable — the URL still carries the state */
      }
    }
    try {
      sessionStorage.setItem(LIST_STATE_KEY, params.toString());
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Debounced search: the URL changes 300 ms after typing stops.
  useEffect(() => {
    if (draft.trim() === q) return;
    const t = setTimeout(() => set({ q: draft.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const catalog = useJson<Catalog>('/clinical-v2/catalog.json');
  const searchUrl =
    q.length >= 2
      ? `/api/clinical-v2/search?${new URLSearchParams({ q, ...(setting && { setting }), ...(type && { type }), ...(cat && { category: cat }), limit: '40' }).toString()}`
      : null;
  const search = useJson<SearchResponse>(searchUrl);

  const topics = useMemo(
    () => (catalog.data?.topics ?? []).filter((t) => (!setting || t.setting === setting) && (!type || t.facets.includes(type)) && (!cat || t.category === cat)),
    [catalog.data, setting, type, cat],
  );
  const grouped = useMemo(() => {
    const m = new Map<string, CatalogTopic[]>();
    for (const t of topics) m.set(t.category, [...(m.get(t.category) ?? []), t]);
    return [...m.entries()];
  }, [topics]);

  const total = catalog.data?.topics.length ?? 0;
  const unitTotal = catalog.data?.topics.reduce((a, t) => a + t.unitCount, 0) ?? 0;
  const filtered = Boolean(setting || type || cat);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <p className="text-[12px] font-medium text-cyan">აკადემია</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-fg">კლინიკური ცოდნა</h1>
        <p className="mt-1 text-sm text-slate-400">
          გადაუდებელი მედიცინა და ინტენსიური თერაპია{total ? ` · ${total} თემა · ${unitTotal} ერთეული` : ''} · საცნობარო მასალა (არა ინტერაქტიული კურსი: ტესტი, პროგრესი და სერტიფიკატი არ არის)
        </p>
        <p className="mt-1 text-[12px] text-slate-500">{DISCLAIMER_KA}</p>
      </header>

      <div className="panel space-y-3 p-3 sm:p-4">
        <label className="relative block">
          <span className="sr-only">ძიება თემებსა და კლინიკურ შინაარსში</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && set({ q: draft.trim() })}
            placeholder="ძიება: ტრიაჟი, სედაცია, ინსულტი, adrenaline, ESI…"
            className="field !pl-10 !pr-10"
            autoComplete="off"
          />
          {draft && (
            <button type="button" onClick={() => (setDraft(''), set({ q: '' }))} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-500 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan" aria-label="ძიების გასუფთავება">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="გარემო" value={setting} onChange={(v) => set({ setting: v })} options={SETTING_OPTIONS} />
          <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="შინაარსის ტიპი">
            {TYPE_FILTERS.map((f) => (
              <ChipToggle key={f.id} on={type === f.id} onClick={() => set({ type: type === f.id ? '' : f.id })}>
                {f.ka}
              </ChipToggle>
            ))}
          </div>
        </div>
        {catalog.data && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="კლინიკური მიმართულება">
            {Object.entries(catalog.data.categories).map(([id, ka]) => (
              <ChipToggle key={id} on={cat === id} onClick={() => set({ cat: cat === id ? '' : id })}>
                {ka}
              </ChipToggle>
            ))}
          </div>
        )}
        {(filtered || q) && (
          <button type="button" onClick={() => (setDraft(''), router.replace(pathname, { scroll: false }))} className="text-[12px] text-slate-400 underline-offset-2 hover:text-fg hover:underline">
            ფილტრების გასუფთავება
          </button>
        )}
      </div>

      {q.length >= 2 ? (
        <section aria-live="polite" aria-busy={search.loading}>
          {search.loading && <Skeleton lines={6} />}
          {search.error && <ErrorState title="ძიება ვერ შესრულდა" detail={search.error} hint="სცადეთ ხელახლა." />}
          {search.data && !search.loading && (
            <>
              <p className="mb-2 text-[12px] text-slate-500">
                {search.data.count ? `${search.data.count} შედეგი` : ''} · ძიება ტექსტურია (ქართული და ინგლისური ტერმინები); სემანტიკური ძიება ჩართული არ არის
              </p>
              {search.data.count === 0 ? (
                <EmptyState title="შედეგი ვერ მოიძებნა" description="სცადეთ სხვა სიტყვა, ინგლისური ტერმინი ან მოხსენით ფილტრი." />
              ) : (
                <ul className="space-y-2">
                  {search.data.results.map((h) => (
                    <li key={h.id}>
                      <Link href={h.href} className="block rounded-xl border border-line bg-ink-900 p-3 transition hover:border-cyan/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan">
                        <span className="flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-slate-500">
                          <span className="text-slate-400">{h.topicTitle}</span>
                          <span aria-hidden>·</span>
                          <span>{SETTING_SHORT[h.setting]}</span>
                          {h.types.filter((t) => t === 'dosing' || t === 'safety').map((t) => (
                            <span key={t} className="rounded border border-line px-1 text-[10.5px]">
                              {TYPE_KA[t]}
                            </span>
                          ))}
                          {h.hasMedia && <ImageIcon className="h-3 w-3" aria-label="შეიცავს სურათს" />}
                        </span>
                        <span className="mt-0.5 block text-[14px] font-medium text-fg">
                          <Highlight text={h.unitTitle} q={q} />
                        </span>
                        {h.snippet && (
                          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-slate-400">
                            <Highlight text={h.snippet} q={q} />
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      ) : (
        <section aria-busy={catalog.loading}>
          {catalog.loading && <Skeleton lines={8} />}
          {catalog.error && (
            <div className="space-y-2">
              <ErrorState title="მასალა ვერ ჩაიტვირთა" detail={catalog.error} />
              <button type="button" className="btn" onClick={catalog.retry}>
                ხელახლა ცდა
              </button>
            </div>
          )}
          {catalog.data && !topics.length && <EmptyState title="ამ ფილტრით თემა არ არის" description="მოხსენით ერთ-ერთი ფილტრი." />}
          <div className="space-y-6">
            {grouped.map(([category, list]) => (
              <div key={category}>
                <h2 className="mb-2 text-[13px] font-semibold text-slate-400">{catalog.data?.categories[category] ?? category}</h2>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/academy/clinical/${t.id}${type ? `?type=${type}` : ''}`}
                        className="flex h-full flex-col justify-between gap-2 rounded-xl border border-line bg-ink-900 p-3 transition hover:border-cyan/50 hover:shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan"
                      >
                        <span className="text-[14px] font-medium leading-snug text-fg">{t.title}</span>
                        <span className="flex items-center gap-1.5 text-[11.5px] text-slate-500">
                          <span className={cn('rounded-full border px-1.5 py-px', t.setting === 'emergency' ? 'border-clinical-high/40' : 'border-cyan/40')}>{SETTING_SHORT[t.setting]}</span>
                          <span>
                            <BookOpen className="mr-0.5 inline h-3 w-3" aria-hidden />
                            {t.unitCount} ერთეული
                          </span>
                          {t.hasMedia && <ImageIcon className="h-3 w-3" aria-label="შეიცავს სურათს" />}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
