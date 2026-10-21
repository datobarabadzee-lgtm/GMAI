'use client';

import { useMemo, useState } from 'react';
import { Calculator as CalcIcon, Search } from 'lucide-react';
import { CALCULATORS, type CalcResult } from '@/lib/calculators';
import { Badge, Bullets, ExportBar, Panel } from '@/components/ui/primitives';
import { sourcesByIds } from '@/knowledge/sources';
import { cn } from '@/lib/utils';
import { useCase } from '@/features/case/case-store';

const CATEGORY_KA: Record<string, string> = {
  cardiology: 'კარდიოლოგია',
  neurology: 'ნევროლოგია',
  respiratory: 'პულმონოლოგია',
  critical_care: 'ინტენსიური თერაპია',
  hepatology: 'ჰეპატოლოგია',
  nephrology: 'ნეფროლოგია',
  general: 'ზოგადი',
  haematology: 'ჰემატოლოგია',
};

export function CalculatorWorkspace() {
  const { patient } = useCase();
  const [q, setQ] = useState('');
  const [activeId, setActiveId] = useState(CALCULATORS[0].id);
  const active = CALCULATORS.find((c) => c.id === activeId)!;
  const [inputs, setInputs] = useState<Record<string, number | boolean | string>>({});
  const [result, setResult] = useState<CalcResult | null>(null);

  const filtered = useMemo(() => {
    const n = q.toLowerCase().trim();
    if (!n) return CALCULATORS;
    return CALCULATORS.filter((c) => c.nameKa.toLowerCase().includes(n) || c.name.toLowerCase().includes(n) || c.purposeKa.toLowerCase().includes(n));
  }, [q]);

  const prefill = () => {
    const next: Record<string, number | boolean | string> = { ...inputs };
    active.fields.forEach((f) => {
      if (f.key === 'age' && patient.age !== null) next.age = patient.age;
      if (f.key === 'weight' && patient.weightKg !== null) next.weight = patient.weightKg;
      if (f.key === 'height' && patient.heightCm !== null) next.height = patient.heightCm;
      if (f.key === 'creat' && patient.creatinineMgDl !== null) next.creat = patient.creatinineMgDl;
      if (f.key === 'female') next.female = patient.sex === 'female';
    });
    setInputs(next);
  };

  const compute = () => {
    const filled: Record<string, number | boolean | string> = {};
    active.fields.forEach((f) => {
      const v = inputs[f.key];
      filled[f.key] = v === undefined ? (f.type === 'boolean' ? false : f.type === 'select' ? (f.options?.[0]?.value ?? '') : 0) : v;
    });
    setResult(active.compute(filled));
  };

  const sources = sourcesByIds(active.sourceIds);

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-2">
        <Panel title="კალკულატორები" subtitle={`${CALCULATORS.length} ვალიდირებული ქულა`}>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input className="field pl-8" placeholder="ძიება…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <ul className="max-h-[520px] space-y-0.5 overflow-y-auto">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(c.id);
                    setInputs({});
                    setResult(null);
                  }}
                  className={cn('w-full rounded-md px-2 py-1.5 text-left text-xs transition', c.id === activeId ? 'bg-cyan/12 text-fg' : 'text-slate-400 hover:bg-ink-850 hover:text-slate-200')}
                >
                  <span className="block truncate">{c.nameKa}</span>
                  <span className="block text-[10px] text-slate-600">{CATEGORY_KA[c.category]}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </aside>

      <div className="min-w-0 space-y-4">
        <Panel
          title={active.nameKa}
          subtitle={active.purposeKa}
          actions={
            <button type="button" className="btn btn-ghost text-xs" onClick={prefill}>
              ქეისიდან შევსება
            </button>
          }
        >
          <div className="mb-3 rounded-lg border border-line bg-ink-950/50 p-2.5">
            <p className="label mb-1">ფორმულა</p>
            <p className="font-mono text-[11px] leading-relaxed text-slate-400">{active.formulaKa}</p>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {active.fields.map((f) => (
              <div key={f.key} className="space-y-1">
                <label htmlFor={`f-${f.key}`} className="label block">
                  {f.labelKa}
                  {f.unit ? ` (${f.unit})` : ''}
                </label>
                {f.type === 'boolean' ? (
                  <label className="flex items-center gap-2 rounded-lg border border-line bg-ink-950/70 px-3 py-2 text-sm text-slate-300">
                    <input id={`f-${f.key}`} type="checkbox" className="h-4 w-4 accent-cyan" checked={Boolean(inputs[f.key])} onChange={(e) => setInputs((p) => ({ ...p, [f.key]: e.target.checked }))} />
                    დიახ
                  </label>
                ) : f.type === 'select' ? (
                  <select id={`f-${f.key}`} className="field" value={String(inputs[f.key] ?? f.options?.[0]?.value ?? '')} onChange={(e) => setInputs((p) => ({ ...p, [f.key]: e.target.value }))}>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.labelKa}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`f-${f.key}`}
                    type="number"
                    className="field"
                    min={f.min}
                    max={f.max}
                    step={f.step ?? 1}
                    value={inputs[f.key] === undefined ? '' : String(inputs[f.key])}
                    onChange={(e) => setInputs((p) => ({ ...p, [f.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
                  />
                )}
              </div>
            ))}
          </div>

          <button type="button" className="btn btn-primary mt-3" onClick={compute}>
            <CalcIcon className="h-4 w-4" /> გამოთვლა
          </button>
        </Panel>

        {result && (
          <Panel
            title="შედეგი"
            actions={<Badge tone={result.severity === 'critical' ? 'critical' : result.severity === 'high' ? 'high' : result.severity === 'moderate' ? 'moderate' : result.severity === 'low' ? 'low' : 'info'}>{result.severity}</Badge>}
          >
            <p className="text-2xl font-semibold tabular-nums text-cyan">
              {result.display} {result.unit && <span className="text-sm text-slate-400">{result.unit}</span>}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">{result.interpretationKa}</p>
            {result.breakdown.length > 0 && (
              <div className="mt-3">
                <p className="label mb-1">კომპონენტები</p>
                <Bullets items={result.breakdown.map((b) => `${b.labelKa}: ${b.points}`)} />
              </div>
            )}
            <div className="mt-3">
              <p className="label mb-1">შენიშვნები</p>
              <Bullets items={result.caveatsKa} />
            </div>
            {sources.length > 0 && (
              <div className="mt-3">
                <p className="label mb-1">წყარო</p>
                <Bullets items={sources.map((s) => s.citation_text)} />
              </div>
            )}
            <div className="mt-3">
              <ExportBar
                filename={`calc-${active.id}`}
                text={`# ${active.nameKa}\n\nფორმულა: ${active.formulaKa}\n\nშედეგი: ${result.display} ${result.unit ?? ''}\n\n${result.interpretationKa}\n\nკომპონენტები:\n${result.breakdown.map((b) => `- ${b.labelKa}: ${b.points}`).join('\n')}\n\nშენიშვნები:\n${result.caveatsKa.map((c) => `- ${c}`).join('\n')}\n\nწყაროები:\n${sources.map((s) => `- ${s.citation_text}`).join('\n')}`}
                json={{ calculator: active.id, inputs, result }}
              onClear={() => { setInputs({}); setResult(null); }} clearLabelKa="შევსების გასუფთავება" />
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
