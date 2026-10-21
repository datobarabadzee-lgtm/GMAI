'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { GraduationCap, Eye, RotateCcw } from 'lucide-react';
import { LEVEL_KA, MODE_KA, SIMULATOR_CASES, TOPICS, type AcademyLevel, type AcademyMode } from '@/knowledge/academy';
import { sourcesByIds } from '@/knowledge/sources';
import { Badge, Bullets, Collapsible, ExportBar, Panel } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

export function AcademyWorkspace() {
  const [level, setLevel] = useState<AcademyLevel>('resident');
  const [mode, setMode] = useState<AcademyMode>('explain');
  // The menu links straight to a mode (/academy?mode=quiz).
  const params = useSearchParams();
  useEffect(() => {
    const m = params.get('mode') as AcademyMode | null;
    if (m && m in MODE_KA) setMode(m);
  }, [params]);
  const [topicId, setTopicId] = useState(TOPICS[0].id);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const [simId, setSimId] = useState(SIMULATOR_CASES[0].id);
  const [revealed, setRevealed] = useState<string[]>([]);

  const topic = TOPICS.find((t) => t.id === topicId)!;
  const sim = SIMULATOR_CASES.find((s) => s.id === simId)!;
  const sources = sourcesByIds(topic.sourceIds);

  const md = `# ${topic.nameKa} — ${LEVEL_KA[level]}\n\n${topic.explain[level]}\n\n## ნაბიჯები\n${topic.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n## წყაროები\n${sources.map((s) => `- ${s.citation_text}`).join('\n')}`;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Panel title="დონე და რეჟიმი">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(LEVEL_KA) as AcademyLevel[]).map((l) => (
            <button key={l} type="button" onClick={() => setLevel(l)} className={cn('rounded-full border px-3 py-1 text-xs transition', l === level ? 'border-cyan/50 bg-cyan/15 text-fg' : 'border-line text-slate-400 hover:text-slate-200')}>
              {LEVEL_KA[l]}
            </button>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {(Object.keys(MODE_KA) as AcademyMode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={cn('rounded-full border px-3 py-1 text-xs transition', m === mode ? 'border-cyan/50 bg-cyan/15 text-fg' : 'border-line text-slate-400 hover:text-slate-200')}>
              {MODE_KA[m]}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <label htmlFor="topic" className="label">
            თემა
          </label>
          <select id="topic" className="field mt-1" value={topicId} onChange={(e) => { setTopicId(e.target.value); setAnswers({}); setFlipped({}); }}>
            {TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nameKa} — {t.specialty}
              </option>
            ))}
          </select>
        </div>
      </Panel>

      {mode === 'explain' && (
        <Panel title={topic.nameKa} subtitle={`დონე: ${LEVEL_KA[level]}`} actions={<ExportBar text={md} json={topic} filename={`academy-${topic.id}`} />}>
          <p className="text-sm leading-relaxed text-slate-200">{topic.explain[level]}</p>
          <div className="mt-3">
            <p className="label mb-1">წყაროები</p>
            <Bullets items={sources.map((s) => s.citation_text)} />
          </div>
        </Panel>
      )}

      {mode === 'stepwise' && (
        <Panel title="ნაბიჯ-ნაბიჯ" subtitle={topic.nameKa}>
          <ol className="space-y-2">
            {topic.steps.map((s, i) => (
              <li key={i} className="flex gap-3 rounded-lg border border-line bg-ink-850/40 p-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-cyan/40 text-xs text-cyan">{i + 1}</span>
                <span className="text-sm leading-relaxed text-slate-300">{s}</span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {mode === 'socratic' && (
        <Panel title="სოკრატული რეჟიმი" subtitle="უპასუხე ხმამაღლა ან წერილობით — შემდეგ შეამოწმე ახსნის რეჟიმში">
          <ol className="space-y-2">
            {topic.socratic.map((q, i) => (
              <li key={i} className="rounded-lg border border-line bg-ink-850/40 p-3 text-sm leading-relaxed text-slate-200">
                {i + 1}. {q}
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {mode === 'quiz' && (
        <Panel title="ქვიზი" subtitle={`${topic.quiz.length} კითხვა`}>
          <ol className="space-y-3">
            {topic.quiz.map((item, qi) => (
              <li key={qi} className="rounded-lg border border-line bg-ink-850/40 p-3">
                <p className="text-sm font-medium text-slate-100">
                  {qi + 1}. {item.q}
                </p>
                <div className="mt-2 space-y-1.5">
                  {item.options.map((o, oi) => {
                    const chosen = answers[qi];
                    const isChosen = chosen === oi;
                    const isCorrect = item.correct === oi;
                    return (
                      <button
                        key={oi}
                        type="button"
                        onClick={() => setAnswers((p) => ({ ...p, [qi]: oi }))}
                        className={cn(
                          'w-full rounded-md border px-3 py-2 text-left text-sm transition',
                          chosen === undefined ? 'border-line text-slate-300 hover:border-cyan/40' : isCorrect ? 'border-clinical-low/50 bg-clinical-low/10 text-clinical-low' : isChosen ? 'border-clinical-critical/50 bg-clinical-critical/10 text-clinical-critical' : 'border-line text-slate-500',
                        )}
                      >
                        {o}
                      </button>
                    );
                  })}
                </div>
                {answers[qi] !== undefined && (
                  <div className="mt-2 rounded-md border border-line bg-ink-950/60 p-2.5">
                    <p className="text-xs leading-relaxed text-slate-300">{item.explanation}</p>
                    <p className="mt-1 font-mono text-[10px] text-slate-500">{item.sourceIds.join(' · ')}</p>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {Object.keys(answers).length > 0 && (
            <button type="button" className="btn btn-ghost mt-3 text-xs" onClick={() => setAnswers({})}>
              <RotateCcw className="h-3.5 w-3.5" /> თავიდან
            </button>
          )}
        </Panel>
      )}

      {mode === 'flashcards' && (
        <Panel title="ფლეშქარდები">
          <div className="grid gap-2 sm:grid-cols-2">
            {topic.flashcards.map((f, i) => (
              <button key={i} type="button" onClick={() => setFlipped((p) => ({ ...p, [i]: !p[i] }))} className="min-h-[110px] rounded-lg border border-line bg-ink-850/40 p-4 text-left transition hover:border-cyan/40">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">{flipped[i] ? 'პასუხი' : 'კითხვა'}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-200">{flipped[i] ? f.back : f.front}</p>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {(mode === 'case' || mode === 'osce' || mode === 'oral') && (
        <Panel title="კლინიკური ქეისის სიმულატორი" subtitle="ინფორმაცია იხსნება მხოლოდ მოთხოვნისამებრ">
          <select className="field mb-3" value={simId} onChange={(e) => { setSimId(e.target.value); setRevealed([]); }}>
            {SIMULATOR_CASES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.titleKa}
              </option>
            ))}
          </select>
          <p className="rounded-lg border border-line bg-ink-850/40 p-3 text-sm leading-relaxed text-slate-200">{sim.stem}</p>
          <div className="mt-3 space-y-2">
            {sim.steps.map((st) => (
              <div key={st.id} className="rounded-lg border border-line bg-ink-850/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-100">{st.labelKa}</span>
                  {!revealed.includes(st.id) && (
                    <button type="button" className="btn btn-ghost text-xs" onClick={() => setRevealed((p) => [...p, st.id])}>
                      <Eye className="h-3.5 w-3.5" /> მოთხოვნა
                    </button>
                  )}
                </div>
                {revealed.includes(st.id) && <p className="mt-2 text-sm leading-relaxed text-slate-300">{st.content}</p>}
              </div>
            ))}
          </div>
          <div className="mt-3">
            <p className="label mb-1">შეფასების დომენები</p>
            <Bullets items={sim.assessment} />
          </div>
          <button type="button" className="btn btn-ghost mt-3 text-xs" onClick={() => setRevealed([])}>
            <RotateCcw className="h-3.5 w-3.5" /> ქეისის გადატვირთვა
          </button>
        </Panel>
      )}

      {mode === 'journal' && (
        <Panel title="ჟურნალ-კლუბი" subtitle="სტრუქტურირებული კრიტიკული შეფასება">
          <Collapsible title="შეფასების ჩარჩო">
            <Bullets
              items={[
                'რა კითხვას პასუხობს კვლევა (PICO)?',
                'რა დიზაინია და შეესაბამება თუ არა კითხვას?',
                'როგორია პოპულაცია და რამდენად ჰგავს ჩემს პაციენტს?',
                'რა არის პირველადი საბოლოო წერტილი და არის თუ არა ის კლინიკურად მნიშვნელოვანი?',
                'რა არის ეფექტის ზომა და მისი სიზუსტე (CI)?',
                'რა არის მიკერძოების ძირითადი რისკები?',
                'როგორ იცვლება ჩემი პრაქტიკა ამ შედეგის შემდეგ?',
              ]}
            />
          </Collapsible>
          <div className="mt-3">
            <p className="label mb-1">ამ თემის წყაროები კრიტიკული განხილვისთვის</p>
            <ul className="space-y-2">
              {sources.map((s) => (
                <li key={s.source_id} className="rounded-lg border border-line bg-ink-850/40 p-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge>{s.source_type}</Badge>
                    <Badge tone={s.freshness === 'current' ? 'low' : 'moderate'}>{s.freshness}</Badge>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-slate-300">{s.citation_text}</p>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      )}

      <Panel title="აკადემიის პრინციპი" actions={<GraduationCap className="h-4 w-4 text-cyan" />}>
        <p className="text-sm leading-relaxed text-slate-400">ერთი და იგივე თემა ოთხ დონეზე. ქეის-სიმულატორში სტუდენტი იღებს მხოლოდ იმ ინფორმაციას, რომელსაც სწორად მოითხოვს — ეს ავარჯიშებს დიაგნოსტიკურ მსჯელობას და არა დამახსოვრებას.</p>
      </Panel>
    </div>
  );
}
