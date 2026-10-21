'use client';

import { useState } from 'react';
import { Microscope, Search } from 'lucide-react';
import type { RetrievalHit } from '@/schemas/evidence';
import { Badge, Bullets, Collapsible, ErrorState, ExportBar, Panel, Skeleton, Table } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

type Stage = 'question' | 'pico' | 'strategy' | 'literature' | 'screening' | 'table' | 'bias' | 'extraction' | 'protocol' | 'stats' | 'manuscript' | 'references';

const STAGES: { id: Stage; labelKa: string }[] = [
  { id: 'question', labelKa: 'კვლევითი კითხვა' },
  { id: 'pico', labelKa: 'PICO' },
  { id: 'strategy', labelKa: 'ძიების სტრატეგია' },
  { id: 'literature', labelKa: 'ლიტერატურა' },
  { id: 'screening', labelKa: 'სკრინინგი' },
  { id: 'table', labelKa: 'მტკიცებულების ცხრილი' },
  { id: 'bias', labelKa: 'მიკერძოების რისკი' },
  { id: 'extraction', labelKa: 'მონაცემთა ამოღება' },
  { id: 'protocol', labelKa: 'პროტოკოლი' },
  { id: 'stats', labelKa: 'სტატისტიკური გეგმა' },
  { id: 'manuscript', labelKa: 'ხელნაწერის სტრუქტურა' },
  { id: 'references', labelKa: 'ბიბლიოგრაფია' },
];

const BIAS_DOMAINS = ['რანდომიზაციის პროცესი', 'გადახრები ინტერვენციიდან', 'გამოტოვებული შედეგის მონაცემები', 'შედეგის გაზომვა', 'შედეგის შერჩევითი ანგარიშგება'];

export function ResearchWorkspace() {
  const [stage, setStage] = useState<Stage>('question');
  const [question, setQuestion] = useState('');
  const [pico, setPico] = useState({ p: '', i: '', c: '', o: '' });
  const [hits, setHits] = useState<RetrievalHit[]>([]);
  const [screened, setScreened] = useState<Record<string, 'include' | 'exclude' | undefined>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const search = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/evidence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: question, pico, sourceTypes: [], specialties: [], jurisdictions: [], onlyCurrent: false, limit: 15 }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.messageKa ?? 'ძიება ვერ შესრულდა.');
        return;
      }
      setHits(json.hits as RetrievalHit[]);
      setStage('literature');
    } catch {
      setError('სერვერთან კავშირი ვერ დამყარდა.');
    } finally {
      setLoading(false);
    }
  };

  const included = hits.filter((h) => screened[h.source.source_id] === 'include');

  const strategy = `("${pico.p || '[Population]'}") AND ("${pico.i || '[Intervention]'}")${pico.c ? ` AND ("${pico.c}")` : ''}${pico.o ? ` AND ("${pico.o}")` : ''}`;

  const md = `# კვლევითი სამუშაო სივრცე

## კვლევითი კითხვა
${question || '—'}

## PICO
- P: ${pico.p || '—'}
- I: ${pico.i || '—'}
- C: ${pico.c || '—'}
- O: ${pico.o || '—'}

## ძიების სტრატეგია
${strategy}

## ჩართული წყაროები (${included.length})
${included.map((h) => `- ${h.source.citation_text}`).join('\n') || '—'}

## შენიშვნები
${notes || '—'}

_გამოგონილი ციტირება დაუშვებელია: ყველა მითითება მოდის Source Registry-დან და გადამოწმებადია._`;

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside>
        <Panel title="ეტაპები">
          <ul className="space-y-0.5">
            {STAGES.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setStage(s.id)} className={cn('w-full rounded-md px-2 py-1.5 text-left text-xs transition', s.id === stage ? 'bg-cyan/12 text-fg' : 'text-slate-400 hover:bg-ink-850 hover:text-slate-200')}>
                  {s.labelKa}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </aside>

      <div className="min-w-0 space-y-4">
        {stage === 'question' && (
          <Panel title="კვლევითი კითხვა" subtitle="FINER: შესრულებადი · საინტერესო · ახალი · ეთიკური · რელევანტური">
            <textarea className="field min-h-[110px] resize-y" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="მაგ.: ამცირებს თუ არა სტრუქტურირებული მედიკამენტების მიმოხილვა დაცემებს 75+ ასაკის ამბულატორიულ პაციენტებში?" />
            <button type="button" className="btn btn-primary mt-3" onClick={() => setStage('pico')}>
              შემდეგი: PICO
            </button>
          </Panel>
        )}

        {stage === 'pico' && (
          <Panel title="PICO ჩარჩო">
            <div className="grid gap-2 sm:grid-cols-2">
              {([['p', 'Population — პოპულაცია'], ['i', 'Intervention — ჩარევა'], ['c', 'Comparison — შედარება'], ['o', 'Outcome — შედეგი']] as const).map(([k, label]) => (
                <div key={k}>
                  <label className="label" htmlFor={`pico-${k}`}>
                    {label}
                  </label>
                  <input id={`pico-${k}`} className="field mt-1" value={pico[k]} onChange={(e) => setPico((p) => ({ ...p, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-primary mt-3" onClick={() => setStage('strategy')}>
              შემდეგი: ძიების სტრატეგია
            </button>
          </Panel>
        )}

        {stage === 'strategy' && (
          <Panel title="ძიების სტრატეგია">
            <div className="rounded-lg border border-line bg-ink-950/60 p-3">
              <p className="label mb-1">ბულეანური გამოსახულება</p>
              <p className="font-mono text-xs leading-relaxed text-cyan-soft">{strategy}</p>
            </div>
            <Bullets
              className="mt-3"
              items={[
                'დაამატეთ MeSH ტერმინები და მათი სინონიმები თითოეული კომპონენტისთვის.',
                'განსაზღვრეთ შეზღუდვები: პუბლიკაციის წლები, ენა, დიზაინი.',
                'ჩაატარეთ ძიება მინიმუმ ორ ბაზაში და მოხსენით დუბლიკატები.',
                'შეინახეთ ძიების თარიღი და ზუსტი სტრიქონი რეპროდუცირებადობისთვის.',
              ]}
            />
            <button type="button" className="btn btn-primary mt-3" onClick={() => void search()} disabled={loading}>
              <Search className="h-4 w-4" /> ძიება რეესტრში
            </button>
          </Panel>
        )}

        {loading && (
          <Panel>
            <Skeleton lines={5} />
          </Panel>
        )}
        {error && <ErrorState title="ძიება ვერ შესრულდა" detail={error} />}

        {stage === 'literature' && !loading && (
          <Panel title="ლიტერატურა" subtitle={`${hits.length} ჩანაწერი Source Registry-დან`}>
            {hits.length === 0 ? (
              <p className="text-sm text-slate-400">შედეგი არ არის. გააფართოვეთ ტერმინები ან შეავსეთ რეესტრი ingestion მოდულით.</p>
            ) : (
              <ul className="space-y-2">
                {hits.map((h) => (
                  <li key={h.source.source_id} className="rounded-lg border border-line bg-ink-850/40 p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge>{h.source.source_type}</Badge>
                      <Badge tone={h.source.freshness === 'current' ? 'low' : 'moderate'}>{h.source.freshness}</Badge>
                      <span className="font-mono text-[10px] text-slate-600">{h.source.source_id}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-200">{h.source.title}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{h.source.citation_text}</p>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn mt-3" onClick={() => setStage('screening')} disabled={!hits.length}>
              შემდეგი: სკრინინგი
            </button>
          </Panel>
        )}

        {stage === 'screening' && (
          <Panel title="სკრინინგი" subtitle={`ჩართული: ${included.length} / ${hits.length}`}>
            <ul className="space-y-2">
              {hits.map((h) => (
                <li key={h.source.source_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-ink-850/40 p-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{h.source.title}</span>
                  <button type="button" className={cn('btn text-xs', screened[h.source.source_id] === 'include' && 'border-clinical-low/50 text-clinical-low')} onClick={() => setScreened((p) => ({ ...p, [h.source.source_id]: 'include' }))}>
                    ჩართვა
                  </button>
                  <button type="button" className={cn('btn text-xs', screened[h.source.source_id] === 'exclude' && 'border-clinical-critical/50 text-clinical-critical')} onClick={() => setScreened((p) => ({ ...p, [h.source.source_id]: 'exclude' }))}>
                    გამორიცხვა
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {stage === 'table' && (
          <Panel title="მტკიცებულების ცხრილი" subtitle={`${included.length} ჩართული კვლევა`} actions={<ExportBar text={md} json={{ question, pico, included }} filename="research-workspace" onClear={() => { setQuestion(''); setPico({ p: '', i: '', c: '', o: '' }); setHits([]); setScreened({}); setNotes(''); setError(null); setStage('question'); }} clearLabelKa="ახალი კვლევა" />}>
            {included.length === 0 ? (
              <p className="text-sm text-slate-400">ჯერ არცერთი წყარო არ არის ჩართული — გაიარეთ სკრინინგის ეტაპი.</p>
            ) : (
              <Table
                headers={['კვლევა', 'ტიპი', 'წელი', 'პოპულაცია', 'საკვანძო მიგნება', 'გამოყენებადობა']}
                rows={included.map((h) => [h.source.title, h.source.source_type, String(h.source.year), h.source.population, h.source.key_finding, h.source.applicability])}
              />
            )}
          </Panel>
        )}

        {stage === 'bias' && (
          <Panel title="მიკერძოების რისკის შეფასება" subtitle="დომენებზე დაფუძნებული მიდგომა">
            <Table
              headers={['კვლევა', ...BIAS_DOMAINS]}
              rows={included.map((h) => [h.source.title, ...BIAS_DOMAINS.map(() => 'შესაფასებელია')])}
            />
            <p className="mt-2 text-xs text-slate-500">შეფასება ტარდება ორი დამოუკიდებელი მიმომხილველის მიერ; უთანხმოება წყდება მესამე პირის ჩართვით.</p>
          </Panel>
        )}

        {stage === 'extraction' && (
          <Panel title="მონაცემთა ამოღება">
            <Bullets items={['კვლევის იდენტიფიკატორი, ავტორი, წელი, ქვეყანა', 'დიზაინი და ჩართვის/გამორიცხვის კრიტერიუმები', 'პოპულაციის საბაზისო მახასიათებლები', 'ინტერვენცია და კონტროლი (დოზა, ხანგრძლივობა)', 'პირველადი და მეორადი საბოლოო წერტილები', 'ეფექტის ზომა და სიზუსტე (95% CI)', 'დაკვირვების ხანგრძლივობა და დანაკარგი', 'დაფინანსების წყარო და ინტერესთა კონფლიქტი']} />
            <textarea className="field mt-3 min-h-[120px] resize-y" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ამოღებული მონაცემები და შენიშვნები…" />
          </Panel>
        )}

        {stage === 'protocol' && (
          <Panel title="კვლევის პროტოკოლის სტრუქტურა">
            <Bullets items={['სათაური და რეგისტრაცია', 'შესავალი და დასაბუთება', 'მიზნები და ჰიპოთეზა', 'მეთოდები: დიზაინი, პოპულაცია, შერჩევა', 'ინტერვენცია და შედარება', 'შედეგების განსაზღვრება და გაზომვა', 'შერჩევის ზომის გაანგარიშება', 'სტატისტიკური ანალიზი', 'ეთიკური საკითხები და თანხმობა', 'მონაცემთა მართვა და კონფიდენციალობა', 'ვადები და რესურსები']} />
          </Panel>
        )}

        {stage === 'stats' && (
          <Panel title="სტატისტიკური გეგმა">
            <Bullets items={['პირველადი ანალიზის პოპულაცია (ITT / per-protocol)', 'პირველადი შედეგის ანალიზის მეთოდი', 'შემაჯამებელი სტატისტიკები და ეფექტის ზომები', 'გამოტოვებული მონაცემების მართვა', 'ქვეჯგუფური ანალიზები (წინასწარ განსაზღვრული)', 'მრავლობითი შედარების კორექცია', 'მგრძნობელობის ანალიზები', 'გამოყენებული პროგრამული უზრუნველყოფა და ვერსია']} />
          </Panel>
        )}

        {stage === 'manuscript' && (
          <Panel title="ხელნაწერის სტრუქტურა">
            <Bullets items={['Title page — ავტორები, აფილიაცია, შესაბამისი ავტორი', 'Abstract — სტრუქტურირებული', 'Introduction — რა ცნობილია და რა არის ხარვეზი', 'Methods — რეპროდუცირებადი დონის დეტალი', 'Results — ცხრილები და ფიგურები ინტერპრეტაციის გარეშე', 'Discussion — ძირითადი მიგნება, შედარება, შეზღუდვები', 'Conclusion — მხოლოდ მონაცემებით გამყარებული', 'References — ყველა გადამოწმებული', 'Declarations — ეთიკა, დაფინანსება, ინტერესთა კონფლიქტი']} />
          </Panel>
        )}

        {stage === 'references' && (
          <Panel title="ბიბლიოგრაფია" subtitle="მხოლოდ გადამოწმებადი ჩანაწერები" actions={<ExportBar text={md} json={included} filename="research-references" onClear={() => { setQuestion(''); setPico({ p: '', i: '', c: '', o: '' }); setHits([]); setScreened({}); setNotes(''); setError(null); setStage('question'); }} clearLabelKa="ახალი კვლევა" />}>
            <Collapsible title="მკაცრი წესი" tone="warning">
              <p className="text-sm leading-relaxed text-slate-300">გამოგონილი ციტირება აბსოლუტურად დაუშვებელია. ყველა მითითება მოდის Source Registry-დან და შეიცავს გამომცემელს, წელს, ტიპს და უფლებრივ სტატუსს.</p>
            </Collapsible>
            <ol className="mt-3 space-y-2">
              {included.map((h, i) => (
                <li key={h.source.source_id} className="rounded-lg border border-line bg-ink-850/40 p-2.5 text-[13px] leading-relaxed text-slate-300">
                  {i + 1}. {h.source.citation_text}
                </li>
              ))}
            </ol>
          </Panel>
        )}

        <Panel title="კვლევის AI — პრინციპი" actions={<Microscope className="h-4 w-4 text-cyan" />}>
          <p className="text-sm leading-relaxed text-slate-400">სისტემა ეხმარება კვლევის სტრუქტურირებას, მაგრამ არ ქმნის ლიტერატურას. ყოველი ციტირება უნდა იყოს მოძიებადი და დადასტურებული.</p>
        </Panel>
      </div>
    </div>
  );
}
