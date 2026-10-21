'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, ExternalLink, Microscope, Search, ShieldAlert, TrendingDown } from 'lucide-react';
import { Badge, Bullets, Collapsible, EmptyState, ErrorState, ExportBar, Panel, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { AgeWarningBox, IdentityRequired, type AgeWarning, type IdentityMention } from '@/features/meds/drug-summary-card';

type Tone = 'critical' | 'high' | 'moderate' | 'low';

type LowValueHit = {
  id: string;
  matched: string;
  inn: string;
  nameKa: string;
  categoryKa: string;
  grade: string;
  gradeKa: string;
  tone: Tone;
  tier: string;
  tierKa: string;
  tierActionKa: string;
  approval: { fda: boolean; ema: boolean; noteKa?: string };
  claimedKa: string[];
  evidenceKa: string;
  keyReference: { titleKa: string; citation: string; year: number; url: string } | null;
  harmsKa: string[];
  insteadKa: string[];
  evidenceTerm: string;
};

type Citation = {
  title: string;
  year: number | null;
  journal: string | null;
  evidenceTier: string;
  url: string;
  citationText: string;
  doi: string | null;
};

type Resolution = { input: string; inn: string | null; via: 'exact' | 'brand' | 'fuzzy' | 'latin' | 'translit' | 'none'; matched?: string; suggestion?: { name: string; inn: string }; noteKa: string };

type ScreenResult = {
  resolutions?: Resolution[];
  ageWarnings?: AgeWarning[];
  child?: boolean;
  parsedCount: number;
  parsedNames: string[];
  polypharmacy: boolean;
  polypharmacyNoteKa: string;
  elderlyNoteKa: string;
  lowValue: LowValueHit[];
  tapers: { groupKa: string; startKa: string; rateKa: string; durationKa: string; noteKa: string }[];
  labels: null;
  identities?: IdentityMention[];
  unresolved?: string[];
  identityNoteKa?: string;
  interactions: { a: string; b: string; via: 'name' | 'class'; evidenceKa: string; matchedTerm: string; excerpt: string; severityHint: 'boxed' | 'interaction' }[];
  literature: { forEntry: string; citations: Citation[] } | null;
  disclaimerKa: string;
  registryNoteKa: string;
  messageKa?: string;
};

type Registry = {
  stats: { entries: number; categories: number; withNamedReference: number; notApprovedFdaEma: number; taperSchedules: number };
  entries: (LowValueHit & { brandsGe: string[] })[];
};

const TONE_CLASS: Record<Tone, string> = {
  critical: 'border-clinical-critical/50 bg-clinical-critical/10 text-clinical-critical',
  high: 'border-clinical-high/50 bg-clinical-high/10 text-clinical-high',
  moderate: 'border-clinical-moderate/50 bg-clinical-moderate/10 text-clinical-moderate',
  low: 'border-clinical-low/50 bg-clinical-low/10 text-clinical-low',
};

const TIER_LABEL_KA: Record<string, string> = {
  guideline: 'გაიდლაინი',
  systematic_review: 'სისტემური მიმოხილვა',
  rct: 'რანდომიზებული კვლევა',
  cohort_or_other: 'სხვა დიზაინი',
  preprint: 'პრეპრინტი',
};

export function PolypharmacyScreen({ simple = false }: { simple?: boolean }) {
  const [text, setText] = useState('');
  const [age, setAge] = useState('');
  const [result, setResult] = useState<ScreenResult | null>(null);
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [evidence, setEvidence] = useState<Record<string, Citation[] | 'loading' | 'empty'>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRegistry, setShowRegistry] = useState(false);

  useEffect(() => {
    void fetch('/api/polypharmacy')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setRegistry(j as Registry))
      .catch(() => undefined);
  }, []);

  const run = async () => {
    setLoading(true);
    setError(null);
    setEvidence({});
    try {
      const res = await fetch('/api/polypharmacy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ medications: text, age: age ? Number(age) : undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.messageKa ?? 'სკრინინგი ვერ შესრულდა.');
        setResult(null);
        return;
      }
      setResult(json as ScreenResult);
    } catch {
      setError('სერვერთან კავშირი ვერ დამყარდა.');
    } finally {
      setLoading(false);
    }
  };

  const loadEvidence = async (id: string) => {
    setEvidence((p) => ({ ...p, [id]: 'loading' }));
    try {
      const res = await fetch(`/api/drug-evidence?id=${encodeURIComponent(id)}`);
      const json = await res.json();
      setEvidence((p) => ({ ...p, [id]: json.citations?.length ? (json.citations as Citation[]) : 'empty' }));
    } catch {
      setEvidence((p) => ({ ...p, [id]: 'empty' }));
    }
  };

  const md = useMemo(() => {
    if (!result) return '';
    return `# პოლიფარმაციის სკრინინგი

პრეპარატები: ${result.parsedCount}${result.polypharmacy ? ' — პოლიფარმაცია (≥5)' : ''}
${(result.resolutions ?? []).map((r) => `- ${r.input}${r.inn ? ` → ${r.inn}` : ''}${r.via === 'fuzzy' ? ' (ვერ ამოვიცანით — მოქმედი ნივთიერება გადაამოწმეთ შეფუთვაზე)' : ''}`).join('\n')}
${result.ageWarnings?.length ? `\n## ⚠ ასაკობრივი შეზღუდვები\n${result.ageWarnings.map((w) => `- **${w.inn} — ${w.ageKa}: ${w.levelKa}.** ${w.textKa} (${w.sourceKa})`).join('\n')}\n` : ''}
## დაბალი ღირებულების მიგნებები (${result.lowValue.length})
${result.lowValue
  .map(
    (e) =>
      `### ${e.nameKa} — ${e.tierKa}\n- მტკიცებულება: ${e.gradeKa}\n- რეგულატორული სტატუსი: FDA ${e.approval.fda ? 'კი' : 'არა'} / EMA ${e.approval.ema ? 'კი' : 'არა'}\n- ${e.evidenceKa}\n${e.keyReference ? `- წყარო: ${e.keyReference.citation} (${e.keyReference.year}) — ${e.keyReference.url}\n` : ''}- ნაცვლად: ${e.insteadKa.join('; ')}`,
  )
  .join('\n\n')}

## ურთიერთქმედებები (${result.interactions.length})
${result.interactions.map((i) => `- ${i.a} ↔ ${i.b} — ${i.evidenceKa}`).join('\n')}

## ტიტრაციის გეგმები
${result.tapers.map((t) => `- ${t.groupKa}: ${t.rateKa}, ${t.durationKa}. ${t.noteKa}`).join('\n')}

---
${result.disclaimerKa}`;
  }, [result]);

  return (
    <div className="space-y-4">
      <Panel
        title={simple ? 'რომელ წამლებს იღებთ?' : 'წამლების შემოწმება'}
        subtitle={simple ? 'ჩაწერეთ ყველა წამალი — სავაჭრო სახელიც კი გამოდგება (მაგ. „ცერუკალი“). შევამოწმებთ ურთიერთქმედებას და ასაკობრივ შეზღუდვას და მოგცემთ ინსტრუქციას ქართულად.' : 'სავაჭრო ან საერთაშორისო სახელით, თითო ხაზზე. ურთიერთქმედება, ასაკობრივი შეზღუდვა, დაბალი ღირებულების პრეპარატები, ინსტრუქცია ქართულად.'}
      >
        <label className="sr-only" htmlFor="med-list">
          წამლების სია — თითო ახალ ხაზზე
        </label>
        <textarea
          id="med-list"
          className="field min-h-[130px] resize-y text-[15px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={simple ? 'მაგ.:\nომეპრაზოლი\nცერუკალი\nასპირინი' : 'ცერებროლიზინი 10მლ\nკავინტონი 5მგ\nომეპრაზოლი 20მგ\nდიაზეპამი 5მგ ღამით\nიბუპროფენი 400მგ ×2'}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-400" htmlFor="age">
            ასაკი
          </label>
          <input id="age" type="number" inputMode="numeric" className="field w-24" value={age} onChange={(e) => setAge(e.target.value)} placeholder="—" />
          <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={loading || text.trim().length < 3}>
            შემოწმება <Search className="h-4 w-4" />
          </button>
          <button type="button" className="text-sm font-medium text-cyan hover:underline" onClick={() => setText(simple ? 'ომეპრაზოლი\nცერუკალი\nასპირინი' : 'ცერებროლიზინი 10მლ\nკავინტონი 5მგ\nომეპრაზოლი 20მგ\nდიაზეპამი 5მგ ღამით\nიბუპროფენი 400მგ ×2')}>
            ნიმუშის ჩასმა
          </button>
        </div>
        {!simple && registry && (
          <p className="mt-3 text-[11px] text-slate-500">
            რეესტრი: {registry.stats.entries} ჩანაწერი · ეტიკეტები openFDA-დან · მტკიცებულება Europe PMC-დან
          </p>
        )}
      </Panel>

      {loading && (
        <Panel>
          <Skeleton lines={8} />
        </Panel>
      )}
      {error && !loading && <ErrorState title="სკრინინგი ვერ შესრულდა" detail={error} />}

      {!loading && result && (
        <>
          {result.ageWarnings && result.ageWarnings.length > 0 && <AgeWarningBox warnings={result.ageWarnings} />}
          {result.child && !result.ageWarnings?.length && (
            <p className="rounded-lg border border-clinical-low/40 bg-clinical-low/10 p-3 text-[13px] text-slate-200">
              ასაკობრივი აკრძალვა ამ სიაში ჩვენს ცხრილში ვერ მოიძებნა. ბავშვის დოზა მაინც წონაზეა დამოკიდებული — გადაამოწმეთ პედიატრთან.
            </p>
          )}
          <Panel title="შეჯამება" actions={
              <ExportBar
                text={md}
                json={result}
                filename="polypharmacy-screen"
                onClear={() => {
                  setResult(null);
                  setEvidence({});
                  setError(null);
                  setText('');
                  setAge('');
                }}
                clearLabelKa="ახალი პაციენტი"
              />
            }>
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="ამოცნობილი პრეპარატი" value={String(result.parsedCount)} tone={result.polypharmacy ? 'high' : 'low'} />
              <Stat label="დაბალი ღირებულების მიგნება" value={String(result.lowValue.length)} tone={result.lowValue.length ? 'critical' : 'low'} />
              <Stat label="ურთიერთქმედება" value={String(result.interactions.length)} tone={result.interactions.length ? 'high' : 'low'} />
            </div>
            {result.polypharmacyNoteKa && <p className="mt-3 text-sm leading-relaxed text-clinical-high">{result.polypharmacyNoteKa}</p>}
            {result.elderlyNoteKa && <p className="mt-1.5 text-sm leading-relaxed text-clinical-moderate">{result.elderlyNoteKa}</p>}
            {result.resolutions && result.resolutions.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {result.resolutions.map((r) => {
                  const lv = result.lowValue.find((e) => e.matched && r.input.toLowerCase().includes(e.matched.toLowerCase()));
                  const unknown = r.via === 'translit' || (r.via === 'latin' && (result.unresolved ?? []).includes(r.input));
                  return (
                    <li key={r.input} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px]">
                      <span className="font-medium text-slate-100">{r.input}</span>
                      {lv ? (
                        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', TONE_CLASS[lv.tone])}>{lv.gradeKa}</span>
                      ) : (
                        r.inn && !unknown && r.via !== 'latin' && (r.via === 'brand' ? <span className="text-slate-400">სავარაუდო ნივთიერება: {r.inn} (შესაბამისობა დაუდასტურებელია)</span> : <span className="text-cyan">→ {r.inn}</span>)
                      )}
                      {!lv && r.via === 'brand' && <Badge>სავაჭრო სახელი</Badge>}
                      <a href={`/medications?q=${encodeURIComponent(r.input)}`} className="text-[12px] text-cyan hover:underline">პროდუქტი →</a>
                      {r.via === 'fuzzy' && (
                        <span className="basis-full rounded-lg border border-clinical-high/50 bg-clinical-high/10 px-2.5 py-1.5 text-[12.5px] leading-relaxed text-slate-200" role="alert">
                          <strong className="text-clinical-high">ვერ ამოვიცანით. </strong>
                          {r.noteKa}
                          {r.suggestion && (
                            <button
                              type="button"
                              className="ml-1.5 font-medium text-cyan underline-offset-2 hover:underline"
                              onClick={() => setText((t) => t.split('\n').map((line) => (line.includes(r.input) ? line.replace(r.input, r.suggestion!.name) : line)).join('\n'))}
                            >
                              ჩავასწორო „{r.suggestion.name}“-ით?
                            </button>
                          )}
                        </span>
                      )}
                      {!lv && unknown && <span className="text-clinical-moderate">ჩვენს ბაზაში ჯერ არ არის — იხ. ქვემოთ</span>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 font-mono text-[10px] text-slate-500">ამოცნობილი: {result.parsedNames.join(' · ')}</p>
            )}
          </Panel>

          {result.lowValue.length > 0 && (
            <Panel title="დაბალი ღირებულების მედიკამენტები" subtitle="რანჟირებულია მოქმედების პრიორიტეტით — I კატეგორია ყველაზე ზემოთ">
              <div className="space-y-2">
                {result.lowValue.map((e) => (
                  <div key={e.id} className={cn('rounded-lg border p-4', TONE_CLASS[e.tone])}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[15px] font-semibold text-fg">{e.nameKa}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {e.inn} · {e.categoryKa}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={e.tone === 'critical' ? 'critical' : e.tone === 'high' ? 'high' : 'moderate'}>{e.gradeKa}</Badge>
                        <Badge>{e.tierKa}</Badge>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-1.5 text-[12px] sm:grid-cols-2">
                      <p className="text-slate-300">
                        <span className="label mr-1">FDA:</span>
                        {e.approval.fda ? 'დამტკიცებულია' : 'არ არის დამტკიცებული'}
                        <span className="label mx-1">EMA:</span>
                        {e.approval.ema ? 'დამტკიცებულია' : 'არ არის დამტკიცებული'}
                      </p>
                      <p className="text-slate-300">
                        <span className="label mr-1">რეკომენდებული მოქმედება:</span>
                        {e.tierActionKa}
                      </p>
                    </div>
                    {e.approval.noteKa && <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{e.approval.noteKa}</p>}

                    <p className="mt-3 rounded-lg bg-ink-900/70 p-3 text-[14px] font-medium leading-relaxed text-fg">
                      {e.grade === 'limited_benefit'
                        ? 'მარტივად: სარგებელი აქვს მხოლოდ ვიწრო ჩვენებით, და ისიც მცირე. იმ მიზეზით, რომლითაც ხშირად ინიშნება, ეფექტი დადასტურებული არ არის.'
                        : 'მარტივად: ამ პრეპარატის ეფექტი სანდო კვლევებში არ დადასტურებულა — ის, სავარაუდოდ, ვერ გააკეთებს იმას, რისთვისაც იღებთ. ფულს და დროს ხარჯავთ, ზოგჯერ კი ზიანიც აქვს.'}{' '}
                      თვითნებურად ნუ შეწყვეტთ — ჰკითხეთ ექიმს, რატომ დაგინიშნათ და რა მტკიცებულებას ეყრდნობა.
                    </p>
                    <p className="mt-3 text-[13px] leading-relaxed text-slate-200">{e.evidenceKa}</p>

                    {e.keyReference && (
                      <a
                        href={e.keyReference.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-cyan hover:underline"
                      >
                        <BookOpen className="h-3 w-3" />
                        {e.keyReference.citation} ({e.keyReference.year})
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {e.harmsKa.length > 0 && (
                        <div>
                          <p className="label mb-1">რისკი და ტვირთი</p>
                          <Bullets items={e.harmsKa} />
                        </div>
                      )}
                      <div>
                        <p className="label mb-1">რას აქვს მტკიცებულება</p>
                        <Bullets items={e.insteadKa} />
                      </div>
                    </div>

                    <div className="mt-3">
                      {!evidence[e.id] && (
                        <button type="button" className="btn btn-ghost text-[11px]" onClick={() => void loadEvidence(e.id)}>
                          <Microscope className="h-3.5 w-3.5" /> მიმდინარე ლიტერატურის მოძიება
                        </button>
                      )}
                      {evidence[e.id] === 'loading' && <Skeleton lines={2} />}
                      {evidence[e.id] === 'empty' && (
                        <p className="text-[11px] text-slate-500">სათაურში ამ პრეპარატის მოხსენიებით პუბლიკაცია ვერ მოიძებნა.</p>
                      )}
                      {Array.isArray(evidence[e.id]) && (
                        <ul className="space-y-1.5">
                          {(evidence[e.id] as Citation[]).map((c) => (
                            <li key={c.url} className="rounded-md border border-line bg-ink-950/50 p-2.5">
                              <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[12px] leading-snug text-slate-200 hover:text-cyan hover:underline">
                                {c.title}
                              </a>
                              <p className="mt-1 font-mono text-[10px] text-slate-500">
                                {TIER_LABEL_KA[c.evidenceTier] ?? c.evidenceTier} · {c.journal ?? '—'} · {c.year ?? '—'}
                                {c.doi ? ` · doi:${c.doi}` : ''}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{result.registryNoteKa}</p>
            </Panel>
          )}

          {result.interactions.length > 0 && (
            <Panel title="ურთიერთქმედებები" subtitle="ეტიკეტის საკუთარი ფორმულირებით — სიმძიმეს აფასებს ექიმი">
              <div className="space-y-2">
                {result.interactions.map((i, idx) => (
                  <div key={`${i.a}-${i.b}-${idx}`} className={cn('rounded-lg border p-3', i.severityHint === 'boxed' ? TONE_CLASS.critical : TONE_CLASS.moderate)}>
                    <div className="flex items-center gap-2">
                      {i.severityHint === 'boxed' ? <ShieldAlert className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                      <p className="text-[13px] font-medium text-fg">
                        {i.a} ↔ {i.b}
                      </p>
                      <Badge>{i.via === 'name' ? 'პირდაპირი' : 'ჯგუფით'}</Badge>
                    </div>
                    <p className="mt-1.5 text-[12px] text-slate-300">{i.evidenceKa}</p>
                    <Collapsible title="ეტიკეტის ციტატა">
                      <p className="text-[11px] leading-relaxed text-slate-400">{i.excerpt}</p>
                    </Collapsible>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {result.tapers.length > 0 && (
            <Panel title="ტიტრაციის გეგმები" subtitle="პოლიფარმაციის მართვის პროგრამის სქემები">
              <div className="space-y-2">
                {result.tapers.map((t) => (
                  <div key={t.groupKa} className="rounded-lg border border-line bg-ink-850/40 p-3">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 shrink-0 text-cyan" />
                      <p className="text-[13px] font-medium text-slate-100">{t.groupKa}</p>
                    </div>
                    <div className="mt-2 grid gap-1 text-[12px] text-slate-300 sm:grid-cols-3">
                      <p>
                        <span className="label mr-1">ტემპი:</span>
                        {t.rateKa}
                      </p>
                      <p>
                        <span className="label mr-1">ხანგრძლივობა:</span>
                        {t.durationKa}
                      </p>
                      <p>
                        <span className="label mr-1">შენიშვნა:</span>
                        {t.noteKa}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {result.identities && result.identities.length > 0 && (
            <Panel title="ინსტრუქციები და დოზა" subtitle="მხოლოდ კონკრეტული, დადასტურებული პროდუქტისთვის">
              <IdentityRequired mentions={result.identities.filter((m) => !result.lowValue.some((l) => l.matched && m.input.toLowerCase().includes(l.matched.toLowerCase())))} />
              {result.identityNoteKa && <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{result.identityNoteKa}</p>}
              {(result.unresolved?.length ?? 0) > 0 && (
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  ზუსტად ვერ მოიძებნა: {result.unresolved!.join(' · ')}. ჩაწერეთ შემადგენლობა ან ზუსტი სახელი შეფუთვიდან — სხვა წამლით არ ჩავანაცვლებთ.
                </p>
              )}
            </Panel>
          )}

          {result.lowValue.length === 0 && result.interactions.length === 0 && !result.ageWarnings?.length && (
            <EmptyState
              title="დაბალი ღირებულების მედიკამენტი ვერ მოიძებნა"
              description="ეს არ ნიშნავს, რომ სქემა ოპტიმალურია — ნიშნავს, რომ რეესტრში შესული აგენტი სიაში არ არის. შეაფასეთ ჩვენება, დოზა და დუბლიკაცია ცალკე."
            />
          )}

          <div className="flex gap-2.5 rounded-lg border border-line bg-ink-950/60 p-3.5">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-[12px] leading-relaxed text-slate-400">{result.disclaimerKa}</p>
          </div>
        </>
      )}

      {registry && !simple && (
        <Panel
          title="დაბალი ღირებულების პრეპარატების რეესტრი"
          subtitle={`${registry.stats.entries} პრეპარატი/ჯგუფი, რომლის ეფექტიანობა სადავოა ან დაუდასტურებელია · ${registry.stats.withNamedReference} დასახელებული წყაროთი. ეს არ არის მედიკამენტების ბაზა — სრული ძიება: „მედიკამენტის ძიება“`}
          actions={
            <button type="button" className="btn btn-ghost text-xs" onClick={() => setShowRegistry((v) => !v)}>
              {showRegistry ? 'დამალვა' : 'ჩვენება'}
            </button>
          }
        >
          {showRegistry ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {registry.entries.map((e) => (
                <div key={e.id} className="rounded-lg border border-line bg-ink-850/40 p-3">
                  <p className="text-[13px] font-medium text-slate-100">{e.nameKa}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{e.brandsGe.slice(0, 4).join(' · ')}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge tone={e.tone === 'critical' ? 'critical' : e.tone === 'high' ? 'high' : 'moderate'}>{e.gradeKa}</Badge>
                    <Badge>{e.categoryKa}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-slate-400">
              რეესტრი აფასებს მტკიცებულებასა და რეგულატორულ სტატუსს. სადაც საერთაშორისო შეფასება არ არსებობს, ეს პირდაპირ წერია — მტკიცებულების არარსებობა არ არის უეფექტურობის დადასტურება.
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className={cn('rounded-lg border p-3', TONE_CLASS[tone])}>
      <p className="text-2xl font-semibold text-fg">{value}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-300">{label}</p>
    </div>
  );
}
