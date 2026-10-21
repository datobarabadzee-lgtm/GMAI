'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Badge, Bullets, EmptyState, ErrorState, Panel, Skeleton, Table } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

type Trace = {
  rawQuery: string;
  normalizedQuery: string;
  ftsQuery: string;
  entities: string[];
  expandedTerms: string[];
  impliedDomains: string[];
  numericTerms: string[];
  lexicalCandidates: { item_id: string; score: number }[];
  semanticCandidates: { item_id: string; score: number }[];
  mergedCount: number;
  embedding: { provider: string; model: string; semantic: boolean; labelKa: string };
  tookMs: number;
};

type Hit = {
  kind: string;
  rule_id: string;
  maturity: string;
  rights_status: string;
  topic_title?: string | null;
  action?: string | null;
  criterion_or_action?: string | null;
  question?: string;
  source_id: string;
  source_pages?: (string | number)[];
  current_evidence_refresh_required?: boolean;
  score: { lexical: number; semantic: number; domainMatch: number; maturity: number; safetyPriority: number; requiredDataMatch: number; freshnessPenalty: number; final: number };
};

const KINDS = [
  { id: 'clinical_rule', labelKa: 'კლინიკური წესი' },
  { id: 'quality_rule', labelKa: 'ხარისხის წესი' },
  { id: 'audit_question', labelKa: 'აუდიტის კითხვა' },
];

export function RetrievalDebugger() {
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<string[]>([]);
  const [excludeCandidates, setExcludeCandidates] = useState(false);
  const [lexicalWeight, setLexicalWeight] = useState(0.42);
  const [semanticWeight, setSemanticWeight] = useState(0.28);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<{ coverage: string; messageKa: string; hits: Hit[]; trace: Trace | null } | null>(null);

  const run = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/kb/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, kinds: kinds.length ? kinds : undefined, excludeCandidates, lexicalWeight, semanticWeight, limit: 20, debug: true }),
      });
      const json = await r.json();
      if (!r.ok) {
        setError(json.messageKa ?? 'ძიება ვერ შესრულდა.');
        return;
      }
      setRes(json);
    } catch {
      setError('სერვერთან კავშირი ვერ დამყარდა.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="სატესტო მოთხოვნა">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input className="field pl-9" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} placeholder="მაგ.: დისპეფსია 60 წლის პაციენტში / ინფორმირებული თანხმობის ხარვეზი" />
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={loading}>
            ძიება
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button key={k.id} type="button" onClick={() => setKinds((p) => (p.includes(k.id) ? p.filter((x) => x !== k.id) : [...p, k.id]))} className={cn('rounded-full border px-3 py-1 text-xs transition', kinds.includes(k.id) ? 'border-cyan/50 bg-cyan/15 text-fg' : 'border-line text-slate-400')}>
              {k.labelKa}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" className="h-3.5 w-3.5 accent-cyan" checked={excludeCandidates} onChange={(e) => setExcludeCandidates(e.target.checked)} />
            კანდიდატების გამორიცხვა
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">
            ლექსიკური წონა: {lexicalWeight.toFixed(2)}
            <input type="range" min={0} max={1} step={0.02} value={lexicalWeight} onChange={(e) => setLexicalWeight(Number(e.target.value))} className="mt-1 w-full accent-cyan" />
          </label>
          <label className="text-xs text-slate-400">
            სემანტიკური წონა: {semanticWeight.toFixed(2)}
            <input type="range" min={0} max={1} step={0.02} value={semanticWeight} onChange={(e) => setSemanticWeight(Number(e.target.value))} className="mt-1 w-full accent-cyan" />
          </label>
        </div>
      </Panel>

      {loading && <Panel><Skeleton lines={6} /></Panel>}
      {error && <ErrorState title="ვერ შესრულდა" detail={error} />}

      {!loading && res?.trace && (
        <>
          <Panel title="ძიების კვალი" subtitle={`${res.trace.tookMs} ms · გაერთიანებული კანდიდატები: ${res.trace.mergedCount}`}>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Badge tone={res.coverage === 'COVERED' ? 'low' : res.coverage === 'PARTIAL' ? 'moderate' : 'critical'}>დაფარვა: {res.coverage}</Badge>
              <Badge tone={res.trace.embedding.semantic ? 'low' : 'moderate'}>{res.trace.embedding.model}</Badge>
            </div>
            {res.messageKa && <p className="mb-2 text-sm text-clinical-moderate">{res.messageKa}</p>}
            <dl className="space-y-1.5 text-xs">
              <div><dt className="label">ნორმალიზებული მოთხოვნა</dt><dd className="font-mono text-slate-300">{res.trace.normalizedQuery}</dd></div>
              <div><dt className="label">FTS გამოსახულება</dt><dd className="break-all font-mono text-slate-400">{res.trace.ftsQuery}</dd></div>
              <div><dt className="label">გაფართოებული ტერმინები</dt><dd className="text-slate-300">{res.trace.expandedTerms.join(', ') || '—'}</dd></div>
              <div><dt className="label">ნაგულისხმევი დომენები</dt><dd className="text-slate-300">{res.trace.impliedDomains.join(', ') || '—'}</dd></div>
              <div><dt className="label">რიცხვითი ტერმინები</dt><dd className="font-mono text-slate-300">{res.trace.numericTerms.join(' | ') || '—'}</dd></div>
            </dl>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="ლექსიკური კანდიდატები">
              <Bullets items={res.trace.lexicalCandidates.map((c) => `${c.item_id} — ${c.score.toFixed(3)}`)} />
            </Panel>
            <Panel title="სემანტიკური კანდიდატები">
              <Bullets items={res.trace.semanticCandidates.map((c) => `${c.item_id} — ${c.score.toFixed(3)}`)} />
            </Panel>
          </div>

          <Panel title="საბოლოო რანჟირება" subtitle="ყველა ქულა დეკომპოზირებულია">
            <Table
              headers={['წესი', 'ტიპი', 'სიმწიფე', 'ლექს.', 'სემ.', 'დომენი', 'სიმწიფის წონა', 'უსაფრთხ.', 'მონაცემები', 'სიახლის ჯარიმა', 'საბოლოო']}
              rows={res.hits.map((h) => [
                <span key="i" className="font-mono text-[11px]">{h.rule_id}</span>,
                h.kind,
                h.maturity,
                h.score.lexical.toFixed(2),
                h.score.semantic.toFixed(2),
                h.score.domainMatch.toFixed(2),
                h.score.maturity.toFixed(2),
                h.score.safetyPriority.toFixed(2),
                h.score.requiredDataMatch.toFixed(2),
                h.score.freshnessPenalty.toFixed(2),
                <strong key="f" className="text-cyan">{h.score.final.toFixed(3)}</strong>,
              ])}
            />
          </Panel>

          <Panel title="შერჩეული წესები">
            <ul className="space-y-2">
              {res.hits.map((h) => (
                <li key={h.rule_id} className="rounded-lg border border-line bg-ink-850/40 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] text-cyan">{h.rule_id}</span>
                    <Badge>{h.kind}</Badge>
                    <Badge tone={h.maturity.includes('CANDIDATE') ? 'moderate' : 'low'}>{h.maturity}</Badge>
                    <Badge tone={h.rights_status.startsWith('RESTRICTED') ? 'critical' : 'neutral'}>{h.rights_status}</Badge>
                    {h.current_evidence_refresh_required && <Badge tone="moderate">refresh required</Badge>}
                  </div>
                  <p className="mt-1.5 text-sm text-slate-200">{h.topic_title ?? ''}</p>
                  <p className="mt-1 text-sm text-slate-300">{h.action ?? h.criterion_or_action ?? h.question ?? '—'}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-600">{h.source_id}{h.source_pages?.length ? ` · გვ. ${h.source_pages.join(',')}` : ''}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}

      {!loading && !res && !error && <EmptyState title="ძიების დიაგნოსტიკა" description="შეიყვანეთ სატესტო მოთხოვნა, რომ დაინახოთ ნორმალიზაცია, ლექსიკური და სემანტიკური კანდიდატები, გაერთიანება, რერანკინგი და საბოლოო შერჩევა ქულების დაშლით." />}
    </div>
  );
}
