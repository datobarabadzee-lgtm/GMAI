'use client';

import { useState } from 'react';
import { FileText, Upload, Wand2, Download, Loader2 } from 'lucide-react';
import { DOC_TEMPLATES, templateById } from '@/knowledge/document-templates';
import { useCase } from '@/features/case/case-store';
import { useRole } from '@/features/settings/role-store';
import { Badge, Bullets, EmptyState, ErrorState, ExportBar, Panel } from '@/components/ui/primitives';
import { cn, uid } from '@/lib/utils';

type ParsedResult = {
  ok: boolean;
  name: string;
  text?: string;
  pages?: number;
  warningKa?: string;
  messageKa?: string;
  facts?: { diagnoses: string[]; medications: string[]; investigations: string[]; procedures: string[]; dates: string[]; inconsistencies: string[] };
};

const AUDIENCE_KA = {
  clinician: 'კლინიკური',
  patient: 'პაციენტისთვის',
  insurer: 'სადაზღვევო',
  institution: 'ინსტიტუციური',
  regulator: 'მარეგულირებლისთვის',
} as const;

export function DocumentWorkspace() {
  const { patient, update } = useCase();
  const { authHeaders } = useRole();
  const [templateId, setTemplateId] = useState(DOC_TEMPLATES[0].id);
  const [author, setAuthor] = useState('');
  const [institution, setInstitution] = useState('');
  const [clinicalData, setClinicalData] = useState('');
  const [sectionInput, setSectionInput] = useState<Record<string, string>>({});
  const [insurancePolicy, setInsurancePolicy] = useState('');
  const [insuranceService, setInsuranceService] = useState('');
  const [report, setReport] = useState<{ dictated: string[]; empty: string[]; sources: string[]; removed: { heading: string; sentence: string; reasonKa: string }[] } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [doc, setDoc] = useState('');
  const [sections, setSections] = useState<{ heading: string; body: string }[]>([]);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedResult[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const template = templateById(templateId)!;
  const filledCount = template.sections.filter((sec) => (sectionInput[sec] ?? '').trim().length > 0).length;

  /** Turns the section list into the editable text shown on screen. */
  const toText = (secs: { heading: string; body: string }[]) =>
    [
      `# ${template.nameKa}`,
      '',
      `დაწესებულება: ${institution || 'ლიდერმედი'}`,
      `ექიმი: ${author || '—'}`,
      `თარიღი: ${new Date().toLocaleDateString('ka-GE')}`,
      `ქეისი: ${patient.label || '—'}`,
      '',
      ...secs.flatMap((s) => [`## ${s.heading}`, s.body, '']),
    ].join('\n');

  /**
   * The template is filled from the case data rather than emitted as an empty
   * skeleton; sections without supporting data say so instead of being invented.
   */
  const generate = async () => {
    setGenerating(true);
    setDocError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          templateId: template.id,
          patient,
          clinicalData,
          author,
          institution,
          sectionInput,
          insurance: template.id === 'insurance' ? { policy: insurancePolicy, service: insuranceService } : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setDocError(json.messageKa ?? 'დოკუმენტი ვერ მომზადდა.');
        return;
      }
      setSections(json.sections);
      setDoc(toText(json.sections));
      setReport({
        dictated: json.dictatedSections ?? [],
        empty: json.emptySections ?? [],
        sources: json.standardSources ?? [],
        removed: json.removed ?? [],
      });
      setReviewed(false);
      if (json.noticeKa) setNotice(json.noticeKa);
    } catch {
      setDocError('სერვერთან კავშირი ვერ დამყარდა.');
    } finally {
      setGenerating(false);
    }
  };

  /** Parses the editable text back into sections so manual edits reach the file. */
  const sectionsFromText = (): { heading: string; body: string }[] => {
    const out: { heading: string; body: string }[] = [];
    let current: { heading: string; body: string } | null = null;
    for (const raw of doc.split('\n')) {
      const m = /^##\s+(.*)$/.exec(raw.trim());
      if (m) {
        if (current) out.push(current);
        current = { heading: m[1].trim(), body: '' };
      } else if (current) {
        current.body += (current.body ? '\n' : '') + raw;
      }
    }
    if (current) out.push(current);
    return out.length ? out.map((s) => ({ ...s, body: s.body.trim() })) : sections;
  };

  const downloadDocx = async () => {
    setExporting(true);
    setDocError(null);
    try {
      const res = await fetch('/api/documents/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          templateId: template.id,
          patient,
          sections: sectionsFromText(),
          author,
          institution,
          date: new Date().toLocaleDateString('ka-GE'),
          reviewState: reviewed ? 'clinician_reviewed' : 'draft',
          sources: report?.sources ?? [],
        }),
      });
      if (!res.ok) {
        setDocError('ფაილის აწყობა ვერ მოხერხდა.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.nameEn.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDocError('ფაილის ჩამოტვირთვა ვერ მოხერხდა.');
    } finally {
      setExporting(false);
    }
  };

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setUploadError(null);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('files', f));
    try {
      const res = await fetch('/api/parse', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setUploadError(json.messageKa ?? 'ფაილის დამუშავება ვერ მოხერხდა.');
        return;
      }
      setParsed(json.results as ParsedResult[]);
      const good = (json.results as ParsedResult[]).filter((r) => r.ok && r.text);
      if (good.length) update('documents', [...patient.documents, ...good.map((r) => ({ id: uid(), name: r.name, text: r.text ?? '' }))]);
    } catch {
      setUploadError('სერვერთან კავშირი ვერ დამყარდა.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <Panel title="დოკუმენტის ტიპი" subtitle={`${DOC_TEMPLATES.length} შაბლონი`}>
          <select
            className="field"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setSectionInput({});
              setReport(null);
            }}
          >
            {(Object.keys(AUDIENCE_KA) as (keyof typeof AUDIENCE_KA)[]).map((aud) => {
              const group = DOC_TEMPLATES.filter((t) => t.audience === aud);
              if (!group.length) return null;
              return (
                <optgroup key={aud} label={AUDIENCE_KA[aud]}>
                  {group.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nameKa}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{template.noteKa}</p>
          <div className="mt-3 space-y-2">
            <div>
              <label className="label" htmlFor="doc-author">ექიმი</label>
              <input id="doc-author" className="field mt-1" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="სახელი, გვარი" />
            </div>
            <div>
              <label className="label" htmlFor="doc-inst">დაწესებულება</label>
              <input id="doc-inst" className="field mt-1" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="კლინიკის დასახელება" />
            </div>
          </div>
          <button type="button" className="btn btn-primary mt-3 w-full" onClick={() => void generate()} disabled={generating}>
            <Wand2 className="h-4 w-4" /> დოკუმენტის შექმნა
          </button>
        </Panel>

        <Panel title="სექციები" subtitle={`${template.sections.length} სექცია · ${filledCount} შევსებული`}>
          <ul className="space-y-1">
            {template.sections.map((sec) => (
              <li key={sec} className="flex items-start gap-2 text-[12px] leading-snug">
                <span className={cn('mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full', (sectionInput[sec] ?? '').trim() ? 'bg-clinical-low' : 'bg-slate-600')} />
                <span className={(sectionInput[sec] ?? '').trim() ? 'text-slate-200' : 'text-slate-500'}>{sec}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>{AUDIENCE_KA[template.audience] ?? template.audience}</Badge>
            {template.requiresSignature && <Badge tone="moderate">საჭიროებს ხელმოწერას</Badge>}
          </div>
        </Panel>
      </aside>

      <div className="min-w-0 space-y-4" id="upload">
        <Panel title="დოკუმენტის ანალიზი" subtitle="ატვირთული ფაილები მუშავდება მეხსიერებაში და სერვერზე არ ინახება">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-ink-850/40 px-4 py-8 text-center transition hover:border-cyan/40">
            <Upload className="h-5 w-5 text-slate-500" />
            <span className="text-sm text-slate-300">{busy ? 'მუშავდება…' : 'ატვირთეთ დოკუმენტი'}</span>
            <span className="text-xs text-slate-500">PDF · DOCX · TXT · Markdown · CSV</span>
            <input type="file" multiple accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={(e) => void onUpload(e.target.files)} />
          </label>
          {uploadError && <div className="mt-3"><ErrorState title="ფაილი ვერ დამუშავდა" detail={uploadError} /></div>}
          {parsed.length > 0 && (
            <div className="mt-3 space-y-2">
              {parsed.map((r) => (
                <div key={r.name} className="rounded-lg border border-line bg-ink-850/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-100">{r.name}</span>
                    <Badge tone={r.ok ? 'low' : 'critical'}>{r.ok ? 'დამუშავდა' : 'ვერ დამუშავდა'}</Badge>
                    {r.pages && <Badge>{r.pages} გვერდი</Badge>}
                  </div>
                  {r.messageKa && <p className="mt-1.5 text-sm text-clinical-critical">{r.messageKa}</p>}
                  {r.warningKa && <p className="mt-1.5 text-sm text-clinical-moderate">{r.warningKa}</p>}
                  {r.facts && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="label mb-1">ამოღებული დიაგნოზები</p>
                        <Bullets items={r.facts.diagnoses} />
                      </div>
                      <div>
                        <p className="label mb-1">მედიკამენტები</p>
                        <Bullets items={r.facts.medications} />
                      </div>
                      <div>
                        <p className="label mb-1">კვლევები</p>
                        <Bullets items={r.facts.investigations.slice(0, 8)} />
                      </div>
                      <div>
                        <p className="label mb-1">პროცედურები</p>
                        <Bullets items={r.facts.procedures.slice(0, 8)} />
                      </div>
                      <div>
                        <p className="label mb-1">ქრონოლოგია (თარიღები)</p>
                        <Bullets items={r.facts.dates.slice(0, 10)} />
                      </div>
                      <div>
                        <p className="label mb-1">პოტენციური შეუსაბამობები</p>
                        <Bullets items={r.facts.inconsistencies} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>

        {template.id === 'insurance' && (
          <Panel title="სადაზღვევო დეტალები" subtitle="ამ ორი ველის გარეშე დასაბუთება ზოგადი გამოვა">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="ins-policy">პოლისი / დამზღვევი</label>
                <input id="ins-policy" className="field mt-1" value={insurancePolicy} onChange={(e) => setInsurancePolicy(e.target.value)} placeholder="კომპანია, პოლისის ნომერი" />
              </div>
              <div>
                <label className="label" htmlFor="ins-service">მოთხოვნილი მომსახურება</label>
                <input id="ins-service" className="field mt-1" value={insuranceService} onChange={(e) => setInsuranceService(e.target.value)} placeholder="მაგ.: MRI თავის ტვინის კონტრასტით" />
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              მომსახურების დასახელებით სისტემა მოიძიებს მოქმედი სტანდარტის წყაროს და ჩასვამს სექციაში „მოქმედი სტანდარტის მითითება“.
            </p>
          </Panel>
        )}

        <Panel
          title="სექციების შევსება"
          subtitle="ჩაწერეთ ფაქტები ტეზისურად — სისტემა გადაიყვანს სამედიცინო ტექსტად. ცარიელი სექცია ასე დარჩება."
        >
          <div className="space-y-2.5">
            {template.sections.map((sec) => (
              <div key={sec}>
                <label className="label" htmlFor={`sec-${sec}`}>
                  {sec}
                </label>
                <textarea
                  id={`sec-${sec}`}
                  className="field mt-1 min-h-[52px] resize-y text-[13px]"
                  value={sectionInput[sec] ?? ''}
                  onChange={(e) => setSectionInput((prev) => ({ ...prev, [sec]: e.target.value }))}
                  placeholder="ტეზისურად — სრული წინადადება საჭირო არ არის"
                />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="დამატებითი კლინიკური მონაცემები" subtitle="არასავალდებულო — რაც ზემოთ სექციებში არ ჩაჯდა">
          <textarea className="field min-h-[110px] resize-y" value={clinicalData} onChange={(e) => setClinicalData(e.target.value)} placeholder="ჩასვით ან ჩაწერეთ კლინიკური შინაარსი…" />
        </Panel>

        {report && (
          <Panel title="შევსების ანგარიში" subtitle="რა დაიწერა მოწოდებული ფაქტებიდან და რა დარჩა ექიმს">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="label mb-1">შევსებულია ({template.sections.length - report.empty.length})</p>
                <Bullets items={template.sections.filter((x) => !report.empty.includes(x))} />
              </div>
              <div>
                <p className="label mb-1">შესავსებია ექიმის მიერ ({report.empty.length})</p>
                {report.empty.length ? (
                  <Bullets items={report.empty} />
                ) : (
                  <p className="text-[12px] text-clinical-low">ყველა სექცია შევსებულია.</p>
                )}
              </div>
            </div>
            {report.sources.length > 0 && (
              <div className="mt-3 rounded-lg border border-line bg-ink-950/50 p-3">
                <p className="label mb-1">სტანდარტის წყაროები, რომლებიც გამოყენდა</p>
                <Bullets items={report.sources} />
              </div>
            )}
            {report.removed.length > 0 && (
              <div className="mt-3 rounded-lg border border-clinical-high/50 bg-clinical-high/10 p-3">
                <p className="label mb-1">ამოღებულია ({report.removed.length}) — მოწოდებულ მონაცემებში არ არის</p>
                <Bullets items={report.removed.map((r) => `${r.heading}: „${r.sentence}“ — ${r.reasonKa}`)} />
              </div>
            )}
            {report.empty.length > 0 && (
              <p className="mt-3 text-[11px] leading-relaxed text-amber-200/70">
                ცარიელი სექცია არ არის სისტემის ხარვეზი — ეს ნიშნავს, რომ იმ სექციისთვის ფაქტი არ მოგვეწოდა.
                შეავსეთ შესაბამისი ველი ზემოთ და დააგენერირეთ ხელახლა, ან ჩაწერეთ ხელით დოკუმენტში.
              </p>
            )}
          </Panel>
        )}

        {doc ? (
          <Panel title="გენერირებული დოკუმენტი" subtitle="რედაქტირებადი — ექსპორტამდე შეამოწმეთ" actions={<ExportBar text={doc} json={{ template: template.id, patientLabel: patient.label }} filename={`doc-${template.id}`} onClear={() => { setDoc(''); setDocError(null); setNotice(null); setReport(null); setSectionInput({}); }} clearLabelKa="დოკუმენტის გასუფთავება" />}>
            <textarea className="field min-h-[520px] resize-y whitespace-pre-wrap font-mono text-xs leading-relaxed" value={doc} onChange={(e) => setDoc(e.target.value)} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary text-xs" onClick={() => void downloadDocx()} disabled={exporting}>
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Word-ის ფაილის ჩამოტვირთვა
              </button>
              <label className="flex items-center gap-1.5 text-[11.5px] text-slate-300">
                <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> ტექსტი განვიხილე და შევამოწმე (ექიმი)
              </label>
              <span className="text-[11px] text-slate-500">ფაილში ჩაიწერება სტატუსი: {reviewed ? 'განხილულია ექიმის მიერ — ძალაშია ხელმოწერის შემდეგ' : 'პროექტი — საჭიროებს ექიმის განხილვას'}</span>
            </div>
            {notice && <p className="mt-2 text-[11px] text-clinical-moderate">{notice}</p>}
            {docError && <p className="mt-2 text-[11px] text-clinical-critical">{docError}</p>}
            <p className="mt-2 text-[11px] text-slate-500">ტექსტის რედაქტირება პირდაპირ ველშია შესაძლებელი — ჩამოტვირთვამდე შეტანილი ცვლილებები ფაილშიც აისახება.</p>
          </Panel>
        ) : (
          <EmptyState title="დოკუმენტი ჯერ არ არის გენერირებული" description={'აირჩიეთ ტიპი მარცხნივ, შეავსეთ ავტორი და დაწესებულება, შემდეგ დააჭირეთ „დოკუმენტის შექმნა“.'} action={<span className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500"><FileText className="h-3.5 w-3.5" /> {DOC_TEMPLATES.length} შაბლონი ხელმისაწვდომია</span>} />
        )}
      </div>
    </div>
  );
}
