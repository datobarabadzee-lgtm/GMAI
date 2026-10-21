'use client';

import { useState } from 'react';
import { Database, Upload } from 'lucide-react';
import { Badge, Bullets, ErrorState, Panel } from '@/components/ui/primitives';

const TYPES = ['guideline', 'systematic_review', 'meta_analysis', 'rct', 'cohort', 'case_control', 'consensus', 'drug_label', 'regulatory', 'textbook', 'local_protocol', 'legal'];
const RIGHTS = ['OPEN', 'PUBLIC_DOMAIN', 'LICENSED', 'INTERNAL_REFERENCE', 'RESTRICTED', 'UNKNOWN'];

export function IngestWorkspace({ enabled }: { enabled: boolean }) {
  const [form, setForm] = useState({ title: '', publisher: '', year: new Date().getFullYear(), source_type: 'guideline', jurisdiction: 'international', rights_status: 'UNKNOWN', version: '1', url: '', citation_text: '', key_finding: '', specialty: '', text: '' });
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) {
    return <ErrorState title="დეველოპერული ინსტრუმენტები გამორთულია" detail="ჩართეთ ENABLE_DEV_TOOLS=1 გარემოს ცვლადებში და გადატვირთეთ სერვერი." hint="production-ში ეს გვერდი საჯარო ნავიგაციაში არ ჩანს." />;
  }

  const submit = async () => {
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, year: Number(form.year), specialty: form.specialty.split(',').map((s) => s.trim()).filter(Boolean) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.messageKa ?? JSON.stringify(json.issues ?? json));
        return;
      }
      setResult(json);
    } catch {
      setError('სერვერთან კავშირი ვერ დამყარდა.');
    }
  };

  const onFile = async (files: FileList | null) => {
    if (!files?.length) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('files', f));
    const res = await fetch('/api/parse', { method: 'POST', body: fd });
    const json = await res.json();
    const first = (json.results ?? [])[0];
    if (first?.ok) setForm((p) => ({ ...p, text: first.text, title: p.title || first.name }));
    else setError(first?.messageKa ?? 'ფაილი ვერ დამუშავდა.');
  };

  return (
    <div className="space-y-4">
      <Panel title="ფაილის ატვირთვა" subtitle="ტექსტი ამოიღება და მზადდება ინდექსაციისთვის">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-ink-850/40 px-4 py-6 text-center transition hover:border-cyan/40">
          <Upload className="h-5 w-5 text-slate-500" />
          <span className="text-xs text-slate-400">PDF · DOCX · TXT · Markdown · CSV</span>
          <input type="file" className="hidden" accept=".pdf,.docx,.txt,.md,.csv" onChange={(e) => void onFile(e.target.files)} />
        </label>
      </Panel>

      <Panel title="მეტამონაცემები" actions={<Badge tone="moderate">rights-aware</Badge>}>
        <div className="grid gap-2 sm:grid-cols-2">
          {([['title', 'სათაური'], ['publisher', 'გამომცემელი'], ['citation_text', 'ციტირება'], ['key_finding', 'საკვანძო მიგნება'], ['url', 'URL'], ['version', 'ვერსია'], ['specialty', 'სპეციალობები (მძიმით)']] as const).map(([k, label]) => (
            <div key={k} className={k === 'citation_text' || k === 'key_finding' ? 'sm:col-span-2' : ''}>
              <label className="label" htmlFor={`f-${k}`}>
                {label}
              </label>
              <input id={`f-${k}`} className="field mt-1" value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label className="label" htmlFor="f-year">წელი</label>
            <input id="f-year" type="number" className="field mt-1" value={form.year} onChange={(e) => setForm((p) => ({ ...p, year: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label" htmlFor="f-type">ტიპი</label>
            <select id="f-type" className="field mt-1" value={form.source_type} onChange={(e) => setForm((p) => ({ ...p, source_type: e.target.value }))}>
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-rights">უფლებრივი სტატუსი</label>
            <select id="f-rights" className="field mt-1" value={form.rights_status} onChange={(e) => setForm((p) => ({ ...p, rights_status: e.target.value }))}>
              {RIGHTS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-jur">იურისდიქცია</label>
            <select id="f-jur" className="field mt-1" value={form.jurisdiction} onChange={(e) => setForm((p) => ({ ...p, jurisdiction: e.target.value }))}>
              {['international', 'us', 'eu', 'uk', 'georgia', 'who', 'other'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <textarea className="field mt-2 min-h-[120px] resize-y font-mono text-xs" value={form.text} onChange={(e) => setForm((p) => ({ ...p, text: e.target.value }))} placeholder="სრული ტექსტი (chunking-ისთვის)" />
        <button type="button" className="btn btn-primary mt-3" onClick={() => void submit()}>
          <Database className="h-4 w-4" /> ვალიდაცია და ინდექსაციისთვის მომზადება
        </button>
      </Panel>

      {error && <ErrorState title="ვერ დამუშავდა" detail={error} />}

      {result !== null && (
        <Panel title="შედეგი">
          <Bullets items={['ჩანაწერი ვალიდირებულია zod სქემით.', 'freshness ავტომატურად დაყენებულია review_due-ზე.', 'fulltext_public განისაზღვრება უფლებრივი სტატუსით.']} />
          <pre className="mt-3 max-h-[400px] overflow-auto rounded-lg border border-line bg-ink-950/70 p-3 text-[11px] leading-relaxed text-slate-300">{JSON.stringify(result, null, 2)}</pre>
        </Panel>
      )}
    </div>
  );
}
