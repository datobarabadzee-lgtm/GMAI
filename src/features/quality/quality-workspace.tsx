'use client';

import { useState } from 'react';
import { ShieldCheck, Play } from 'lucide-react';
import { useCase } from '@/features/case/case-store';
import { useRole } from '@/features/settings/role-store';
import { DEFECT_CLASSES, CAUSE_CATEGORIES, ASSESSMENT_QUESTIONS, NEUTRAL_LANGUAGE } from '@/knowledge/defect-classifier';
import { Badge, Bullets, Collapsible, EmptyState, ErrorState, ExportBar, Panel, Skeleton, Table } from '@/components/ui/primitives';
import type { OrchestrateResult } from '@/features/clinical/answer-view';
import { cn } from '@/lib/utils';

type DefectRow = {
  id: string;
  classKa: string;
  expectedStandard: string;
  deviation: string;
  documentationIssue: string;
  severity: string;
  confidence: string;
  correctiveAction: string;
  preventiveAction: string;
  subcategories: string[];
};

export function QualityWorkspace() {
  const { patient, update } = useCase();
  const { authHeaders } = useRole();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrchestrateResult | null>(null);
  const [selectedClass, setSelectedClass] = useState(DEFECT_CLASSES[0].code);

  const run = async () => {
    if (!patient.narrative.trim() && !patient.timeline.length) {
      setError('ხარისხის მიმოხილვისთვის საჭიროა ქეისის აღწერა ან მოვლენების ქრონოლოგია.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ question: 'ჩაატარე ამ ქეისის ხარისხის მიმოხილვა და პოტენციური დეფექტების სკრინინგი.', mode: 'quality', patient, extras: { caseNarrative: patient.narrative } }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.messageKa ?? 'აუდიტი ვერ დასრულდა.');
        return;
      }
      setResult(json as OrchestrateResult);
    } catch {
      setError('სერვერთან კავშირი ვერ დამყარდა.');
    } finally {
      setLoading(false);
    }
  };

  const a13 = result?.agentResults.find((a) => a.agentId === 'A13');
  const defects = (a13?.data?.defects as DefectRow[] | undefined) ?? [];
  const cls = DEFECT_CLASSES.find((c) => c.code === selectedClass)!;

  const md = defects.length
    ? `# ხარისხის მიმოხილვა — ${patient.label}\n\n${defects
        .map(
          (d) =>
            `## ${d.classKa}\n- მოსალოდნელი სტანდარტი: ${d.expectedStandard}\n- პოტენციური გადახვევა: ${d.deviation}\n- დოკუმენტაციის საკითხი: ${d.documentationIssue}\n- სიმძიმე: ${d.severity} · ნდობა: ${d.confidence}\n- მაკორექტირებელი ქმედება: ${d.correctiveAction}\n- პრევენციული ქმედება: ${d.preventiveAction}`,
        )
        .join('\n\n')}\n\n_ყველა დასკვნა საჭიროებს ექსპერტულ მიმოხილვას. სისტემა ბრალეულობას არ ადგენს._`
    : '';

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Panel title="ქეისის მასალა" subtitle="სამედიცინო ჩანაწერი → მოსალოდნელი სტანდარტი → ფაქტობრივი დახმარება → გადახვევა" actions={<button type="button" className="btn btn-primary text-xs" onClick={() => void run()} disabled={loading}><Play className="h-3.5 w-3.5" /> აუდიტის გაშვება</button>}>
        <textarea className="field min-h-[130px] resize-y" value={patient.narrative} onChange={(e) => update('narrative', e.target.value)} placeholder="აღწერეთ ქეისი: რა მოხდა, რა ჩატარდა, რა დაფიქსირდა ჩანაწერში…" />
        <p className="mt-2 text-[11px] text-slate-500">ქრონოლოგია შეავსეთ Case Workspace-ის „ქრონოლოგია“ ჩანართში — ეს აუმჯობესებს აუდიტის სიზუსტეს.</p>
      </Panel>

      {loading && <Panel><Skeleton lines={6} /></Panel>}
      {error && !loading && <ErrorState title="აუდიტი ვერ დასრულდა" detail={error} />}

      {!loading && result && (
        <>
          <Panel title="ქეისის ავტომატური აუდიტი" subtitle="7-ფაზიანი პროცესი" actions={<ExportBar text={md || result.answer.bottomLine} json={result} filename="quality-audit" onClear={() => { setResult(null); setError(null); }} />}>
            <div className="space-y-2">
              {a13?.sections.map((s) => (
                <Collapsible key={s.titleEn} title={s.titleKa} defaultOpen={s.titleEn.startsWith('1') || s.titleEn.startsWith('3')}>
                  {s.body && <p className="mb-2 text-sm leading-relaxed text-slate-300">{s.body}</p>}
                  <Bullets items={s.bullets} />
                </Collapsible>
              ))}
            </div>
          </Panel>

          {defects.length > 0 && (
            <Panel title="პოტენციური დეფექტები" subtitle="ტერმინოლოგია ნეიტრალურია — ბრალეულობა არ დგინდება">
              <Table
                headers={['კლასი', 'მოსალოდნელი სტანდარტი', 'პოტენციური გადახვევა', 'დოკუმენტაცია', 'სიმძიმე', 'ნდობა', 'CAPA']}
                rows={defects.map((d) => [
                  d.classKa,
                  d.expectedStandard,
                  d.deviation,
                  d.documentationIssue,
                  <Badge key="s" tone={d.severity === 'high' ? 'high' : 'moderate'}>{d.severity}</Badge>,
                  <Badge key="c">{d.confidence}</Badge>,
                  `${d.correctiveAction} | ${d.preventiveAction}`,
                ])}
              />
              <p className="mt-3 text-xs text-slate-500">ყოველი ჩანაწერი მონიშნულია როგორც „ადამიანური მიმოხილვა სავალდებულოა“.</p>
            </Panel>
          )}
        </>
      )}

      {!loading && !result && !error && (
        <EmptyState title="ხარისხის მიმოხილვა" description="სისტემა ადგენს მოვლენების ქრონოლოგიას, ადარებს მას მოსალოდნელ სტანდარტს და აფიქსირებს პოტენციურ გადახვევებს ავტორის დეფექტების კლასიფიკატორის მიხედვით." />
      )}

      <Panel title="დეფექტების კლასიფიკატორი" subtitle="„სამედიცინო დახმარების ხარისხის კრიტერიუმები და დეფექტების კლასიფიკაცია“ — 10 კლასი">
        <div className="flex flex-wrap gap-1.5">
          {DEFECT_CLASSES.map((c) => (
            <button key={c.code} type="button" onClick={() => setSelectedClass(c.code)} className={cn('rounded-full border px-3 py-1 text-xs transition', c.code === selectedClass ? 'border-cyan/50 bg-cyan/15 text-fg' : 'border-line text-slate-400 hover:text-slate-200')}>
              {c.roman}. {c.nameKa}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div>
            <p className="label mb-1">განმარტება</p>
            <p className="text-sm leading-relaxed text-slate-300">{cls.definitionKa}</p>
            <p className="label mb-1 mt-3">განმასხვავებელი ნიშნები</p>
            <Bullets items={cls.distinguishingFeatures} />
            <p className="label mb-1 mt-3">პოტენციური შედეგები</p>
            <Bullets items={cls.potentialConsequences} />
          </div>
          <div>
            <p className="label mb-1">შეფასების კრიტერიუმები</p>
            <Bullets items={cls.assessmentCriteria} />
            <p className="label mb-1 mt-3">კონტროლის მექანიზმი</p>
            <Bullets items={cls.controlMechanism} />
            <p className="label mb-1 mt-3">პასუხისმგებელი</p>
            <Bullets items={cls.responsible} />
          </div>
        </div>
        <div className="mt-4">
          <p className="label mb-1">ქვეკატეგორიები</p>
          <Table headers={['ქვეკატეგორია', 'განმარტება', 'მაგალითი']} rows={cls.subcategories.map((s) => [s.nameKa, s.definitionKa, s.exampleKa])} />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="დეფექტის მიზეზების ტიპოლოგია" subtitle="RCA-ს საფუძველი">
          <div className="space-y-2">
            {CAUSE_CATEGORIES.map((c) => (
              <Collapsible key={c.id} title={c.nameKa} defaultOpen={false}>
                <p className="mb-2 text-sm leading-relaxed text-slate-300">{c.definitionKa}</p>
                <Bullets items={c.forms} />
              </Collapsible>
            ))}
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel title="შეფასების სტრუქტურული კითხვები">
            <Bullets items={ASSESSMENT_QUESTIONS} />
          </Panel>
          <Panel title="ტერმინოლოგიის წესი" actions={<ShieldCheck className="h-4 w-4 text-cyan" />}>
            <p className="label mb-1">დასაშვები ფორმულირებები</p>
            <Bullets items={NEUTRAL_LANGUAGE.allowed} />
            <p className="label mb-1 mt-3">აკრძალული ფორმულირებები</p>
            <ul className="space-y-1.5">
              {NEUTRAL_LANGUAGE.forbidden.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-clinical-critical">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-clinical-critical" />
                  <span className="line-through opacity-80">{f}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
