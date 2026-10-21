'use client';

import { useState } from 'react';
import { Gavel, Play } from 'lucide-react';
import { useCase } from '@/features/case/case-store';
import { useRole } from '@/features/settings/role-store';
import { DEFECT_MODE_KA, type DefectReviewMode } from '@/schemas/quality';
import { DEFECT_CLASSES } from '@/knowledge/defect-classifier';
import { Badge, Bullets, Collapsible, EmptyState, ErrorState, ExportBar, Panel, Skeleton } from '@/components/ui/primitives';
import { CorpusAudit } from '@/features/quality/corpus-audit';
import type { OrchestrateResult } from '@/features/clinical/answer-view';
import { cn } from '@/lib/utils';
import { AttestationBox } from '@/features/settings/attestation-box';

const MODES: DefectReviewMode[] = ['patient', 'clinician', 'clinic_defense', 'regulator'];

const MODE_NOTE: Record<DefectReviewMode, string> = {
  patient: 'ანალიზი აღწერს, რა მოხდა და რა უნდა მომხდარიყო არსებული სტანდარტით. იგი არ არის იურიდიული დასკვნა და არ ადგენს ბრალეულობას.',
  clinician: 'ანალიზი აჩვენებს, რომელი გადაწყვეტილება იყო დოკუმენტურად დასაბუთებული და სად არის არგუმენტაციის ხარვეზი.',
  clinic_defense: 'ანალიზი გამოკვეთს, რა ადასტურებს სტანდარტის დაცვას და რომელი ჩანაწერი საჭიროებს გაძლიერებას.',
  regulator: 'ანალიზი სტრუქტურირებს ფაქტებს, სტანდარტს, გადახვევას და მტკიცებულებას ინსპექტირების ჩარჩოსთვის.',
};

export function DefectWorkspace() {
  const { patient, update } = useCase();
  const { authHeaders } = useRole();
  const [mode, setMode] = useState<DefectReviewMode>('clinician');
  const [claim, setClaim] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrchestrateResult | null>(null);

  const run = async () => {
    if (!patient.narrative.trim()) {
      setError('ანალიზისთვის საჭიროა ქეისის ფაქტობრივი აღწერა.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          question: claim || 'ჩაატარე ამ ქეისის ნეიტრალური მედიკო-ლეგალური ანალიზი.',
          mode: 'quality',
          patient,
          reviewMode: mode,
          extras: { claim, caseNarrative: patient.narrative },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.messageKa ?? 'ანალიზი ვერ დასრულდა.');
        return;
      }
      setResult(json as OrchestrateResult);
    } catch {
      setError('სერვერთან კავშირი ვერ დამყარდა.');
    } finally {
      setLoading(false);
    }
  };

  const a14 = result?.agentResults.find((a) => a.agentId === 'A14');

  const md = a14
    ? `# მედიკო-ლეგალური ანალიზი — ${DEFECT_MODE_KA[mode]}\n\n${a14.sections.map((s) => `## ${s.titleKa}\n${s.body}\n${s.bullets.map((b) => `- ${b}`).join('\n')}`).join('\n\n')}\n\n_სისტემა მხარეს არ ირჩევს და ბრალეულობას არ ადგენს._`
    : '';

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Panel title="მიმოხილვის რეჟიმი" subtitle="სისტემა ერთნაირად ნეიტრალურია ოთხივე რეჟიმში">
        <div className="flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={cn('rounded-full border px-3 py-1 text-xs transition', m === mode ? 'border-cyan/50 bg-cyan/15 text-fg' : 'border-line text-slate-400 hover:text-slate-200')}>
              {DEFECT_MODE_KA[m]}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{MODE_NOTE[mode]}</p>
      </Panel>

      <Panel title="პრეტენზია / კითხვა" subtitle="არასავალდებულო — ანალიზი ტარდება ფაქტების საფუძველზეც">
        <textarea className="field min-h-[80px] resize-y" value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="მაგ.: დაგვიანდა თუ არა დიაგნოზი და იყო თუ არა გაწერა დასაბუთებული?" />
      </Panel>

      <Panel
        title="ქეისის ფაქტობრივი აღწერა"
        subtitle="დოკუმენტირებული ფაქტები — არა ინტერპრეტაცია"
        actions={
          <button type="button" className="btn btn-primary text-xs" onClick={() => void run()} disabled={loading}>
            <Play className="h-3.5 w-3.5" /> ანალიზის გაშვება
          </button>
        }
      >
        <textarea className="field min-h-[140px] resize-y" value={patient.narrative} onChange={(e) => update('narrative', e.target.value)} placeholder="აღწერეთ მოვლენები ქრონოლოგიურად, ჩანაწერების შინაარსის მითითებით…" />
        <div className="mt-2">
          <AttestationBox needed={Boolean(patient.narrative.trim())} />
        </div>
      </Panel>

      {loading && (
        <Panel>
          <Skeleton lines={6} />
        </Panel>
      )}
      {error && !loading && <ErrorState title="ანალიზი ვერ დასრულდა" detail={error} />}

      {!loading && a14 && (
        <Panel
          title="სტრუქტურირებული ანალიზი"
          subtitle={a14.summary}
          actions={
            <div className="flex items-center gap-1.5">
              <Badge tone="moderate">
                <Gavel className="h-3 w-3" /> ექსპერტული მიმოხილვა სავალდებულოა
              </Badge>
              <ExportBar text={md} json={result} filename={`defect-${mode}`} onClear={() => { setResult(null); setError(null); setClaim(''); }} />
            </div>
          }
        >
          <div className="space-y-2">
            {a14.sections.map((s) => (
              <Collapsible key={s.titleEn} title={s.titleKa} defaultOpen>
                {s.body && <p className="mb-2 text-sm leading-relaxed text-slate-300">{s.body}</p>}
                <Bullets items={s.bullets} />
              </Collapsible>
            ))}
          </div>
        </Panel>
      )}

      {!loading && !result && !error && (
        <EmptyState
          title="მედიკო-ლეგალური ანალიზი"
          description={'მთავარი პრინციპი: კითხვა „ვისი აზრია სწორი?“ არ არის საკმარისი. სისტემა პასუხობს — რა მოხდა, რა უნდა მომხდარიყო არსებული სტანდარტით, რა მტკიცებულება არსებობს და რამდენად დასაბუთებულია გადახვევა.'}
        />
      )}

      <CorpusAudit narrative={patient.narrative} />

      <Panel title="კლასიფიკატორის ჩარჩო" subtitle="10 კლასი — ავტორის სახელმძღვანელოს ტაქსონომია">
        <div className="grid gap-2 sm:grid-cols-2">
          {DEFECT_CLASSES.map((c) => (
            <div key={c.code} className="rounded-lg border border-line bg-ink-850/40 p-3">
              <p className="text-[13px] font-medium text-slate-100">
                <span className="mr-2 font-mono text-cyan">{c.roman}</span>
                {c.nameKa}
              </p>
              <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-slate-500">{c.definitionKa}</p>
            </div>
          ))}
        </div>
      </Panel>

    </div>
  );
}
