'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, ChevronDown, ExternalLink, FileText, Loader2, MessageSquare, Package, Search, ShieldQuestion } from 'lucide-react';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { DrugSummaryCard } from './drug-summary-card';
import { post } from './med-api';
import { CompareSections, EmaPanel, type EmaConfirmed, type EmaSearch } from './ema-panel';
import { saveConfirmed } from './confirmed-store';

/**
 * MEDICATION SEARCH — exact name → candidate products → identity check →
 * confirmation → the product's own source sections.
 *
 * Nothing here guesses: the server returns only exact catalog matches; similar
 * names are shown apart, as suggestions that merely start a new search. Label
 * text appears only after the server has confirmed the chosen product.
 */

type Card = { record_id: number; source: 'label' | 'ndc'; source_id: string; group_id: string; effective: string; matched_name: string; name_type: string; selectable: boolean };
type Search = {
  query: string;
  status: 'product_selection_required' | 'ingredient_name_only' | 'catalog_name_only' | 'curated_mapping' | 'curator_rejected' | 'unknown_name';
  effectiveQuery: string;
  curated: { mis_id: string; name_ka: string; target_query: string | null; decision: 'approved' | 'rejected'; approved_by: string; approved_at: string; note?: string } | null;
  messageKa: string;
  total: number;
  selectableTotal: number;
  offset: number;
  limit: number;
  candidates: Card[];
  catalog: { id: string; kind: string; name_ka: string; name_en: string; source_url: string }[];
  suggestions: { name: string; noteKa: string }[];
  ema?: EmaSearch;
};
type CardId = { record_id: number; verified: boolean; noteKa?: string; brand_names: string[]; generic_names: string[]; manufacturer: string | null; routes: string[]; dosage_form: string | null; ingredients: { name: string; strength: string }[]; product_summary: string | null };
type Identity = {
  record_id: number;
  source: 'label' | 'ndc';
  source_id: string;
  effective: string;
  brand_names: string[];
  generic_names: string[];
  ingredients: { name: string; strength: string }[];
  dosage_forms: string[];
  routes: string[];
  manufacturer: string | null;
  product_ndcs: string[];
  linked: { kind: string; verified: boolean; noteKa: string };
  clinical_text_available: boolean;
  complete: boolean;
  missingKa: string[];
  content_sha256_short: string;
};
type Section = { key: string; titleKa: string; text: string; truncated: boolean };
type Confirmed = { token: string; expires_at: number; identity: Identity; retrieved_at: string; index: { key: string; titleKa: string; chars: number }[]; sections: Section[] };

const PAGE = 10;


const KIND_KA: Record<string, string> = { brand_name: 'სავაჭრო სახელი', generic_name: 'გენერიკული სახელი', substance_name: 'მხოლოდ ნივთიერება' };

export function MedicationSearch({ counts, ema }: { counts?: { fda: number; label: number; ndc: number; mis: number; snapshot: string }; ema?: { authorisedWithPi: number; snapshot: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const offset = Math.max(0, Number(params.get('o')) || 0);
  const [draft, setDraft] = useState(q);
  const [search, setSearch] = useState<{ loading: boolean; error: string | null; data: Search | null }>({ loading: false, error: null, data: null });
  const [cards, setCards] = useState<Record<number, CardId>>({});
  const [cardsLoading, setCardsLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ loading: boolean; error: string | null; identity: Identity | null }>({ loading: false, error: null, identity: null });
  const [confirmed, setConfirmed] = useState<{ loading: boolean; error: string | null; data: Confirmed | null }>({ loading: false, error: null, data: null });
  const [euConfirmed, setEuConfirmed] = useState<EmaConfirmed | null>(null);

  useEffect(() => setDraft(q), [q]);
  // For a curator-approved Georgian name the products belong to the approved
  // FDA name; identity checks and confirmation run against that exact name.
  const effQ = search.data?.effectiveQuery ?? q;

  const go = (next: { q?: string; o?: number }) => {
    const sp = new URLSearchParams();
    const nq = next.q ?? q;
    if (nq) sp.set('q', nq);
    if (next.o) sp.set('o', String(next.o));
    router.push(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  useEffect(() => {
    setSelected(null);
    setPreview({ loading: false, error: null, identity: null });
    setConfirmed({ loading: false, error: null, data: null });
    if (q.trim().length < 2) {
      setSearch({ loading: false, error: null, data: null });
      return;
    }
    let alive = true;
    setSearch({ loading: true, error: null, data: null });
    fetch(`/api/medications/search?${new URLSearchParams({ q, offset: String(offset), limit: String(PAGE) })}`)
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => alive && setSearch({ loading: false, error: ok ? null : j.messageKa ?? 'ძიება ვერ შესრულდა.', data: ok ? (j as Search) : null }))
      .catch(() => alive && setSearch({ loading: false, error: 'სერვერთან კავშირი ვერ დამყარდა.', data: null }));
    return () => {
      alive = false;
    };
  }, [q, offset]);

  // Identity fields for the visible page: one batched request per 6 records.
  useEffect(() => {
    const ids = (search.data?.candidates ?? []).filter((c) => c.selectable && !cards[c.record_id]).map((c) => c.record_id);
    if (!ids.length || !search.data) return;
    let alive = true;
    setCardsLoading(true);
    const chunks = [ids.slice(0, 6), ids.slice(6, 12)].filter((x) => x.length);
    Promise.all(chunks.map((c) => post<{ cards: CardId[] }>('/api/medications/cards', { query: search.data!.effectiveQuery, ids: c })))
      .then((rs) => {
        if (!alive) return;
        const next: Record<number, CardId> = {};
        for (const r of rs) for (const c of r.data.cards ?? []) next[c.record_id] = c;
        setCards((p) => ({ ...p, ...next }));
      })
      .finally(() => alive && setCardsLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.data]);

  const choose = async (id: number) => {
    setSelected(id);
    setConfirmed({ loading: false, error: null, data: null });
    setPreview({ loading: true, error: null, identity: null });
    const r = await post<{ identity: Identity }>('/api/medications/preview', { query: effQ, recordId: id }).catch(() => null);
    if (!r) return setPreview({ loading: false, error: 'სერვერთან კავშირი ვერ დამყარდა.', identity: null });
    setPreview({ loading: false, error: r.ok ? null : r.data.messageKa ?? 'პროდუქტის მონაცემები ვერ ჩაიტვირთა.', identity: r.ok ? r.data.identity : null });
    requestAnimationFrame(() => document.getElementById('med-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const confirm = async () => {
    if (selected === null) return;
    setConfirmed({ loading: true, error: null, data: null });
    const r = await post<Confirmed>('/api/medications/confirm', { query: effQ, recordId: selected }).catch(() => null);
    if (!r || !r.ok) return setConfirmed({ loading: false, error: r?.data.messageKa ?? 'დადასტურება ვერ მოხერხდა.', data: null });
    setConfirmed({ loading: false, error: null, data: r.data });
    const title = [...r.data.identity.brand_names, ...r.data.identity.generic_names][0] ?? q;
    saveConfirmed('US', { query: effQ, recordId: selected, token: r.data.token, title: `${title} · ${r.data.identity.ingredients.map((i) => i.strength).join(', ')}`, expires_at: r.data.expires_at });
  };

  const loadMore = async (key: string, start: number) => {
    if (!confirmed.data || selected === null) return;
    const r = await post<{ sections: Section[] }>('/api/medications/context', { query: effQ, recordId: selected, token: confirmed.data.token, section: key, start }).catch(() => null);
    if (!r || !r.ok) return setConfirmed((c) => ({ ...c, error: r?.data.messageKa ?? 'სექცია ვერ ჩაიტვირთა.' }));
    const add = r.data.sections[0];
    if (!add) return;
    setConfirmed((c) => {
      if (!c.data) return c;
      const exists = c.data.sections.find((s) => s.key === key);
      const sections = exists ? c.data.sections.map((s) => (s.key === key ? { ...s, text: s.text + add.text, truncated: add.truncated } : s)) : [...c.data.sections, add];
      return { ...c, data: { ...c.data, sections } };
    });
  };

  const d = search.data;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-fg">მედიკამენტის ძიება</h1>
        <p className="mt-1 text-sm text-slate-400">ზუსტი დასახელებით — ქართულად ან ინგლისურად. ინსტრუქცია ჩანს მხოლოდ კონკრეტული პროდუქტის არჩევისა და დადასტურების შემდეგ.</p>
        {counts && (
          <p className="mt-1 text-[12.5px] text-slate-500">
            ბაზაში: {counts.fda.toLocaleString('en-US')} FDA ჩანაწერი ({counts.label.toLocaleString('en-US')} ინსტრუქცია · {counts.ndc.toLocaleString('en-US')} პროდუქტი) · {counts.mis.toLocaleString('en-US')} ქართული დასახელება · მდგომარეობა {counts.snapshot}
            {ema ? ` · ევროპა: ${ema.authorisedWithPi.toLocaleString('en-US')} ცენტრალიზებულად რეგისტრირებული პრეპარატის ინსტრუქცია (EMA, ${ema.snapshot})` : ''}
          </p>
        )}
      </header>

      <form
        className="panel flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim().length >= 2) go({ q: draft.trim(), o: 0 });
        }}
      >
        <label className="relative flex-1">
          <span className="sr-only">პრეპარატის ზუსტი დასახელება</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input className="field !pl-10" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="მაგ.: Coly-Mycin M, colchicine, კოლომიცინი" autoComplete="off" />
        </label>
        <button type="submit" className="btn btn-primary">
          ძიება
        </button>
      </form>

      {search.loading && <Skeleton lines={6} />}
      {search.error && <ErrorState title="ძიება ვერ შესრულდა" detail={search.error} />}
      {!q && !search.loading && <EmptyState title="ჩაწერეთ დასახელება" description="მსგავსი სახელით წამალს არ ვარჩევთ. თუ ზუსტად არ იცით, შეფუთვაზე ნახეთ ლათინური სახელი, მოქმედი ნივთიერება, ფორმა და სიძლიერე." />}

      {d && (
        <section className="space-y-3" aria-live="polite">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-fg">აშშ — FDA</h2>
            <span className="text-[12px] text-slate-500">openFDA: ინსტრუქციები და პროდუქტები</span>
          </div>
          <div className={cn('flex gap-2.5 rounded-xl border p-3 text-[13.5px] leading-relaxed', d.status === 'product_selection_required' || d.status === 'curated_mapping' ? 'border-line bg-ink-900 text-slate-300' : 'border-clinical-moderate/50 bg-clinical-moderate/10 text-slate-200')}>
            {d.status === 'product_selection_required' || d.status === 'curated_mapping' ? <Package className="mt-0.5 h-4 w-4 shrink-0 text-cyan" aria-hidden /> : <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-clinical-moderate" aria-hidden />}
            <div>
              <p>{d.messageKa}</p>
              {d.curated && (
                <p className="mt-1 text-[12.5px] text-slate-300">
                  {d.curated.decision === 'approved' ? (
                    <>
                      კურატორის გადაწყვეტილება: „{d.curated.name_ka}“ → <span className="font-semibold text-fg">{d.curated.target_query}</span>
                    </>
                  ) : (
                    <>კურატორის გადაწყვეტილება: „{d.curated.name_ka}“ — FDA-ში ეკვივალენტი არ არის</>
                  )}{' '}
                  · {d.curated.approved_by} · {d.curated.approved_at.slice(0, 10)}
                  {d.curated.note ? ` · ${d.curated.note}` : ''}
                </p>
              )}
              {(d.status === 'product_selection_required' || d.status === 'curated_mapping') && (
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {d.selectableTotal} პროდუქტი{d.total > d.selectableTotal ? ` · ${d.total - d.selectableTotal} მხოლოდ ნივთიერების სახელით ემთხვევა` : ''}
                </p>
              )}
            </div>
          </div>

          {d.catalog.length > 0 && (
            <div className="rounded-xl border border-line bg-ink-900 p-3">
              <p className="label mb-1.5">ქართული კატალოგი (MIS)</p>
              <ul className="space-y-1.5">
                {d.catalog.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                    <span className="font-medium text-fg">{c.name_ka}</span>
                    {c.name_en && <span className="text-slate-400">{c.name_en}</span>}
                    <span className="text-[11.5px] text-slate-500">{c.kind === 'trade_name' ? 'სავაჭრო სახელი' : c.kind === 'ingredient' ? 'ნივთიერება' : c.kind}</span>
                    <a href={c.source_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[12px] text-cyan hover:underline">
                      წყარო <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">ქართულ-ინგლისური სახელების წყვილი არ ადასტურებს, რომ ეს იგივე პროდუქტია, რაც FDA-ს ჩანაწერში. FDA-ში ძებნა ინგლისური სახელით — ცალკე, თქვენი არჩევით.</p>
              {d.status === 'catalog_name_only' && d.catalog.some((c) => c.name_en && c.name_en.toLowerCase() !== q.toLowerCase()) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...new Set(d.catalog.map((c) => c.name_en).filter(Boolean))].map((en) => (
                    <button key={en} type="button" className="btn !min-h-0 !py-1 text-[12px]" onClick={() => go({ q: en, o: 0 })}>
                      ძებნა: „{en}“ (დაუდასტურებელი შესაბამისობა)
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {d.suggestions.length > 0 && (
            <div className="rounded-xl border border-dashed border-line p-3">
              <p className="label mb-1">მსგავსი დასახელება — საძიებო შეთავაზება, არა იდენტიფიკაცია</p>
              {d.suggestions.map((s) => (
                <div key={s.name} className="flex flex-wrap items-center gap-2 text-[13px]">
                  <button type="button" className="font-medium text-cyan hover:underline" onClick={() => go({ q: s.name, o: 0 })}>
                    {s.name}
                  </button>
                  <span className="text-[12px] text-slate-500">{s.noteKa}</span>
                </div>
              ))}
            </div>
          )}

          {d.candidates.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {d.candidates.map((c) => {
                const id = cards[c.record_id];
                const title = id?.brand_names[0] ?? c.matched_name;
                return (
                  <li key={c.record_id}>
                    <div className={cn('h-full rounded-xl border bg-ink-900 p-3', selected === c.record_id ? 'border-cyan' : 'border-line')}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-fg">{title}</p>
                          <p className="text-[12px] text-slate-400">{id?.generic_names.join(', ') || KIND_KA[c.name_type] || c.name_type}</p>
                        </div>
                        <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-slate-400">{c.source === 'label' ? 'ინსტრუქცია' : 'პროდუქტი (NDC)'}</span>
                      </div>
                      <dl className="mt-2 space-y-0.5 text-[12px] text-slate-400">
                        {id?.ingredients.length ? <Row k="ნივთიერება / სიძლიერე" v={id.ingredients.map((i) => `${i.name} ${i.strength}`).join('; ')} /> : null}
                        {id?.dosage_form && <Row k="ფორმა" v={id.dosage_form} />}
                        {id?.routes.length ? <Row k="გზა" v={id.routes.join(', ')} /> : null}
                        {id?.manufacturer && <Row k="მწარმოებელი" v={id.manufacturer} />}
                        {id?.product_summary && <Row k="წყაროს ჩანაწერი" v={id.product_summary} />}
                        {c.effective && <Row k="წყაროს თარიღი" v={c.effective} />}
                      </dl>
                      {id && !id.verified && id.noteKa && <p className="mt-1.5 text-[11.5px] text-clinical-moderate">{id.noteKa}</p>}
                      {!id && cardsLoading && c.selectable && <p className="mt-1.5 text-[11.5px] text-slate-500">მონაცემები იტვირთება…</p>}
                      {c.selectable ? (
                        <button type="button" className="btn mt-2 w-full !min-h-0 !py-1.5 text-[12.5px]" onClick={() => void choose(c.record_id)} aria-pressed={selected === c.record_id}>
                          ამ პროდუქტის შემოწმება
                        </button>
                      ) : (
                        <p className="mt-2 text-[11.5px] text-slate-500">მხოლოდ ნივთიერების სახელით ემთხვევა — პროდუქტად ვერ აირჩევა.</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {d.total > PAGE && (
            <nav className="flex items-center justify-between text-[13px]" aria-label="გვერდები">
              <button type="button" className="btn !min-h-0 !py-1.5" disabled={offset === 0} onClick={() => go({ o: Math.max(0, offset - PAGE) })}>
                ← წინა
              </button>
              <span className="text-slate-400">
                {offset + 1}–{Math.min(offset + PAGE, d.total)} / {d.total}
              </span>
              <button type="button" className="btn !min-h-0 !py-1.5" disabled={offset + PAGE >= d.total} onClick={() => go({ o: offset + PAGE })}>
                შემდეგი →
              </button>
            </nav>
          )}
        </section>
      )}

      {selected !== null && (
        <section id="med-preview" className="panel scroll-mt-20 space-y-3 p-4">
          <h2 className="text-[15px] font-semibold text-fg">პროდუქტის იდენტობა</h2>
          {preview.loading && (
            <p className="flex items-center gap-2 text-[13px] text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> წყაროდან მოწმდება (ID, ჯგუფი, დასახელება, ფორმა, სიძლიერე, გზა)…
            </p>
          )}
          {preview.error && <ErrorState title="ვერ შემოწმდა" detail={preview.error} />}
          {preview.identity && <IdentityGrid id={preview.identity} />}
          {preview.identity && !preview.identity.complete && (
            <p className="flex gap-2 rounded-lg border border-clinical-high/50 bg-clinical-high/10 p-3 text-[13px] text-slate-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-clinical-high" aria-hidden />
              დადასტურება შეუძლებელია — წყაროში აკლია: {preview.identity.missingKa.join(', ')}. ამ პროდუქტზე ინსტრუქცია და დოზა არ გამოჩნდება.
            </p>
          )}
          {preview.identity?.complete && !confirmed.data && (
            <div className="space-y-2 rounded-lg border border-line bg-ink-850/50 p-3">
              <p className="text-[13px] leading-relaxed text-slate-300">შეადარეთ შეფუთვას: მოქმედი ნივთიერება და მარილი, სიძლიერე, ფორმა და შეყვანის გზა. დადასტურება ნიშნავს მხოლოდ იმას, რომ ეს არის თქვენი პროდუქტი — ეს არ არის დანიშნულება.</p>
              <button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={confirmed.loading}>
                {confirmed.loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BadgeCheck className="h-4 w-4" aria-hidden />} ვადასტურებ — ეს ჩემი პროდუქტია
              </button>
            </div>
          )}
          {confirmed.error && <ErrorState title="ინსტრუქცია ვერ გამოჩნდა" detail={confirmed.error} />}
        </section>
      )}

      {confirmed.data && (
        <section className="panel space-y-3 p-4" aria-label="დადასტურებული პროდუქტის ინსტრუქცია">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-clinical-low/50 bg-clinical-low/10 px-2 py-0.5 text-[12px] font-medium text-clinical-low">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> იდენტობა დადასტურებულია
            </span>
            <span className="text-[12px] text-slate-500">
              წყარო: openFDA · {confirmed.data.identity.source_id} · ჩანაწერის თარიღი {confirmed.data.identity.effective} · ჩამოტვირთულია {new Date(confirmed.data.retrieved_at).toLocaleString('ka-GE')}
            </span>
          </div>
          <p className="text-[12px] text-slate-500">კლინიკური ვალიდაცია არ ჩატარებულა; ეს აშშ-ის ეტიკეტია და შეიძლება განსხვავდებოდეს საქართველოში რეგისტრირებული ინსტრუქციისგან.</p>
          {!confirmed.data.index.length && <p className="text-[13px] text-slate-300">ამ პროდუქტს დადასტურებული ინსტრუქციის ტექსტი არ აქვს დაკავშირებული (NDC ჩანაწერი სრული ინსტრუქცია არ არის). დოზირების ინფორმაცია არ გამოჩნდება.</p>}
          {confirmed.data.index.length > 0 && (
            <>
              <DrugSummaryCard product={{ query: effQ, recordId: selected!, token: confirmed.data.token }} />
              <div className="space-y-1.5">
                <p className="label">ორიგინალი ტექსტი (ინგლისურად)</p>
                {confirmed.data.index.map((ix) => {
                  const sec = confirmed.data!.sections.find((s) => s.key === ix.key);
                  return (
                    <details key={ix.key} className="group rounded-lg border border-line bg-ink-900">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[13.5px] font-medium text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan">
                        <span className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-slate-500" aria-hidden />
                          {ix.titleKa}
                          {(ix.key === 'dosage_and_administration' || ix.key === 'boxed_warning') && <span className="rounded border border-clinical-high/45 px-1 text-[10.5px] text-clinical-high">{ix.key === 'boxed_warning' ? 'გაფრთხილება' : 'დოზირება'}</span>}
                        </span>
                        <ChevronDown className="h-4 w-4 text-slate-500 transition group-open:rotate-180" aria-hidden />
                      </summary>
                      <div className="border-t border-line px-3 py-2.5">
                        {sec ? (
                          <>
                            <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-slate-300">{sec.text}</p>
                            {sec.truncated && (
                              <button type="button" className="mt-2 text-[12px] text-cyan hover:underline" onClick={() => void loadMore(ix.key, sec.text.length)}>
                                გაგრძელება…
                              </button>
                            )}
                          </>
                        ) : (
                          <button type="button" className="text-[12px] text-cyan hover:underline" onClick={() => void loadMore(ix.key, 0)}>
                            ჩატვირთვა
                          </button>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            </>
          )}
          <Link href="/clinical" className="btn inline-flex text-[13px]">
            <MessageSquare className="h-4 w-4" aria-hidden /> კითხვა AI-ს ამ პროდუქტზე
          </Link>
        </section>
      )}

      {d?.ema && <EmaPanel data={d.ema} onConfirmed={setEuConfirmed} />}

      {confirmed.data && euConfirmed && (
        <CompareSections
          us={{ title: [...confirmed.data.identity.brand_names, ...confirmed.data.identity.generic_names][0] ?? q, sections: confirmed.data.sections, index: confirmed.data.index }}
          eu={{ title: euConfirmed.identity.smpc_name, sections: euConfirmed.sections, index: euConfirmed.index }}
        />
      )}
      {euConfirmed && (
        <Link href="/clinical" className="btn inline-flex text-[13px]">
          <MessageSquare className="h-4 w-4" aria-hidden /> კითხვა AI-ს — {confirmed.data ? 'ორივე დადასტურებული პროდუქტით (აშშ და ევროპა)' : 'ევროპული პროდუქტით'}
        </Link>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 text-slate-500">{k}:</dt>
      <dd className="min-w-0 break-words text-slate-300">{v}</dd>
    </div>
  );
}

function IdentityGrid({ id }: { id: Identity }) {
  const cell = (k: string, v: string | null | undefined, missing?: boolean) => (
    <div className={cn('rounded-lg border p-2.5', missing ? 'border-clinical-high/50' : 'border-line')}>
      <p className="text-[11px] font-medium text-slate-500">{k}</p>
      <p className={cn('mt-0.5 text-[13.5px]', missing ? 'text-clinical-high' : 'text-fg')}>{v || 'წყაროში არ არის'}</p>
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {cell('დასახელება', [...id.brand_names, ...id.generic_names].join(' / '))}
        {cell('მოქმედი ნივთიერება (მარილი)', [...new Set(id.ingredients.map((i) => i.name))].join('; '), !id.ingredients.length)}
        {cell('სიძლიერე და ერთეული', id.ingredients.map((i) => i.strength).join('; '), !id.ingredients.length)}
        {cell('ფორმა', id.dosage_forms.join('; '), !id.dosage_forms.length)}
        {cell('შეყვანის გზა', id.routes.join(', '), !id.routes.length)}
        {cell('მწარმოებელი', id.manufacturer)}
      </div>
      <p className="text-[12px] leading-relaxed text-slate-500">
        წყარო: openFDA {id.source === 'label' ? 'ინსტრუქცია' : 'NDC'} {id.source_id} · თარიღი {id.effective}
        {id.product_ndcs.length ? ` · NDC ${id.product_ndcs.slice(0, 4).join(', ')}` : ''} · {id.linked.noteKa}
      </p>
    </div>
  );
}
