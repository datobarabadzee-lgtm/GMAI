'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, ExternalLink, Loader2, Search, Upload, XCircle } from 'lucide-react';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { post, readLocal, writeLocal } from './med-api';

/**
 * CURATOR PAGE — link a Georgian catalog name (MIS) to an exact FDA name.
 *
 * An approval is a clinical identity decision taken by a named person. It only
 * tells the search which exact FDA name to look up for the Georgian name; the
 * user still picks and confirms a concrete product before any label text or
 * dose appears. On the public site decisions are kept in this browser and
 * exported as a file; on a local run they are written to curated-map.json.
 */

type Decision = {
  mis_id: string;
  name_ka: string;
  name_en: string;
  kind: string;
  decision: 'approved' | 'rejected';
  target_query?: string;
  approved_by: string;
  approved_at: string;
  note?: string;
  substance?: string;
  salt?: string;
  form?: string;
  strength?: string;
  route?: string;
  registration_ref?: string;
  evidence?: { source_url: string; checked: string };
};
type Identity = { substance: string; salt: string; form: string; strength: string; route: string; registration_ref: string; evidenceUrl: string };
const EMPTY_IDENTITY: Identity = { substance: '', salt: '', form: '', strength: '', route: '', registration_ref: '', evidenceUrl: '' };
const CHECKED_KA = 'მოქმედი ნივთიერება და მარილი შემოწმდა MIS-ის ჩანაწერსა და FDA პროდუქტთან; ფორმა/სიძლიერე/ერთეული შეიძლება განსხვავდებოდეს — პროდუქტს მომხმარებელი ცალკე ადასტურებს.';
type QueueItem = { mis_id: string; kind: string; name_ka: string; name_en: string; source_url: string; crosswalk: number; decision: Decision['decision'] | null };
type Queue = { total: number; offset: number; limit: number; items: QueueItem[] };
type Item = {
  entry: { mis_id: string; kind: string; name_ka: string; name_en: string; source_url: string };
  crosswalk: { count: number; reasonKa: string };
  exactEnglish: { ok: boolean; selectableTotal: number; total: number; sample: string[] };
  siblings: { mis_id: string; kind: string; name_ka: string }[];
  decision: Decision | null;
};
type Check = { ok: boolean; selectableTotal: number; total: number; sample: string[] };
type MapInfo = { entries: Decision[]; invalid: { entry: Decision; reasonKa: string }[]; localWrite: boolean };

const PENDING_KEY = 'gmai.curation.pending.v1';
const CURATOR_KEY = 'gmai.curation.curator.v1';
const FILTERS = [
  { id: 'crosswalk', ka: 'FDA-ში იგივე ინგლისური სახელით' },
  { id: 'no_crosswalk', ka: 'დაუკავშირებელი' },
  { id: 'decided', ka: 'გადაწყვეტილი' },
  { id: 'all', ka: 'ყველა' },
] as const;
const PAGE = 25;

export function CurationWorkspace() {
  const [curator, setCurator] = useState('Davit Barabadze');
  const [pending, setPending] = useState<Decision[]>([]);
  const [operatorToken, setOperatorToken] = useState('');
  useEffect(() => {
    try {
      setOperatorToken(sessionStorage.getItem('gmai.operator.token') ?? '');
    } catch {
      /* not available */
    }
  }, []);
  const [map, setMap] = useState<MapInfo | null>(null);
  const [q, setQ] = useState('');
  const [draftQ, setDraftQ] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('crosswalk');
  const [offset, setOffset] = useState(0);
  const [queue, setQueue] = useState<{ loading: boolean; error: string | null; data: Queue | null }>({ loading: true, error: null, data: null });
  const [selected, setSelected] = useState<string | null>(null);
  const [item, setItem] = useState<{ loading: boolean; error: string | null; data: Item | null }>({ loading: false, error: null, data: null });
  const [target, setTarget] = useState('');
  const [check, setCheck] = useState<{ loading: boolean; data: Check | null }>({ loading: false, data: null });
  const [note, setNote] = useState('');
  const [ident, setIdent] = useState<Identity>(EMPTY_IDENTITY);
  const [verified, setVerified] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    setCurator(readLocal(CURATOR_KEY, 'Davit Barabadze'));
    setPending(readLocal<Decision[]>(PENDING_KEY, []));
    fetch('/api/curation/map')
      .then((r) => r.json())
      .then((j) => setMap(j as MapInfo))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let alive = true;
    setQueue((s) => ({ ...s, loading: true, error: null }));
    fetch(`/api/curation/queue?${new URLSearchParams({ q, filter, offset: String(offset), limit: String(PAGE) })}`)
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => alive && setQueue({ loading: false, error: ok ? null : j.messageKa ?? 'სია ვერ ჩაიტვირთა.', data: ok ? (j as Queue) : null }))
      .catch(() => alive && setQueue({ loading: false, error: 'სერვერთან კავშირი ვერ დამყარდა.', data: null }));
    return () => {
      alive = false;
    };
  }, [q, filter, offset]);

  const open = async (id: string) => {
    setSelected(id);
    setItem({ loading: true, error: null, data: null });
    setCheck({ loading: false, data: null });
    setVerified(false);
    setNote('');
    const r = await fetch(`/api/curation/item?mis_id=${encodeURIComponent(id)}`).then(async (x) => ({ ok: x.ok, j: await x.json() })).catch(() => null);
    if (!r || !r.ok) return setItem({ loading: false, error: r?.j.messageKa ?? 'ჩანაწერი ვერ ჩაიტვირთა.', data: null });
    const data = r.j as Item;
    setItem({ loading: false, error: null, data });
    const draft = pending.find((p) => p.mis_id === id) ?? data.decision;
    setTarget(draft?.target_query ?? (data.exactEnglish.ok ? data.entry.name_en : ''));
    setNote(draft?.note ?? '');
    setIdent({ substance: draft?.substance ?? '', salt: draft?.salt ?? '', form: draft?.form ?? '', strength: draft?.strength ?? '', route: draft?.route ?? '', registration_ref: draft?.registration_ref ?? '', evidenceUrl: draft?.evidence?.source_url ?? data.entry.source_url });
    if (draft?.target_query || data.exactEnglish.ok) void runCheck(draft?.target_query ?? data.entry.name_en);
  };

  const runCheck = async (t: string) => {
    if (t.trim().length < 2) return;
    setCheck({ loading: true, data: null });
    const r = await post<Check>('/api/curation/check', { target: t.trim() }).catch(() => null);
    setCheck({ loading: false, data: r?.ok ? r.data : { ok: false, selectableTotal: 0, total: 0, sample: [] } });
  };

  const decide = (decision: Decision['decision']) => {
    const e = item.data?.entry;
    if (!e || !curator.trim()) return;
    const d: Decision = {
      mis_id: e.mis_id,
      name_ka: e.name_ka,
      name_en: e.name_en,
      kind: e.kind,
      decision,
      ...(decision === 'approved' ? { target_query: target.trim() } : {}),
      approved_by: curator.trim(),
      approved_at: new Date().toISOString(),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(decision === 'approved'
        ? {
            substance: ident.substance.trim(),
            ...Object.fromEntries((['salt', 'form', 'strength', 'route', 'registration_ref'] as const).filter((k) => ident[k].trim()).map((k) => [k, ident[k].trim()])),
            evidence: { source_url: ident.evidenceUrl.trim(), checked: CHECKED_KA },
          }
        : {}),
    };
    const next = [...pending.filter((p) => p.mis_id !== e.mis_id), d];
    setPending(next);
    writeLocal(PENDING_KEY, next);
    setSaveMsg(null);
  };

  const removePending = (id: string) => {
    const next = pending.filter((p) => p.mis_id !== id);
    setPending(next);
    writeLocal(PENDING_KEY, next);
  };

  const exportFile = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exported_at: new Date().toISOString(), curator, entries: pending }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gmai-curation-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (f: File) => {
    try {
      const j = JSON.parse(await f.text()) as { entries?: Decision[] };
      const incoming = (j.entries ?? []).filter((d) => d && d.mis_id && (d.decision === 'approved' || d.decision === 'rejected'));
      const byId = new Map(pending.map((p) => [p.mis_id, p]));
      for (const d of incoming) byId.set(d.mis_id, d);
      const next = [...byId.values()];
      setPending(next);
      writeLocal(PENDING_KEY, next);
      setSaveMsg(`ჩაიტვირთა ${incoming.length} გადაწყვეტილება.`);
    } catch {
      setSaveMsg('ფაილი ვერ წავიკითხე.');
    }
  };

  const saveLocal = async () => {
    const r = await post<{ saved: number; rejected: { entry: Decision; reasonKa: string }[] }>('/api/curation/save', { decisions: pending }, operatorToken ? { authorization: `Bearer ${operatorToken}` } : {}).catch(() => null);
    if (!r || !r.ok) return setSaveMsg(r?.data.messageKa ?? 'შენახვა ვერ მოხერხდა.');
    setSaveMsg(`ფაილში ჩაიწერა ${r.data.saved}. ${r.data.rejected.length ? `უარყოფილია ${r.data.rejected.length}: ${r.data.rejected.map((x) => `${x.entry.name_ka} — ${x.reasonKa}`).join('; ')}` : ''}`);
    const savedIds = new Set(pending.map((p) => p.mis_id));
    const left = pending.filter((p) => r.data.rejected.some((x) => x.entry.mis_id === p.mis_id) || !savedIds.has(p.mis_id));
    setPending(left);
    writeLocal(PENDING_KEY, left);
    fetch('/api/curation/map').then((x) => x.json()).then((j) => setMap(j as MapInfo)).catch(() => undefined);
  };

  const pendingById = useMemo(() => new Map(pending.map((p) => [p.mis_id, p])), [pending]);
  const d = item.data;
  const canApprove = Boolean(d && check.data?.ok && verified && curator.trim() && target.trim() && ident.substance.trim() && /^https?:\/\//.test(ident.evidenceUrl.trim()));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-fg">კურატორის გვერდი</h1>
        <p className="mt-1 text-sm text-slate-400">
          ქართული დასახელება (MIS კატალოგი) → FDA-ს ზუსტი დასახელება. დადასტურება ცვლის მხოლოდ იმას, რომელ FDA დასახელებას ეძებს სისტემა; ინსტრუქციის ჩვენებამდე მომხმარებელი მაინც ირჩევს და ადასტურებს კონკრეტულ პროდუქტს.
        </p>
      </header>

      <div className="panel flex flex-wrap items-end gap-3 p-3">
        <label className="min-w-[220px] flex-1">
          <span className="label">კურატორი</span>
          <input
            className="field mt-1"
            value={curator}
            onChange={(e) => {
              setCurator(e.target.value);
              writeLocal(CURATOR_KEY, e.target.value);
            }}
          />
        </label>
        <div className="text-[12.5px] text-slate-400">
          {map ? (
            <>
              ძალაშია: <span className="font-medium text-fg">{map.entries.length}</span> გადაწყვეტილება
              {map.invalid.length > 0 && <span className="text-clinical-high"> · {map.invalid.length} არავალიდური (არ გამოიყენება)</span>}
              <br />
              {map.localWrite ? 'შიდა ვერსია: შენახვა ფაილში ოპერატორის გასაღებით.' : 'ონლაინ ვერსია: გადაწყვეტილებები ინახება ამ ბრაუზერში — ჩამოტვირთეთ ფაილი და გადმომეცით.'}
            </>
          ) : (
            '…'
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* queue */}
        <section className="panel min-w-0 space-y-3 p-3" aria-label="რიგი">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              setOffset(0);
              setQ(draftQ.trim());
            }}
          >
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <input className="field !pl-10" value={draftQ} onChange={(e) => setDraftQ(e.target.value)} placeholder="ძებნა: კოლომიცინი, Cerucal…" aria-label="ძებნა კატალოგში" />
          </form>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="ფილტრი">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => {
                  setFilter(f.id);
                  setOffset(0);
                }}
                className={cn('rounded-full border px-2.5 py-1 text-[12px]', filter === f.id ? 'border-cyan/60 bg-cyan/15 text-fg' : 'border-line text-slate-400 hover:text-fg')}
              >
                {f.ka}
              </button>
            ))}
          </div>
          {queue.loading && <Skeleton lines={8} />}
          {queue.error && <ErrorState title="სია ვერ ჩაიტვირთა" detail={queue.error} />}
          {queue.data && !queue.loading && (
            <>
              <p className="text-[12px] text-slate-500">{queue.data.total.toLocaleString('en-US')} ჩანაწერი</p>
              {!queue.data.items.length ? (
                <EmptyState title="ჩანაწერი არ არის" description="შეცვალეთ ფილტრი ან საძიებო სიტყვა." />
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {queue.data.items.map((it) => {
                    const p = pendingById.get(it.mis_id);
                    const st = p?.decision ?? it.decision;
                    return (
                      <li key={it.mis_id}>
                        <button type="button" onClick={() => void open(it.mis_id)} className={cn('flex w-full items-start justify-between gap-2 px-3 py-2 text-left hover:bg-ink-850', selected === it.mis_id && 'bg-cyan/10')}>
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-medium text-fg">{it.name_ka}</span>
                            <span className="block truncate text-[12px] text-slate-400">
                              {it.name_en} · {it.kind === 'trade_name' ? 'სავაჭრო' : 'ნივთიერება'}
                              {it.crosswalk ? ` · FDA-ში იგივე სახელი: ${it.crosswalk}` : ''}
                            </span>
                          </span>
                          {st && (
                            <span className={cn('shrink-0 rounded-md border px-1.5 text-[10.5px]', st === 'approved' ? 'border-clinical-low/50 text-clinical-low' : 'border-clinical-high/50 text-clinical-high')}>
                              {st === 'approved' ? 'დაკავშირებული' : 'ეკვივალენტი არ არის'}
                              {p ? ' · მონახაზი' : ''}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <nav className="flex items-center justify-between text-[12.5px]" aria-label="გვერდები">
                <button type="button" className="btn !min-h-0 !py-1" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                  ← წინა
                </button>
                <span className="text-slate-400">
                  {queue.data.total ? offset + 1 : 0}–{Math.min(offset + PAGE, queue.data.total)}
                </span>
                <button type="button" className="btn !min-h-0 !py-1" disabled={offset + PAGE >= queue.data.total} onClick={() => setOffset(offset + PAGE)}>
                  შემდეგი →
                </button>
              </nav>
            </>
          )}
        </section>

        {/* item */}
        <section className="panel min-w-0 space-y-3 p-4" aria-label="ჩანაწერი">
          {!selected && <EmptyState title="აირჩიეთ ჩანაწერი" description="მარცხნივ სიიდან აირჩიეთ ქართული დასახელება." />}
          {item.loading && <Skeleton lines={6} />}
          {item.error && <ErrorState title="ვერ ჩაიტვირთა" detail={item.error} />}
          {d && (
            <>
              <div>
                <p className="text-[18px] font-semibold text-fg">{d.entry.name_ka}</p>
                <p className="text-[13px] text-slate-400">
                  {d.entry.name_en} · {d.entry.kind === 'trade_name' ? 'სავაჭრო სახელი' : 'მოქმედი ნივთიერება'} ·{' '}
                  <a href={d.entry.source_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-cyan hover:underline">
                    MIS წყარო <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </p>
                {d.siblings.length > 0 && <p className="mt-1 text-[12px] text-slate-500">იგივე ინგლისური სახელით კატალოგში: {d.siblings.map((s) => s.name_ka).join(', ')}</p>}
              </div>

              <div className="rounded-lg border border-line bg-ink-850/50 p-3 text-[12.5px] leading-relaxed text-slate-300">
                {d.exactEnglish.ok ? (
                  <>
                    FDA-ში ზუსტად „{d.entry.name_en}“ დასახელებით: <b>{d.exactEnglish.selectableTotal}</b> პროდუქტი ({d.exactEnglish.sample.join(', ')}).
                  </>
                ) : (
                  <>FDA-ში „{d.entry.name_en}“ დასახელებით პროდუქტი არ არის. თუ იცით მოქმედი ნივთიერება (მარილის ჩათვლით), ჩაწერეთ ქვემოთ — მაგ. „colistimethate sodium“.</>
                )}
                <p className="mt-1 text-[11.5px] text-slate-500">{d.crosswalk.reasonKa}.</p>
              </div>

              <label className="block">
                <span className="label">FDA-ს ზუსტი დასახელება (სავაჭრო ან გენერიკული)</span>
                <div className="mt-1 flex gap-2">
                  <input className="field" value={target} onChange={(e) => {
                    setTarget(e.target.value);
                    setCheck({ loading: false, data: null });
                  }} placeholder="მაგ. colistimethate sodium" />
                  <button type="button" className="btn" onClick={() => void runCheck(target)} disabled={target.trim().length < 2}>
                    შემოწმება
                  </button>
                </div>
              </label>
              {check.loading && (
                <p className="flex items-center gap-2 text-[12.5px] text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> ზუსტი ძიება ინდექსში…
                </p>
              )}
              {check.data && (
                <p className={cn('text-[12.5px]', check.data.ok ? 'text-clinical-low' : 'text-clinical-high')}>
                  {check.data.ok ? (
                    <>
                      ✓ {check.data.selectableTotal} პროდუქტი ({check.data.sample.join(', ')}).{' '}
                      <a href={`/medications?q=${encodeURIComponent(target.trim())}`} target="_blank" rel="noreferrer" className="text-cyan underline">
                        პროდუქტების ნახვა
                      </a>
                    </>
                  ) : (
                    '✗ ამ ზუსტი დასახელებით შესარჩევი პროდუქტი არ არის — დაკავშირება შეუძლებელია.'
                  )}
                </p>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ['substance', 'მოქმედი ნივთიერება (სავალდებულო)', 'მაგ. colistimethate sodium'],
                    ['salt', 'მარილი', 'მაგ. sodium'],
                    ['form', 'ფორმა', 'მაგ. ფხვნილი ინჰალაციისთვის'],
                    ['strength', 'სიძლიერე', 'მაგ. 1 მლნ სე'],
                    ['route', 'მიღების გზა', 'მაგ. ინჰალაცია'],
                    ['registration_ref', 'რეგისტრაციის ნომერი / ბმული', 'MIS ან რეესტრი'],
                    ['evidenceUrl', 'მტკიცებულების წყარო (სავალდებულო)', 'https://…'],
                  ] as const
                ).map(([k, label, ph]) => (
                  <label key={k} className="block">
                    <span className="label">{label}</span>
                    <input className="field mt-1" value={ident[k]} onChange={(e) => setIdent((v) => ({ ...v, [k]: e.target.value }))} placeholder={ph} />
                  </label>
                ))}
              </div>

              <label className="block">
                <span className="label">შენიშვნა (არასავალდებულო)</span>
                <input className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="მაგ. MIS: ფხვნილი 1–2 მლნ სე; FDA პროდუქტი 150 mg CBA — დოზის ერთეულები განსხვავდება" />
              </label>

              <label className="flex items-start gap-2 text-[13px] text-slate-300">
                <input type="checkbox" className="mt-1" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
                შევამოწმე: მოქმედი ნივთიერება და მარილი ემთხვევა. ვიცი, რომ ფორმა, სიძლიერე და ერთეული (მაგ. სე/IU და mg) შეიძლება განსხვავდებოდეს და მომხმარებელი პროდუქტს ცალკე ადასტურებს.
              </label>

              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" disabled={!canApprove} onClick={() => decide('approved')}>
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> ვადასტურებ კავშირს
                </button>
                <button type="button" className="btn" disabled={!curator.trim()} onClick={() => decide('rejected')}>
                  <XCircle className="h-4 w-4" aria-hidden /> ეკვივალენტი არ არის
                </button>
              </div>
              {d.decision && (
                <p className="text-[12px] text-slate-500">
                  ძალაში მყოფი გადაწყვეტილება: {d.decision.decision === 'approved' ? `→ ${d.decision.target_query}` : 'ეკვივალენტი არ არის'} · {d.decision.approved_by} · {d.decision.approved_at.slice(0, 10)}
                </p>
              )}
            </>
          )}
        </section>
      </div>

      {/* pending */}
      <section className="panel space-y-3 p-4" aria-label="მონახაზი">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-fg">ჯერ არ შენახული გადაწყვეტილებები ({pending.length})</h2>
          <div className="flex flex-wrap gap-2">
            <label className="btn cursor-pointer !min-h-0 !py-1.5 text-[12.5px]">
              <Upload className="h-4 w-4" aria-hidden /> ფაილის ჩატვირთვა
              <input type="file" accept="application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
            </label>
            <button type="button" className="btn !min-h-0 !py-1.5 text-[12.5px]" disabled={!pending.length} onClick={exportFile}>
              <Download className="h-4 w-4" aria-hidden /> ჩამოტვირთვა
            </button>
            {map?.localWrite && (
              <>
                <label className="flex items-center gap-1.5 text-[12px] text-slate-400">
                  ოპერატორის გასაღები
                  <input
                    type="password"
                    autoComplete="off"
                    className="field !min-h-0 !w-44 !py-1 text-[12px]"
                    value={operatorToken}
                    onChange={(e) => {
                      setOperatorToken(e.target.value);
                      try {
                        sessionStorage.setItem('gmai.operator.token', e.target.value);
                      } catch {
                        /* kept in memory only */
                      }
                    }}
                  />
                </label>
                <button type="button" className="btn btn-primary !min-h-0 !py-1.5 text-[12.5px]" disabled={!pending.length || operatorToken.length < 32} onClick={() => void saveLocal()}>
                  შენახვა ფაილში
                </button>
              </>
            )}
          </div>
        </div>
        {saveMsg && <p className="text-[12.5px] text-slate-300">{saveMsg}</p>}
        {pending.length === 0 ? (
          <p className="text-[12.5px] text-slate-500">მონახაზი ცარიელია.</p>
        ) : (
          <ul className="space-y-1">
            {pending.map((p) => (
              <li key={p.mis_id} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className="font-medium text-fg">{p.name_ka}</span>
                <span className="text-slate-400">{p.decision === 'approved' ? `→ ${p.target_query}` : '— ეკვივალენტი არ არის'}</span>
                <span className="text-[11.5px] text-slate-500">
                  {p.approved_by} · {p.approved_at.slice(0, 10)}
                </span>
                <button type="button" className="text-[12px] text-slate-400 hover:text-fg" onClick={() => removePending(p.mis_id)}>
                  წაშლა
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
