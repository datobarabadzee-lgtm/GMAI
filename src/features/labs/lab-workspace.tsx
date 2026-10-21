'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Upload, Play } from 'lucide-react';
import { useCase } from '@/features/case/case-store';
import { interpretLabs, parseLabText, type LabAnalysis } from '@/lib/labs';
import { Badge, Bullets, EmptyState, ErrorState, ExportBar, Panel, Table } from '@/components/ui/primitives';
import { uid } from '@/lib/utils';
import type { LabValue } from '@/schemas/clinical';
import { UPLOAD_HINT_KA, uploadForParsing } from '@/lib/upload-client';

function Sparkline({ points }: { points: { date: string; value: number }[] }) {
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 180;
  const h = 36;
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i / (points.length - 1)) * w} ${h - ((p.value - min) / range) * (h - 6) - 3}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="დინამიკის გრაფიკი" className="overflow-visible">
      <path d={d} fill="none" stroke="#3fd0d4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={(i / (points.length - 1)) * w} cy={h - ((p.value - min) / range) * (h - 6) - 3} r="2" fill="#3fd0d4" />
      ))}
    </svg>
  );
}

export function LabWorkspace() {
  const { patient, update } = useCase();
  const [paste, setPaste] = useState('');
  const [ran, setRan] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  const analysis: LabAnalysis = useMemo(() => interpretLabs(patient.labs, patient), [patient]);

  const setLab = (i: number, patch: Partial<LabValue>) => {
    const next = [...patient.labs];
    next[i] = { ...next[i], ...patch };
    update('labs', next);
  };

  const importPasted = () => {
    const parsed = parseLabText(paste);
    if (!parsed.length) {
      setParseError('ტექსტიდან ლაბორატორიული მნიშვნელობები ვერ ამოიკითხა. საჭიროა მინიმუმ ორი სვეტი: მაჩვენებელი და რიცხვითი მნიშვნელობა.');
      return;
    }
    setParseError(null);
    update('labs', [...patient.labs, ...parsed]);
    setPaste('');
  };

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadNote(null);
    try {
      const out = await uploadForParsing(files);
      if (!out.ok) {
        setUploadNote(out.messageKa);
        return;
      }
      const texts: string[] = out.results.flatMap((r) => (r.ok ? [r.text] : []));
      const failed = out.results.flatMap((r) => (r.ok ? [] : [r]));
      const parsed = texts.flatMap((t) => parseLabText(t));
      if (parsed.length) update('labs', [...patient.labs, ...parsed]);
      setUploadNote(
        [parsed.length ? `იმპორტირდა ${parsed.length} მაჩვენებელი.` : 'ფაილიდან სტრუქტურირებული მნიშვნელობები ვერ ამოიკითხა.', ...failed.map((f: { name: string; messageKa: string }) => `${f.name}: ${f.messageKa}`)].join(' '),
      );
    } catch {
      setUploadNote('ფაილის დამუშავება ვერ მოხერხდა.');
    }
  };

  const md = `# ლაბორატორიული ინტერპრეტაცია — ${patient.label}

## პათოლოგიური მნიშვნელობები
${analysis.abnormal.map((r) => `- ${r.labelKa}: ${r.value} ${r.unit} (რეფ. ${r.refText}) — ${r.noteKa}`).join('\n') || '- არ არის'}

## პატერნები
${analysis.patterns.map((p) => `- [${p.severity}] ${p.titleKa}: ${p.detailKa}`).join('\n') || '- არ არის'}

## დინამიკა
${analysis.trends.map((t) => `- ${t.labelKa}: ${t.direction} (${t.deltaPct}%)`).join('\n') || '- ერთჯერადი გაზომვები'}

## წამლისმიერი ცვლილებები
${analysis.medicationRelated.map((m) => `- ${m.titleKa}: ${m.detailKa}`).join('\n') || '- არ გამოვლინდა'}

## გადაუდებელი ყურადღება
${analysis.urgent.map((u) => `- ${u}`).join('\n') || '- არ არის'}`;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Panel title="მონაცემების შეყვანა" subtitle="ხელით, ცხრილის ჩასმით, CSV-ით ან ფაილიდან">
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <p className="label mb-1.5">ცხრილის ჩასმა / CSV</p>
            <textarea className="field min-h-[120px] resize-y font-mono text-xs" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Sodium; 128; მმოლ/ლ; 2026-09-09\nPotassium; 3.1; მმოლ/ლ; 2026-09-09'} />
            <button type="button" className="btn mt-2 text-xs" onClick={importPasted} disabled={!paste.trim()}>
              იმპორტი
            </button>
          </div>
          <div>
            <p className="label mb-1.5">ფაილის ატვირთვა</p>
            <label className="flex h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-ink-850/40 text-center transition hover:border-cyan/40">
              <Upload className="h-5 w-5 text-slate-500" />
              <span className="text-xs text-slate-400">PDF · DOCX · TXT · CSV — {UPLOAD_HINT_KA}</span>
              <input type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={(e) => void onUpload(e.target.files)} />
            </label>
            {uploadNote && <p className="mt-2 text-xs text-slate-400">{uploadNote}</p>}
          </div>
        </div>
        {parseError && <div className="mt-3"><ErrorState title="ვერ წაიკითხა" detail={parseError} /></div>}
      </Panel>

      <Panel
        title="მაჩვენებლები"
        subtitle={`${patient.labs.length} ჩანაწერი`}
        actions={
          <button type="button" className="btn btn-primary text-xs" onClick={() => setRan(true)} disabled={!patient.labs.length}>
            <Play className="h-3.5 w-3.5" /> ინტერპრეტაცია
          </button>
        }
      >
        {patient.labs.length === 0 ? (
          <EmptyState title="ლაბორატორიული მონაცემები არ არის" description="დაამატეთ მაჩვენებლები ხელით ან ჩასვით ცხრილი ზემოთ." />
        ) : (
          <div className="space-y-2">
            {patient.labs.map((l, i) => (
              <div key={l.id} className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                <input className="field sm:col-span-2" placeholder="მაჩვენებელი" value={l.analyte} onChange={(e) => setLab(i, { analyte: e.target.value })} />
                <input className="field" type="number" step="0.01" placeholder="მნიშვნელობა" value={l.value} onChange={(e) => setLab(i, { value: Number(e.target.value) })} />
                <input className="field" placeholder="ერთეული" value={l.unit} onChange={(e) => setLab(i, { unit: e.target.value })} />
                <div className="flex gap-1.5">
                  <input className="field" placeholder="თარიღი" value={l.date} onChange={(e) => setLab(i, { date: e.target.value })} />
                  <button type="button" className="btn btn-ghost px-2" aria-label="წაშლა" onClick={() => update('labs', patient.labs.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-ghost text-xs" onClick={() => update('labs', [...patient.labs, { id: uid(), analyte: '', value: 0, unit: '', date: '' }])}>
              <Plus className="h-3.5 w-3.5" /> მაჩვენებლის დამატება
            </button>
          </div>
        )}
      </Panel>

      {ran && patient.labs.length > 0 && (
        <>
          {analysis.urgent.length > 0 && (
            <Panel title="გადაუდებელი ყურადღება" className="border-clinical-critical/50">
              <Bullets items={analysis.urgent} />
            </Panel>
          )}

          <Panel title="ინტერპრეტაცია" actions={<ExportBar text={md} json={analysis} filename="lab-analysis" onClear={() => { setParseError(null); setUploadNote(null); update('labs', []); }} />}>
            <Table
              headers={['მაჩვენებელი', 'მნიშვნელობა', 'რეფერენსი', 'სტატუსი', 'შენიშვნა']}
              rows={analysis.results.map((r) => [
                r.labelKa,
                `${r.value} ${r.unit}`,
                r.refText,
                <Badge key="s" tone={r.status === 'critical_high' || r.status === 'critical_low' ? 'critical' : r.status === 'high' || r.status === 'low' ? 'moderate' : r.status === 'normal' ? 'low' : 'neutral'}>
                  {r.status}
                </Badge>,
                r.noteKa,
              ])}
            />
          </Panel>

          {analysis.patterns.length > 0 && (
            <Panel title="პატერნები">
              <ul className="space-y-2">
                {analysis.patterns.map((p, i) => (
                  <li key={i} className="rounded-lg border border-line bg-ink-850/40 p-3">
                    <Badge tone={p.severity === 'critical' ? 'critical' : p.severity === 'high' ? 'high' : 'moderate'}>{p.severity}</Badge>
                    <p className="mt-1.5 text-sm font-medium text-slate-100">{p.titleKa}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-300">{p.detailKa}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {analysis.trends.length > 0 && (
            <Panel title="დინამიკა">
              <div className="grid gap-3 sm:grid-cols-2">
                {analysis.trends.map((t) => (
                  <div key={t.analyte} className="rounded-lg border border-line bg-ink-850/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-slate-200">{t.labelKa}</span>
                      <Badge tone={t.direction === 'stable' ? 'low' : 'moderate'}>
                        {t.direction === 'rising' ? 'ზრდადი' : t.direction === 'falling' ? 'კლებადი' : 'სტაბილური'} {t.deltaPct > 0 ? '+' : ''}
                        {t.deltaPct}%
                      </Badge>
                    </div>
                    <div className="mt-2">
                      <Sparkline points={t.points} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {analysis.medicationRelated.length > 0 && (
            <Panel title="წამლისმიერი ცვლილებები">
              <Bullets items={analysis.medicationRelated.map((m) => `${m.titleKa} — ${m.detailKa}`)} />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
