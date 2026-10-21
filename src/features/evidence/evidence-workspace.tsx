'use client';

import { useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import type { RetrievalHit, SourceType } from '@/schemas/evidence';
import { Badge, EmptyState, ErrorState, ExportBar, Panel, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const TYPES: { id: SourceType; labelKa: string }[] = [
  { id: 'guideline', labelKa: 'გაიდლაინი' },
  { id: 'systematic_review', labelKa: 'სისტემური მიმოხილვა' },
  { id: 'meta_analysis', labelKa: 'მეტაანალიზი' },
  { id: 'rct', labelKa: 'RCT' },
  { id: 'cohort', labelKa: 'კოჰორტული' },
  { id: 'consensus', labelKa: 'კონსენსუსი' },
  { id: 'drug_label', labelKa: 'წამლის ეტიკეტი' },
  { id: 'regulatory', labelKa: 'მარეგულირებელი' },
  { id: 'local_protocol', labelKa: 'ლოკალური პროტოკოლი' },
  { id: 'legal', labelKa: 'სამართლებრივი' },
];

const FRESHNESS_TONE = { current: 'low', review_due: 'moderate', superseded: 'critical', historical: 'neutral' } as const;

export function EvidenceWorkspace() {
  const [text, setText] = useState('');
  const [pico, setPico] = useState({ p: '', i: '', c: '', o: '' });
  const [usePico, setUsePico] = useState(false);
  const [types, setTypes] = useState<SourceType[]>([]);
  const [onlyCurrent, setOnlyCurrent] = useState(false);
  const [yearFrom, setYearFrom] = useState<number | ''>('');
  const [hits, setHits] = useState<RetrievalHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/evidence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          pico: usePico ? pico : undefined,
          sourceTypes: types,
          specialties: [],
          jurisdictions: [],
          onlyCurrent,
          yearFrom: yearFrom === '' ? undefined : Number(yearFrom),
          limit: 15,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.messageKa ?? 'ძიება ვერ შესრულდა.');
        return;
      }
      setHits(json.hits as RetrievalHit[]);
      if (json.messageKa) setMessage(json.messageKa);
    } catch {
      setError('სერვერთან კავშირი ვერ დამყარდა.');
    } finally {
      setLoading(false);
    }
  };

  const md = hits?.length
    ? `# მტკიცებულების ძიება\n\nმოთხოვნა: ${text || Object.values(pico).filter(Boolean).join(' / ')}\n\n${hits
        .map(
          (h) =>
            `## ${h.source.title}\n- გამომცემელი: ${h.source.publisher} (${h.source.year})\n- ტიპი: ${h.source.source_type} · მტკიცებულების რანგი: ${h.source.evidence_rank}\n- პოპულაცია: ${h.source.population}\n- საკვანძო მიგნება: ${h.source.key_finding}\n- გამოყენებადობა: ${h.source.applicability}\n- სიახლე: ${h.source.freshness} (ბოლო შემოწმება ${h.source.last_checked})\n- ციტირება: ${h.source.citation_text}${h.source.url ? `\n- URL: ${h.source.url}` : ''}`,
        )
        .join('\n\n')}`
    : '';

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="space-y-2">
        <Panel title="ფილტრები" subtitle="ჰიბრიდული ძიება">
          <div className="space-y-3">
            <div>
              <p className="label mb-1">მტკიცებულების ტიპი</p>
              <div className="flex flex-wrap gap-1">
                {TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTypes((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]))}
                    className={cn('rounded-full border px-2 py-0.5 text-[11px] transition', types.includes(t.id) ? 'border-cyan/50 bg-cyan/15 text-fg' : 'border-line text-slate-400 hover:text-slate-200')}
                  >
                    {t.labelKa}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" className="h-3.5 w-3.5 accent-cyan" checked={onlyCurrent} onChange={(e) => setOnlyCurrent(e.target.checked)} />
              მხოლოდ აქტუალური (current)
            </label>
            <div>
              <p className="label mb-1">წელი (-დან)</p>
              <input className="field" type="number" value={yearFrom} onChange={(e) => setYearFrom(e.target.value === '' ? '' : Number(e.target.value))} placeholder="მაგ. 2015" />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" className="h-3.5 w-3.5 accent-cyan" checked={usePico} onChange={(e) => setUsePico(e.target.checked)} />
              PICO რეჟიმი
            </label>
            {usePico && (
              <div className="space-y-1.5">
                {(['p', 'i', 'c', 'o'] as const).map((k) => (
                  <input key={k} className="field" placeholder={{ p: 'Population', i: 'Intervention', c: 'Comparison', o: 'Outcome' }[k]} value={pico[k]} onChange={(e) => setPico((prev) => ({ ...prev, [k]: e.target.value }))} />
                ))}
              </div>
            )}
          </div>
        </Panel>
      </aside>

      <div className="min-w-0 space-y-4">
        <Panel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input className="field pl-9" value={text} onChange={(e) => setText(e.target.value)} placeholder="მაგ. ანტიკოაგულაცია წინაგულების ფიბრილაციაში თირკმლის უკმარისობით" onKeyDown={(e) => e.key === 'Enter' && void search()} />
            </div>
            <button type="button" className="btn btn-primary" onClick={() => void search()} disabled={loading}>
              <SlidersHorizontal className="h-4 w-4" /> ძიება
            </button>
          </div>
        </Panel>

        {loading && (
          <Panel>
            <Skeleton lines={5} />
          </Panel>
        )}
        {error && !loading && <ErrorState title="ძიება ვერ შესრულდა" detail={error} />}
        {message && !loading && !error && <ErrorState title="შედეგი არ არის" detail={message} hint="Source Registry ფართოვდება ingestion pipeline-ით — /dev/ingest." />}

        {!loading && hits && hits.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">{hits.length} შედეგი</p>
              <ExportBar text={md} json={hits} filename="evidence-search" onClear={() => { setHits(null); setMessage(null); setError(null); }} />
            </div>
            <div className="space-y-2">
              {hits.map((h) => (
                <Panel key={h.source.source_id} className="p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={FRESHNESS_TONE[h.source.freshness]}>{h.source.freshness}</Badge>
                    <Badge>{h.source.source_type}</Badge>
                    <Badge>{h.source.jurisdiction}</Badge>
                    <Badge>{h.source.rights_status}</Badge>
                    <span className="ml-auto font-mono text-[10px] text-slate-600">score {h.score.toFixed(3)}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold leading-snug text-slate-100">{h.source.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {h.source.publisher} · {h.source.year} · მტკიცებულების რანგი {h.source.evidence_rank}
                  </p>
                  {h.source.population && (
                    <p className="mt-2 text-xs text-slate-400">
                      <span className="label mr-1.5">პოპულაცია</span>
                      {h.source.population}
                    </p>
                  )}
                  {h.source.key_finding && <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{h.source.key_finding}</p>}
                  {h.source.applicability && (
                    <p className="mt-1.5 text-xs text-slate-400">
                      <span className="label mr-1.5">გამოყენებადობა</span>
                      {h.source.applicability}
                    </p>
                  )}
                  <p className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-slate-500">{h.source.citation_text}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span>ბოლო შემოწმება: {h.source.last_checked}</span>
                    {h.source.url && (
                      <a href={h.source.url} target="_blank" rel="noreferrer noopener" className="text-cyan hover:underline">
                        წყარო
                      </a>
                    )}
                    {h.matched.length > 0 && <span className="font-mono text-slate-600">match: {h.matched.slice(0, 5).join(', ')}</span>}
                  </div>
                </Panel>
              ))}
            </div>
          </>
        )}

        {!loading && !hits && !error && (
          <EmptyState title="მტკიცებულების ძიება" description="ჰიბრიდული ძიება აერთიანებს სემანტიკურ და ლექსიკურ ძიებას, ავტორიტეტსა და სიახლეს. ყველა შედეგი მოდის Source Registry-დან — გამოგონილი წყარო არ ბრუნდება." />
        )}
      </div>
    </div>
  );
}
