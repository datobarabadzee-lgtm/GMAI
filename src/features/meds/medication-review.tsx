'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Play } from 'lucide-react';
import { useCase } from '@/features/case/case-store';
import { reviewMedications } from '@/lib/medication-review';
import { sourcesByIds } from '@/knowledge/sources';
import { Badge, Bullets, Collapsible, EmptyState, ExportBar, Panel, Table } from '@/components/ui/primitives';
import { uid } from '@/lib/utils';
import type { Medication } from '@/schemas/clinical';
import { PolypharmacyScreen } from '@/features/meds/polypharmacy-screen';
import { useRole } from '@/features/settings/role-store';
import { audienceOf } from '@/components/layout/nav';

export function MedicationReviewWorkspace() {
  const audience = audienceOf(useRole().role);
  const { patient, update } = useCase();
  const [ran, setRan] = useState(false);

  const review = useMemo(() => reviewMedications(patient), [patient]);
  const sources = sourcesByIds(review.sourceIds);

  const setMed = (i: number, patch: Partial<Medication>) => {
    const next = [...patient.medications];
    next[i] = { ...next[i], ...patch };
    update('medications', next);
  };

  const md = `# მედიკამენტების შეჯერება — ${patient.label}
თირკმლის ფუნქცია (CrCl): ${review.crcl ?? 'ვერ გამოითვალა'}

## მიგნებები
${review.findings.map((f) => `- [${f.severity}] ${f.titleKa}: ${f.detail} → ${f.action}`).join('\n')}

## კუმულაციური ტვირთები
${Object.entries(review.burdens).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## დეპრესკრაიბინგი
${review.deprescribing.map((d) => `- ${d.drug}: ჩვენება — ${d.originalIndication}; კვლავ ინდიცირებული — ${d.stillIndicated}; ტიტრაცია — ${d.taperConcept}; მონიტორინგი — ${d.monitoring}; ხელახლა დაწყების კრიტერიუმი — ${d.restartCriteria}`).join('\n')}

## წყაროები
${sources.map((s) => `- ${s.citation_text}`).join('\n')}

ეს არის კლინიცისტის გადაწყვეტილების მხარდაჭერა და არა ავტონომიური დანიშნულება.`;

  // Patients get the one screen they need; the structured reconciliation
  // below is a clinician's tool and is folded away for everyone else.
  if (audience === 'patient') {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <PolypharmacyScreen simple />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PolypharmacyScreen />

      <Panel
        title="პაციენტის მედიკამენტების სია"
        subtitle={`${patient.medications.length} ჩანაწერი · CrCl: ${review.crcl ?? '—'}`}
        actions={
          <button type="button" className="btn btn-primary text-xs" onClick={() => setRan(true)}>
            <Play className="h-3.5 w-3.5" /> მედიკამენტების ანალიზი
          </button>
        }
      >
        {patient.medications.length === 0 ? (
          <EmptyState
            title="მედიკამენტების სია ცარიელია"
            description="დაამატეთ პრეპარატები ან ჩატვირთეთ დემო ქეისი Case Workspace-იდან."
            action={
              <button type="button" className="btn mt-2 text-xs" onClick={() => update('medications', [{ id: uid(), drug: '', dose: '', frequency: '', route: '', indication: '', startDate: '', status: 'active' }])}>
                <Plus className="h-3.5 w-3.5" /> პრეპარატის დამატება
              </button>
            }
          />
        ) : (
          <div className="space-y-2">
            {/* Phone: one stacked card per medication. Seven columns in a 760px
                table means horizontal scrolling for every field on a 390px screen,
                so small screens get a form-per-drug instead. */}
            <ul className="space-y-2 sm:hidden">
              {patient.medications.map((m, i) => (
                <li key={m.id} className="panel-tight space-y-2 p-2.5">
                  <div className="flex items-start gap-2">
                    <input
                      className="field flex-1 font-medium"
                      placeholder="პრეპარატი"
                      aria-label="პრეპარატი"
                      value={m.drug}
                      onChange={(e) => setMed(i, { drug: e.target.value })}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost shrink-0 px-2"
                      aria-label="წაშლა"
                      onClick={() => update('medications', patient.medications.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="field" placeholder="დოზა" aria-label="დოზა" value={m.dose} onChange={(e) => setMed(i, { dose: e.target.value })} />
                    <input className="field" placeholder="სიხშირე" aria-label="სიხშირე" value={m.frequency} onChange={(e) => setMed(i, { frequency: e.target.value })} />
                    <input className="field col-span-2" placeholder="ჩვენება" aria-label="ჩვენება" value={m.indication} onChange={(e) => setMed(i, { indication: e.target.value })} />
                    <input className="field" placeholder="დაწყება" aria-label="დაწყება" value={m.startDate} onChange={(e) => setMed(i, { startDate: e.target.value })} />
                    <select className="field" aria-label="სტატუსი" value={m.status} onChange={(e) => setMed(i, { status: e.target.value as Medication['status'] })}>
                      <option value="active">აქტიური</option>
                      <option value="stopped">შეწყვეტილი</option>
                      <option value="held">შეჩერებული</option>
                      <option value="unknown">უცნობი</option>
                    </select>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-1 py-1 text-left">პრეპარატი</th>
                    <th className="px-1 py-1 text-left">დოზა</th>
                    <th className="px-1 py-1 text-left">სიხშირე</th>
                    <th className="px-1 py-1 text-left">ჩვენება</th>
                    <th className="px-1 py-1 text-left">დაწყება</th>
                    <th className="px-1 py-1 text-left">სტატუსი</th>
                    <th className="px-1 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {patient.medications.map((m, i) => (
                    <tr key={m.id}>
                      <td className="p-1"><input className="field" value={m.drug} onChange={(e) => setMed(i, { drug: e.target.value })} /></td>
                      <td className="p-1"><input className="field" value={m.dose} onChange={(e) => setMed(i, { dose: e.target.value })} /></td>
                      <td className="p-1"><input className="field" value={m.frequency} onChange={(e) => setMed(i, { frequency: e.target.value })} /></td>
                      <td className="p-1"><input className="field" value={m.indication} onChange={(e) => setMed(i, { indication: e.target.value })} /></td>
                      <td className="p-1"><input className="field" value={m.startDate} onChange={(e) => setMed(i, { startDate: e.target.value })} /></td>
                      <td className="p-1">
                        <select className="field" value={m.status} onChange={(e) => setMed(i, { status: e.target.value as Medication['status'] })}>
                          <option value="active">აქტიური</option>
                          <option value="stopped">შეწყვეტილი</option>
                          <option value="held">შეჩერებული</option>
                          <option value="unknown">უცნობი</option>
                        </select>
                      </td>
                      <td className="p-1">
                        <button type="button" className="btn btn-ghost px-2" aria-label="წაშლა" onClick={() => update('medications', patient.medications.filter((_, j) => j !== i))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn btn-ghost text-xs" onClick={() => update('medications', [...patient.medications, { id: uid(), drug: '', dose: '', frequency: '', route: '', indication: '', startDate: '', status: 'active' }])}>
              <Plus className="h-3.5 w-3.5" /> პრეპარატის დამატება
            </button>
          </div>
        )}
      </Panel>

      {ran && patient.medications.length > 0 && (
        <>
          <Panel title="მიგნებები" subtitle={`${review.findings.length} შედეგი სიმძიმის მიხედვით`} actions={<ExportBar text={md} json={review} filename="medication-review" />}>
            {review.findings.length === 0 ? (
              <p className="text-sm text-slate-300">ავტომატურ შემოწმებაში მიგნება არ გამოვლინდა. ეს არ გამორიცხავს კლინიკურად მნიშვნელოვან პრობლემას.</p>
            ) : (
              <ul className="space-y-2">
                {review.findings.map((f) => (
                  <li key={f.id} className="rounded-lg border border-line bg-ink-850/40 p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={f.severity === 'critical' ? 'critical' : f.severity === 'high' ? 'high' : f.severity === 'moderate' ? 'moderate' : 'low'}>{f.severity}</Badge>
                      <span className="text-sm font-medium text-slate-100">{f.titleKa}</span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{f.detail}</p>
                    {f.action && <p className="mt-1.5 text-sm text-cyan-soft">→ {f.action}</p>}
                    {f.sources.length > 0 && <p className="mt-1 font-mono text-[10px] text-slate-600">{f.sources.join(' · ')}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="კუმულაციური ტვირთები">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {Object.entries(review.burdens).map(([k, v]) => (
                <div key={k} className="panel-tight px-3 py-2">
                  <p className="text-lg font-semibold tabular-nums text-cyan">{v}</p>
                  <p className="text-[10px] leading-tight text-slate-400">{k}</p>
                </div>
              ))}
            </div>
          </Panel>

          {review.deprescribing.length > 0 && (
            <Panel title="დეპრესკრაიბინგი" subtitle="ყველა ცვლილება საჭიროებს კლინიცისტის გადაწყვეტილებას">
              <Table
                headers={['პრეპარატი', 'ორიგინალური ჩვენება', 'კვლავ ინდიცირებული?', 'მიმდინარე რისკი', 'მოხსნის რისკი', 'ტიტრაცია', 'მონიტორინგი', 'ხელახლა დაწყება']}
                rows={review.deprescribing.map((d) => [
                  d.drug,
                  d.originalIndication,
                  <Badge key="s" tone={d.stillIndicated === 'likely_no' ? 'high' : 'moderate'}>
                    {d.stillIndicated === 'yes' ? 'დიახ' : d.stillIndicated === 'unclear' ? 'გაურკვეველი' : 'სავარაუდოდ არა'}
                  </Badge>,
                  d.currentRisk,
                  d.withdrawalRisk,
                  d.taperNeeded ? d.taperConcept : 'არ ესაჭიროება',
                  d.monitoring,
                  d.restartCriteria,
                ])}
              />
            </Panel>
          )}

          {review.unresolved.length > 0 && (
            <Collapsible title="რეესტრში ვერ მოიძებნა" tone="warning">
              <Bullets items={review.unresolved} />
              <p className="mt-2 text-xs text-slate-500">ეს პრეპარატები ავტომატურ შემოწმებაში არ მონაწილეობდნენ — შესაბამისად მათზე ურთიერთქმედება და დოზირება არ არის შემოწმებული.</p>
            </Collapsible>
          )}
        </>
      )}
    </div>
  );
}
