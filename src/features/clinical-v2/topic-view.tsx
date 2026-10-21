'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Link2, ListTree, Search, X } from 'lucide-react';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import {
  ChipToggle,
  DISCLAIMER_KA,
  Highlight,
  ItemView,
  LIST_STATE_KEY,
  SETTING_KA,
  TYPE_FILTERS,
  stripMarker,
  twinsOf,
  unitHref,
  useJson,
  type CType,
  type Catalog,
  type Section,
  type TopicData,
  type Unit,
} from './shared';

const displayTitle = (t: string) => t.replace(/\s*·\s*\d+\s*$/, '').replace(/:\s*$/, '');
const unitSearchText = (u: Unit) =>
  `${u.title}\n${u.items.map((it) => `${it.text} ${(it.rows ?? []).flat().join(' ')}`).join('\n')}`.toLowerCase();

/**
 * One topic of gmai_clinical_v2. Its JSON loads on demand; images load lazily
 * when a unit is opened. ?u=<unit id> opens and scrolls to that unit, and the
 * address bar follows whichever unit is opened, so it is always a direct link.
 */
export function ClinicalTopic({ topicId }: { topicId: string }) {
  const params = useSearchParams();
  const deepUnit = params.get('u');
  const { data, error, loading, retry } = useJson<TopicData>(`/clinical-v2/topics/${encodeURIComponent(topicId)}.json`);
  const catalog = useJson<Catalog>('/clinical-v2/catalog.json');

  const [find, setFind] = useState('');
  const [type, setType] = useState<'' | CType>((params.get('type') as CType | null) ?? '');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [backQs, setBackQs] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const scrolled = useRef(false);

  useEffect(() => {
    try {
      setBackQs(sessionStorage.getItem(LIST_STATE_KEY) ?? '');
    } catch {
      /* no storage */
    }
  }, []);

  // Deep link: open the unit and bring it into view once the topic has loaded.
  useEffect(() => {
    if (!data || !deepUnit || scrolled.current) return;
    scrolled.current = true;
    setOpen((s) => new Set(s).add(deepUnit));
    requestAnimationFrame(() => {
      const el = document.getElementById(deepUnit);
      if (el) {
        el.scrollIntoView({ block: 'start' });
        (el.querySelector('button[aria-expanded]') as HTMLButtonElement | null)?.focus({ preventScroll: true });
        setFlash(deepUnit);
        setTimeout(() => setFlash(null), 2200);
      }
    });
  }, [data, deepUnit]);

  const needle = find.trim().toLowerCase();
  const sections = useMemo<Section[]>(() => {
    if (!data) return [];
    return data.sections
      .map((s) => ({
        ...s,
        units: s.units.filter(
          (u) => (!type || u.clinical_types.includes(type)) && (needle.length < 2 || unitSearchText(u).includes(needle) || s.title.toLowerCase().includes(needle)),
        ),
      }))
      .filter((s) => s.units.length);
  }, [data, type, needle]);
  const matchCount = sections.reduce((a, s) => a + s.units.length, 0);
  const unitTotal = data?.sections.reduce((a, s) => a + s.units.length, 0) ?? 0;
  const searching = needle.length >= 2;

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else {
        n.add(id);
        // The address bar is the unit's direct link.
        window.history.replaceState(null, '', unitHref(topicId, id));
      }
      return n;
    });
  const copy = async (id: string) => {
    const url = `${window.location.origin}${unitHref(topicId, id)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.history.replaceState(null, '', unitHref(topicId, id));
    }
    setCopied(id);
    setTimeout(() => setCopied(null), 1600);
  };

  const twins = data && catalog.data ? twinsOf(data.topic, catalog.data.topics) : [];
  const categoryKa = data && catalog.data ? catalog.data.categories[data.topic.category] : '';

  return (
    <div className="mx-auto max-w-6xl">
      <Link href={`/academy/clinical${backQs ? `?${backQs}` : ''}`} className="inline-flex items-center gap-1.5 rounded text-[13px] text-slate-400 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan">
        <ArrowLeft className="h-4 w-4" aria-hidden /> კლინიკური ცოდნა
      </Link>

      {loading && (
        <div className="mt-4">
          <Skeleton lines={10} />
        </div>
      )}
      {error && (
        <div className="mt-4 space-y-2">
          <ErrorState title="თემა ვერ ჩაიტვირთა" detail={error} />
          <button type="button" className="btn" onClick={retry}>
            ხელახლა ცდა
          </button>
        </div>
      )}

      {data && (
        <>
          <header className="mt-3">
            <p className="text-[12px] text-slate-500">
              {SETTING_KA[data.topic.setting]}
              {categoryKa ? ` · ${categoryKa}` : ''} · {unitTotal} ერთეული
            </p>
            <h1 className="mt-0.5 text-2xl font-bold leading-tight tracking-tight text-fg">{data.topic.title}</h1>
            {twins.length > 0 && (
              <p className="mt-1.5 text-[12.5px] text-slate-400">
                იგივე თემა სხვა გარემოში:{' '}
                {twins.map((t, i) => (
                  <span key={t.id}>
                    {i > 0 && ', '}
                    <Link href={`/academy/clinical/${t.id}`} className="text-cyan hover:underline">
                      {t.title} ({SETTING_KA[t.setting]})
                    </Link>
                  </span>
                ))}
                . ვერსიები ცალ-ცალკეა — შეადარეთ.
              </p>
            )}
            <p className="mt-1 text-[12px] text-slate-500">{DISCLAIMER_KA}</p>
          </header>

          <div className="z-10 -mx-1 mt-3 bg-ink-950/90 px-1 py-2 backdrop-blur lg:sticky lg:top-16">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative block sm:w-72">
                <span className="sr-only">ძიება ამ თემაში</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
                <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="ძიება ამ თემაში…" className="field !py-2 !pl-9 !pr-9" />
                {find && (
                  <button type="button" onClick={() => setFind('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500 hover:text-fg" aria-label="გასუფთავება">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </label>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="შინაარსის ტიპი">
                {TYPE_FILTERS.filter((f) => data.topic.facets.includes(f.id)).map((f) => (
                  <ChipToggle key={f.id} on={type === f.id} onClick={() => setType(type === f.id ? '' : f.id)}>
                    {f.ka}
                  </ChipToggle>
                ))}
              </div>
            </div>
            {(searching || type) && (
              <p className="mt-1.5 text-[12px] text-slate-500" aria-live="polite">
                {matchCount} ერთეული {unitTotal}-დან
              </p>
            )}
          </div>

          <div className="mt-3 gap-6 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
            <SectionNav sections={sections} />
            <div className="min-w-0 space-y-3">
              <div className="flex justify-end gap-2 text-[12px]">
                <button type="button" className="text-slate-400 hover:text-fg" onClick={() => setOpen(new Set(sections.flatMap((s) => s.units.map((u) => u.id))))}>
                  ყველას გახსნა
                </button>
                <span aria-hidden className="text-slate-600">
                  ·
                </span>
                <button type="button" className="text-slate-400 hover:text-fg" onClick={() => setOpen(new Set())}>
                  ყველას დახურვა
                </button>
              </div>
              {!sections.length && <EmptyState title="ამ თემაში შესაბამისი ერთეული არ არის" description="შეცვალეთ საძიებო სიტყვა ან მოხსენით ფილტრი." />}
              {sections.map((s) => (
                <section key={s.id} id={s.id} className="scroll-mt-20 lg:scroll-mt-36 rounded-2xl border border-line bg-ink-900">
                  {s.units.length > 1 && <h2 className="border-b border-line px-4 py-2.5 text-[13px] font-semibold text-slate-400">{displayTitle(s.title)}</h2>}
                  <div className={cn(s.units.length > 1 && 'divide-y divide-line')}>
                    {s.units.map((u, i) => (
                      <UnitBlock
                        key={u.id}
                        unit={u}
                        title={
                          s.units.length === 1
                            ? displayTitle(s.title)
                            : displayTitle(u.title) === displayTitle(s.title)
                              ? `ნაწილი ${i + 1}`
                              : displayTitle(u.title)
                        }
                        open={open.has(u.id) || (searching && matchCount <= 12)}
                        flash={flash === u.id}
                        onToggle={() => toggle(u.id)}
                        onCopy={() => copy(u.id)}
                        copied={copied === u.id}
                        q={find}
                        emphasis={type}
                        big={s.units.length === 1}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SectionNav({ sections }: { sections: Section[] }) {
  if (sections.length < 2) return <div className="hidden lg:block" />;
  const list = (
    <ol className="space-y-0.5 text-[12.5px]">
      {sections.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className="block rounded-md px-2 py-1 leading-snug text-slate-400 hover:bg-ink-850 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan">
            {displayTitle(s.title)}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <>
      <details className="mb-3 rounded-xl border border-line bg-ink-900 lg:hidden">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-[13px] text-slate-300">
          <ListTree className="h-4 w-4" aria-hidden /> სექციები ({sections.length})
        </summary>
        <nav aria-label="თემის სექციები" className="max-h-[50vh] overflow-y-auto px-1 pb-2">
          {list}
        </nav>
      </details>
      <nav aria-label="თემის სექციები" className="sticky top-[150px] hidden max-h-[calc(100vh-170px)] self-start overflow-y-auto pr-1 lg:block">
        <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">სექციები</p>
        {list}
      </nav>
    </>
  );
}

function UnitBlock({
  unit,
  title,
  open,
  flash,
  onToggle,
  onCopy,
  copied,
  q,
  emphasis,
  big,
}: {
  unit: Unit;
  title: string;
  open: boolean;
  flash: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
  q: string;
  emphasis: '' | CType;
  big: boolean;
}) {
  const bodyId = `${unit.id}-body`;
  const flags = unit.clinical_types.filter((t) => t === 'dosing' || t === 'safety');
  // The unit's first heading usually repeats its title; it is not shown twice.
  const items = unit.items.filter((it, i) => !(i === 0 && it.kind === 'heading' && [title, displayTitle(unit.title)].includes(displayTitle(stripMarker(it.text)))));
  return (
    <div id={unit.id} className={cn('scroll-mt-20 lg:scroll-mt-36 transition-colors', flash && 'bg-cyan/10')}>
      <div className="flex items-start gap-1 px-2 py-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan"
        >
          <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} aria-hidden />
          <span className="min-w-0">
            <span className={cn('block leading-snug text-fg', big ? 'text-[14.5px] font-semibold' : 'text-[14px] font-medium')}>
              <Highlight text={title} q={q} />
            </span>
            {flags.length > 0 && (
              <span className="mt-1 flex gap-1">
                {flags.map((f) => (
                  <span key={f} className={cn('rounded-md border px-1.5 text-[10.5px] font-semibold', f === 'dosing' ? 'border-cyan/40 text-cyan' : 'border-clinical-high/45 text-clinical-high')}>
                    {f === 'dosing' ? 'დოზირება' : 'უსაფრთხოება'}
                  </span>
                ))}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="mt-1 shrink-0 rounded-lg p-2 text-slate-500 hover:text-cyan focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan"
          aria-label="ბმულის კოპირება ამ ერთეულზე"
          title="ბმულის კოპირება"
        >
          {copied ? <Check className="h-4 w-4 text-clinical-low" /> : <Link2 className="h-4 w-4" />}
        </button>
      </div>
      {open && (
        <div id={bodyId} className="space-y-0.5 px-4 pb-4 pl-10">
          {items.map((it) => (
            <ItemView key={it.id} item={it} q={q} emphasis={emphasis} />
          ))}
        </div>
      )}
    </div>
  );
}
