'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Badge, EmptyState, ErrorState, Panel, Skeleton, Table } from '@/components/ui/primitives';

type Summary = {
  today: { runs: number; cost: number; inputTokens: number; outputTokens: number };
  month: { runs: number; cost: number; inputTokens: number; outputTokens: number };
  byAgent: { agent: string; runs: number; cost: number }[];
  byModel: { model: string; runs: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; cost: number }[];
  costliest: { agent: string; requestType: string; cost: number; runId: string; createdAt: string }[];
  mostUsed: { requestType: string; runs: number }[];
  avgCostPerRun: number;
  totalCost: number;
  totalRuns: number;
};

const usd = (n: number) => `$${n.toFixed(4)}`;

export function UsageDashboard() {
  const [data, setData] = useState<{ available: boolean; messageKa?: string; summary?: Summary; pricing?: { model: string; inputPerMTok: number; cachedInputPerMTok: number; outputPerMTok: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/usage');
      setData(await r.json());
    } catch {
      setError('მონაცემები ვერ ჩაიტვირთა.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <Panel title="AI გამოყენება და ხარჯები"><Skeleton lines={6} /></Panel>;
  if (error) return <ErrorState title="ვერ ჩაიტვირთა" detail={error} />;
  if (!data?.available || !data.summary) return <EmptyState title="აღრიცხვა ჯერ არ არის ხელმისაწვდომი" description={data?.messageKa ?? 'გაუშვით ცოდნის ბაზის იმპორტი.'} />;

  const s = data.summary;
  const tiles: [string, string][] = [
    ['დღიური მოთხოვნები', String(s.today.runs)],
    ['თვიური მოთხოვნები', String(s.month.runs)],
    ['input tokens (თვე)', String(s.month.inputTokens)],
    ['output tokens (თვე)', String(s.month.outputTokens)],
    ['საშუალო ღირებულება მოთხოვნაზე', usd(s.avgCostPerRun)],
    ['ჯამური API ხარჯი', usd(s.totalCost)],
  ];

  return (
    <div className="space-y-4">
      <Panel title="AI გამოყენება და ხარჯები" subtitle={`სულ ${s.totalRuns} გაშვება`} actions={<button type="button" className="btn btn-ghost text-xs" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> განახლება</button>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map(([k, v]) => (
            <div key={k} className="panel-tight px-3 py-2.5">
              <p className="text-lg font-semibold tabular-nums text-cyan">{v}</p>
              <p className="text-[11px] leading-tight text-slate-400">{k}</p>
            </div>
          ))}
        </div>
        {s.totalRuns === 0 && <p className="mt-3 text-xs text-slate-500">ჯერ არცერთი AI გაშვება არ დაფიქსირებულა. მონაცემები ივსება რეალური მოთხოვნებით — სადემონსტრაციო ციფრები არ გამოიყენება.</p>}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="აგენტების გამოყენება">
          <Table headers={['აგენტი', 'გაშვებები', 'ხარჯი']} rows={s.byAgent.map((a) => [a.agent, String(a.runs), usd(a.cost)])} />
        </Panel>
        <Panel title="მოდელების გამოყენება">
          <Table
            headers={['მოდელი', 'გაშვებები', 'input', 'cached', 'output', 'ხარჯი']}
            rows={s.byModel.map((m) => [m.model, String(m.runs), String(m.inputTokens), String(m.cachedInputTokens), String(m.outputTokens), usd(m.cost)])}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="ყველაზე ძვირი workflow-ები">
          <Table headers={['აგენტი', 'ტიპი', 'ხარჯი', 'თარიღი']} rows={s.costliest.map((c) => [c.agent, c.requestType, usd(c.cost), String(c.createdAt).slice(0, 19).replace('T', ' ')])} />
        </Panel>
        <Panel title="ყველაზე ხშირად გამოყენებული ფუნქციები">
          <Table headers={['ფუნქცია', 'გაშვებები']} rows={s.mostUsed.map((m) => [m.requestType, String(m.runs)])} />
        </Panel>
      </div>

      <Panel title="მოდელების ფასების კონფიგურაცია" subtitle="MODEL_PRICING_JSON გარემოს ცვლადით იცვლება — ფასი აგენტის ლოგიკაში არ არის ჩაშენებული">
        <Table
          headers={['მოდელი', 'input / 1M', 'cached input / 1M', 'output / 1M']}
          rows={(data.pricing ?? []).map((p) => [p.model, `$${p.inputPerMTok}`, `$${p.cachedInputPerMTok}`, `$${p.outputPerMTok}`])}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone="moderate">ფასები საორიენტაციოა — დააყენეთ თქვენი რეალური ტარიფები</Badge>
        </div>
      </Panel>
    </div>
  );
}
