'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Upload, Sparkles, SearchCheck, ShieldQuestion, ClipboardList, BookOpenCheck, FileText, RotateCcw } from 'lucide-react';
import { useCase } from './case-store';
import { ClinicalContextPanel } from './context-panel';
import { DEMO_CASES } from '@/knowledge/demo-cases';
import { useRole } from '@/features/settings/role-store';
import { reviewMedications } from '@/lib/medication-review';
import { interpretLabs } from '@/lib/labs';
import { AnswerView, type OrchestrateResult } from '@/features/clinical/answer-view';
import { Badge, Bullets, EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/primitives';
import { cn, uid } from '@/lib/utils';
import type { ClinicalMode, TimelineEvent } from '@/schemas/clinical';
import { UPLOAD_HINT_KA, uploadForParsing } from '@/lib/upload-client';

type Tab = 'timeline' | 'problems' | 'medications' | 'labs' | 'documents' | 'ai' | 'quality';

const TABS: { id: Tab; labelKa: string }[] = [
  { id: 'timeline', labelKa: 'ქრონოლოგია' },
  { id: 'problems', labelKa: 'პრობლემები' },
  { id: 'medications', labelKa: 'მედიკამენტები' },
  { id: 'labs', labelKa: 'ლაბორატორია' },
  { id: 'documents', labelKa: 'დოკუმენტები' },
  { id: 'ai', labelKa: 'AI ანალიზი' },
  { id: 'quality', labelKa: 'ხარისხის მიმოხილვა' },
];

export function CaseWorkspace() {
  const params = useSearchParams();
  const { patient, setPatient, update, reset } = useCase();
  const { authHeaders } = useRole();
  const [tab, setTab] = useState<Tab>('timeline');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrchestrateResult | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const demo = params.get('demo');
    if (demo) {
      const d = DEMO_CASES.find((x) => x.id === demo);
      if (d) setPatient(d.patient);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const med = reviewMedications(patient);
  const labs = interpretLabs(patient.labs, patient);

  const run = async (mode: ClinicalMode, question: string) => {
    setLoading(true);
    setError(null);
    setTab(mode === 'quality' ? 'quality' : 'ai');
    try {
      const res = await fetch('/api/orchestrate', { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify({ question, mode, patient, extras: { caseNarrative: patient.narrative } }) });
      const json = await res.json();
      if (!res.ok) {
        setError(json.messageKa ?? 'ანალიზი ვერ დასრულდა.');
        setResult(null);
        return;
      }
      setResult(json as OrchestrateResult);
    } catch {
      setError('სერვერთან კავშირი ვერ დამყარდა.');
    } finally {
      setLoading(false);
    }
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
      const json = out;
      const okFiles = json.results.flatMap((r) => (r.ok ? [r] : []));
      const failed = json.results.flatMap((r) => (r.ok ? [] : [r]));
      if (okFiles.length) {
        update('documents', [...patient.documents, ...okFiles.map((r: { name: string; text: string }) => ({ id: uid(), name: r.name, text: r.text }))]);
      }
      setUploadNote([okFiles.length ? `დამუშავდა ${okFiles.length} ფაილი (სერვერზე არ შენახულა).` : '', ...failed.map((f: { name: string; messageKa: string }) => `${f.name}: ${f.messageKa}`)].filter(Boolean).join(' '));
    } catch {
      setUploadNote('ფაილის დამუშავება ვერ მოხერხდა.');
    }
  };

  const setEvent = (i: number, patch: Partial<TimelineEvent>) => {
    const next = [...patient.timeline];
    next[i] = { ...next[i], ...patch };
    update('timeline', next);
  };

  const actions = [
    { labelKa: 'ქეისის ანალიზი', icon: Sparkles, run: () => run('deep', 'ჩაატარე ამ ქეისის სრული კლინიკური ანალიზი.') },
    { labelKa: 'რას ვტოვებ გამოტოვებულს?', icon: SearchCheck, run: () => run('missing', 'რა მაკლია ამ ქეისში?') },
    { labelKa: 'გეგმის შემოწმება', icon: ShieldQuestion, run: () => run('challenge', 'შეამოწმე ჩემი კლინიკური გეგმა ამ ქეისში.') },
    { labelKa: 'მედიკამენტების მიმოხილვა', icon: ClipboardList, run: () => run('deep', 'ჩაატარე მედიკამენტების შეჯერება და დეპრესკრაიბინგის შეფასება.') },
    { labelKa: 'მტკიცებულება', icon: BookOpenCheck, run: () => run('evidence', 'რა მტკიცებულება არსებობს ამ ქეისისთვის?') },
    { labelKa: 'ხარისხის მიმოხილვა', icon: FileText, run: () => run('quality', 'ჩაატარე ამ ქეისის ხარისხის მიმოხილვა და დეფექტების სკრინინგი.') },
  ];

  return (
    <div className="mx-auto grid max-w-[1500px] gap-4 lg:grid-cols-[270px_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,1fr)_320px]">
      <aside className="space-y-3">
        <Panel title="პაციენტის მოკლე პროფილი" subtitle={patient.label} actions={<button type="button" className="btn btn-ghost px-2 text-xs" onClick={reset} aria-label="ქეისის გასუფთავება"><RotateCcw className="h-3.5 w-3.5" /></button>}>
          <dl className="space-y-1.5 text-xs">
            {[
              ['ასაკი', patient.age !== null ? `${patient.age} წ.` : '—'],
              ['სქესი', patient.sex === 'male' ? 'მამრობითი' : patient.sex === 'female' ? 'მდედრობითი' : '—'],
              ['ორსულობა', patient.pregnant === 'yes' ? 'დიახ' : patient.pregnant === 'no' ? 'არა' : patient.pregnant === 'unknown' ? 'უცნობი' : '—'],
              ['წონა', patient.weightKg ? `${patient.weightKg} კგ` : '—'],
              ['CrCl', med.crcl !== null ? `${med.crcl} მლ/წთ` : '—'],
              ['ალერგიები', patient.allergies.join(', ') || '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right text-slate-200">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
            {[
              ['პრობლემა', patient.problems.length],
              ['წამალი', patient.medications.length],
              ['ანალიზი', patient.labs.length],
            ].map(([k, v]) => (
              <div key={String(k)} className="panel-tight px-1.5 py-1.5">
                <p className="text-sm font-semibold tabular-nums text-cyan">{v}</p>
                <p className="text-[10px] text-slate-500">{k}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="დემო ქეისები">
          <ul className="space-y-1">
            {DEMO_CASES.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => setPatient(d.patient)} className="w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-400 transition hover:bg-ink-850 hover:text-slate-100">
                  {d.titleKa}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </aside>

      <div className="min-w-0 space-y-4">
        <Panel>
          <div className="flex flex-wrap gap-1.5">
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <button key={a.labelKa} type="button" className="btn text-xs" onClick={() => void a.run()} disabled={loading}>
                  <Icon className="h-3.5 w-3.5" /> {a.labelKa}
                </button>
              );
            })}
            <Link href="/documents" className="btn text-xs">
              <FileText className="h-3.5 w-3.5" /> დოკუმენტის შექმნა
            </Link>
          </div>
        </Panel>

        <Panel>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} className={cn('rounded-full border px-3 py-1 text-xs transition', tab === t.id ? 'border-cyan/50 bg-cyan/15 text-fg' : 'border-line text-slate-400 hover:text-slate-200')}>
                {t.labelKa}
              </button>
            ))}
          </div>

          {tab === 'timeline' && (
            <div className="space-y-2">
              {patient.timeline.length === 0 ? (
                <EmptyState title="ქრონოლოგია ცარიელია" description="მოვლენების ქრონოლოგია საჭიროა დროზე დამოკიდებული გადაწყვეტილებების და ხარისხის აუდიტისთვის." />
              ) : (
                patient.timeline.map((e, i) => (
                  <div key={e.id} className="grid grid-cols-1 gap-1.5 rounded-lg border border-line bg-ink-850/40 p-2.5 lg:grid-cols-[minmax(110px,130px)_minmax(110px,130px)_minmax(0,1fr)_auto]">
                    <input className="field" placeholder="თარიღი" value={e.date} onChange={(ev) => setEvent(i, { date: ev.target.value })} />
                    <select className="field" value={e.category} onChange={(ev) => setEvent(i, { category: ev.target.value as TimelineEvent['category'] })}>
                      <option value="encounter">ვიზიტი</option>
                      <option value="symptom">სიმპტომი</option>
                      <option value="investigation">კვლევა</option>
                      <option value="treatment">მკურნალობა</option>
                      <option value="procedure">პროცედურა</option>
                      <option value="document">დოკუმენტი</option>
                      <option value="other">სხვა</option>
                    </select>
                    <div className="space-y-1.5">
                      <input className="field" placeholder="სათაური" value={e.title} onChange={(ev) => setEvent(i, { title: ev.target.value })} />
                      <input className="field" placeholder="დეტალი" value={e.detail} onChange={(ev) => setEvent(i, { detail: ev.target.value })} />
                    </div>
                    <button type="button" className="btn btn-ghost px-2" aria-label="წაშლა" onClick={() => update('timeline', patient.timeline.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
              <button type="button" className="btn btn-ghost text-xs" onClick={() => update('timeline', [...patient.timeline, { id: uid(), date: '', category: 'other', title: '', detail: '' }])}>
                <Plus className="h-3.5 w-3.5" /> მოვლენის დამატება
              </button>
            </div>
          )}

          {tab === 'problems' && (
            <div className="space-y-2">
              <Bullets items={patient.problems} />
              {patient.narrative && (
                <div className="mt-3 rounded-lg border border-line bg-ink-850/40 p-3">
                  <p className="label mb-1">კლინიკური აღწერა</p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{patient.narrative}</p>
                </div>
              )}
            </div>
          )}

          {tab === 'medications' && (
            <div className="space-y-2">
              {patient.medications.length === 0 ? (
                <EmptyState title="მედიკამენტები არ არის" description="დაამატეთ პრეპარატები მარჯვენა პანელში ან Medication Review გვერდზე." />
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {patient.medications.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-ink-850/40 px-3 py-2 text-sm text-slate-300">
                        <span className="font-medium text-slate-100">{m.drug || '—'}</span>
                        <span className="text-slate-500">{m.dose}</span>
                        <span className="text-slate-500">{m.frequency}</span>
                        <Badge className="ml-auto">{m.indication || 'ჩვენება არ არის'}</Badge>
                      </li>
                    ))}
                  </ul>
                  {med.findings.length > 0 && (
                    <div className="mt-3">
                      <p className="label mb-1">ავტომატური მიგნებები</p>
                      <Bullets items={med.findings.slice(0, 6).map((f) => `[${f.severity}] ${f.titleKa}`)} />
                      <Link href="/medication-review" className="btn btn-ghost mt-2 text-xs">
                        სრული მიმოხილვა
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'labs' && (
            <div className="space-y-2">
              {patient.labs.length === 0 ? (
                <EmptyState title="ლაბორატორია ცარიელია" description="დაამატეთ მაჩვენებლები Laboratory AI გვერდზე ან მარჯვენა პანელში." />
              ) : (
                <>
                  <Bullets items={labs.results.map((r) => `${r.labelKa}: ${r.value} ${r.unit} (რეფ. ${r.refText}) — ${r.status}`)} />
                  {labs.urgent.length > 0 && (
                    <div className="mt-3 rounded-lg border border-clinical-critical/40 bg-clinical-critical/5 p-3">
                      <p className="text-sm font-semibold text-clinical-critical">გადაუდებელი ყურადღება</p>
                      <Bullets items={labs.urgent} className="mt-1" />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'documents' && (
            <div className="space-y-3">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-ink-850/40 px-4 py-8 text-center transition hover:border-cyan/40">
                <Upload className="h-5 w-5 text-slate-500" />
                <span className="text-sm text-slate-300">ატვირთეთ სამედიცინო დოკუმენტი</span>
                <span className="text-xs text-slate-500">PDF · DOCX · TXT · Markdown · CSV — {UPLOAD_HINT_KA}</span>
                <input type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={(e) => void onUpload(e.target.files)} />
              </label>
              {uploadNote && <p className="text-xs text-slate-400">{uploadNote}</p>}
              {patient.documents.map((d) => (
                <div key={d.id} className="rounded-lg border border-line bg-ink-850/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-100">{d.name}</p>
                    <button type="button" className="btn btn-ghost px-2" aria-label="წაშლა" onClick={() => update('documents', patient.documents.filter((x) => x.id !== d.id))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-400">{d.text.slice(0, 2000)}</p>
                </div>
              ))}
            </div>
          )}

          {(tab === 'ai' || tab === 'quality') && (
            <div className="space-y-3">
              {loading && <Skeleton lines={6} />}
              {error && !loading && <ErrorState title="ანალიზი ვერ დასრულდა" detail={error} />}
              {!loading && !error && result && <AnswerView result={result} onClear={() => { setResult(null); setError(null); }} />}
              {!loading && !error && !result && <EmptyState title="ანალიზი ჯერ არ გაშვებულა" description="აირჩიეთ ქმედება ზემოთ — ქეისის ანალიზი, გამოტოვებული მონაცემები, გეგმის შემოწმება ან ხარისხის მიმოხილვა." />}
            </div>
          )}
        </Panel>
      </div>

      <aside className="min-w-0">
        <Panel title="ქეისის რედაქტირება" subtitle="დროებითი ქეისის სესია">
          <ClinicalContextPanel compact />
        </Panel>
      </aside>
    </div>
  );
}
