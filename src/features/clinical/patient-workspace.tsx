'use client';

import { confirmationExtras, readConfirmedAll } from '@/features/meds/confirmed-store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, ArrowUpRight, CheckCircle2, Clock, HeartPulse, MessageCircleQuestion, Phone, Send } from 'lucide-react';
import { useRole } from '@/features/settings/role-store';
import { Badge, Bullets, Collapsible, ErrorState, ExportBar, Panel, Skeleton } from '@/components/ui/primitives';
import type { OrchestrateResult } from './answer-view';
import { cn } from '@/lib/utils';
import { WhatsAppIcon } from '@/components/layout/whatsapp-button';
import { CONTACT_INTRO_KA, WHATSAPP_DISPLAY, whatsappLink } from '@/lib/contact';
import { intakeEmergency, intakeQuestions, intakeSummaryKa, missingDetail, type IntakeAnswers, type IntakeQuestion } from '@/lib/patient-intake';
import { emptyPatientContext } from '@/schemas/clinical';
import { AgeWarningBox, DrugSummaryCard, IdentityRequired, type AgeWarning, type IdentityMention } from '@/features/meds/drug-summary-card';

/** Products confirmed on the medication page (references only; the server re-checks them). */
function confirmedRef(): Record<string, unknown> {
  return confirmationExtras(readConfirmedAll());
}

/**
 * PATIENT AI — a conversation, not a form.
 *
 *   1. The person writes in their own words — a few words are enough.
 *   2. The app asks back only what changes the answer (one tap each, all
 *      optional): is it diagnosed, when did it start, is a danger sign present.
 *      A danger sign shows the 112 call button immediately.
 *   3. The answer leads with WHAT TO DO and how soon, then explains.
 *   4. A follow-up question keeps the context.
 *
 * Intake runs in the browser; nothing is sent until "get the answer".
 */

const STARTERS: { labelKa: string; textKa: string }[] = [
  { labelKa: 'სიმპტომი მაწუხებს', textKa: 'მაწუხებს ' },
  { labelKa: 'რას ნიშნავს ჩემი დიაგნოზი', textKa: 'რას ნიშნავს დიაგნოზი: ' },
  { labelKa: 'ჩემი ანალიზის პასუხი', textKa: 'ამიხსენი ჩემი ანალიზის პასუხი: ' },
  { labelKa: 'ჩემი წამლები', textKa: 'რისთვის მაქვს დანიშნული და როგორ მივიღო: ' },
  { labelKa: 'როდის არის გადაუდებელი', textKa: 'რა ნიშნებზე უნდა მივმართო სასწრაფოდ?' },
];

type Stage = 'ask' | 'clarify' | 'answer';

const URGENCY_STYLE: Record<string, { tone: string; icon: typeof AlertTriangle }> = {
  emergency: { tone: 'border-clinical-critical/60 bg-clinical-critical/12', icon: AlertTriangle },
  today: { tone: 'border-clinical-moderate/55 bg-clinical-moderate/10', icon: Clock },
  soon: { tone: 'border-clinical-moderate/55 bg-clinical-moderate/10', icon: Clock },
  routine: { tone: 'border-clinical-low/45 bg-clinical-low/8', icon: CheckCircle2 },
};

function Call112({ className }: { className?: string }) {
  return (
    <a href="tel:112" className={cn('btn border-clinical-critical/60 bg-clinical-critical/20 text-fg hover:bg-clinical-critical/30', className)}>
      <Phone className="h-4 w-4" /> დარეკვა 112
    </a>
  );
}

export function PatientWorkspace() {
  // A patient's question is about the patient asking it. The clinician's case
  // in this browser (a demo AF patient, say) must never leak into the answer.
  const patient = useMemo(() => emptyPatientContext(), []);
  const { authHeaders } = useRole();
  const [stage, setStage] = useState<Stage>('ask');
  const [text, setText] = useState('');
  const [questions, setQuestions] = useState<IntakeQuestion[]>([]);
  const [answers, setAnswers] = useState<IntakeAnswers>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiOff, setAiOff] = useState(false);
  const [result, setResult] = useState<OrchestrateResult | null>(null);
  const [history, setHistory] = useState<{ question: string; answer: string }[]>([]);
  const [followUp, setFollowUp] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const danger = intakeEmergency(answers);
  const missingRequired = questions.some((q) => q.freeText?.required && !String(answers[q.id] ?? '').trim());

  const reset = () => {
    setStage('ask');
    setText('');
    setQuestions([]);
    setAnswers({});
    setResult(null);
    setError(null);
    setHistory([]);
    setFollowUp('');
  };

  const send = async (question: string, ans: IntakeAnswers, qs: IntakeQuestion[], previous: { question: string; answer: string }[]) => {
    setLoading(true);
    setError(null);
    setAiOff(false);
    const summary = intakeSummaryKa(ans, qs);
    const full = `${question.trim()}${summary ? `\n\nდამატებითი ინფორმაცია: ${summary}.` : ''}`;
    // Earlier turns go as context so a follow-up stays about the same thing.
    const conversation = previous.slice(-4);
    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ question: full, mode: 'patient', patient, extras: { intake: { answers: ans }, ...(conversation.length ? { conversation } : {}), ...confirmedRef() } }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAiOff(json.error === 'AI_NOT_CONFIGURED');
        setError(json.messageKa ?? 'პასუხი ვერ მომზადდა.');
        if (json.error === 'NEEDS_DETAIL') {
          const need = missingDetail(question) ?? { id: 'detail' as const, textKa: 'დააზუსტეთ, რა გაინტერესებთ', freeText: { placeholderKa: 'მაგ.: რას ნიშნავს ჰიპოთირეოზი?', required: true } };
          setError(null);
          setText(question.split(/\n\s*დამატებითი ინფორმაცია:/)[0]);
          setQuestions([need]);
          setAnswers({});
          setStage('clarify');
          return;
        }
        if (json.error === 'NEEDS_PATIENT_DATA') {
          // Ask for exactly the missing value instead of a dead end.
          setQuestions([{ id: 'labvalues', textKa: 'ჩაწერეთ ანალიზის დასახელება და შედეგი — ისე, როგორც ფურცელზე წერია', freeText: { placeholderKa: 'მაგ.: ჰემოგლობინი 9.8, ფერიტინი 8', required: true } }]);
          setStage('clarify');
        }
        return;
      }
      setResult(json as OrchestrateResult);
      setHistory([...previous, { question: question.trim(), answer: (json as OrchestrateResult).answer.bottomLine }]);
      setStage('answer');
    } catch {
      setError('სერვერთან კავშირი ვერ დამყარდა. სცადეთ თავიდან.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const onNew = () => reset();
    window.addEventListener('gmai:new-question', onNew);
    return () => window.removeEventListener('gmai:new-question', onNew);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Entry points: ?q= from the home page runs at once, ?start=diagnosis
  // opens with the matching starter.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get('q');
    if (q) {
      setText(q);
      const need = missingDetail(q);
      const qs = need ? [need] : intakeQuestions(q);
      if (qs.length) {
        setQuestions(qs);
        setStage('clarify');
      } else {
        void send(q, {}, [], []);
      }
      return;
    }
    if (sp.get('start') === 'diagnosis') {
      setText(STARTERS[1].textKa);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * One decision for every way forward: a question that names nothing gets
   * the one question that fills the gap; a filled gap joins the person's text
   * and the usual intake follows; otherwise the answer is requested.
   */
  const proceed = (currentText: string, ans: IntakeAnswers, qs: IntakeQuestion[]) => {
    const askedDetail = qs.length === 1 && qs[0].id === 'detail' && qs[0].freeText?.required;
    if (askedDetail && typeof ans.detail === 'string' && ans.detail.trim()) {
      const joined = `${currentText.trim()} ${ans.detail.trim()}`;
      setText(joined);
      const more = intakeQuestions(joined).filter((q) => q.id !== 'topic' && q.id !== 'detail');
      setAnswers({});
      if (more.length) {
        setQuestions(more);
        setStage('clarify');
        return;
      }
      setQuestions([]);
      void send(joined, {}, [], history);
      return;
    }
    const need = missingDetail(currentText, ans);
    if (need) {
      setQuestions([need]);
      setAnswers({});
      setStage('clarify');
      return;
    }
    void send(currentText, ans, qs, history);
  };

  const next = () => {
    if (text.trim().length < 2) {
      inputRef.current?.focus();
      return;
    }
    setAnswers({});
    setResult(null);
    const need = missingDetail(text);
    if (need) {
      setQuestions([need]);
      setStage('clarify');
      return;
    }
    const qs = intakeQuestions(text);
    if (qs.length) {
      setQuestions(qs);
      setStage('clarify');
    } else {
      setQuestions([]);
      void send(text, {}, [], history);
    }
  };

  const pick = (q: IntakeQuestion, value: string) => {
    setAnswers((prev) => {
      if (!q.multi) return { ...prev, [q.id]: prev[q.id] === value ? undefined : value };
      const cur = Array.isArray(prev[q.id]) ? (prev[q.id] as string[]) : [];
      if (value === 'none') return { ...prev, [q.id]: cur.includes('none') ? [] : ['none'] };
      const without = cur.filter((v) => v !== 'none');
      return { ...prev, [q.id]: without.includes(value) ? without.filter((v) => v !== value) : [...without, value] };
    });
  };
  const isPicked = (q: IntakeQuestion, value: string) => {
    const v = answers[q.id];
    return Array.isArray(v) ? v.includes(value) : v === value;
  };

  const a16 = result?.agentResults.find((a) => a.agentId === 'A16');
  const a07 = result?.agentResults.find((a) => a.agentId === 'A07' && a.status === 'ok');
  const a07Data = (a07?.data ?? {}) as { confirmedProduct?: { query: string; recordId: number; token: string }; confirmedProducts?: { query: string; recordId: number; token: string; region: 'US' | 'EU' }[]; identityRequired?: IdentityMention[]; ageWarnings?: AgeWarning[]; ageYears?: number };
  const a07Early = (result?.agentResults.find((a) => a.agentId === 'A07' && a.status === 'ok')?.data ?? {}) as { ageWarnings?: { level: string }[] };
  // A drug that must not be given at this age is a same-day call to the
  // doctor, whatever the condition card would say about a routine visit.
  const ageBlock = !result?.answer.emergency && (a07Early.ageWarnings ?? []).some((w) => w.level === 'contraindicated' || w.level === 'avoid');
  const baseUrgency = (a16?.data as { urgency?: string } | undefined)?.urgency ?? (result?.answer.emergency ? 'emergency' : 'routine');
  const urgency = ageBlock && (baseUrgency === 'routine' || baseUrgency === 'soon') ? 'today' : baseUrgency;
  const a16Action = a16?.sections.find((s) => s.titleEn.startsWith('Action:'));
  const actionSection = ageBlock && a16Action && urgency !== baseUrgency
    ? { ...a16Action, titleKa: 'ჯერ ნუ მისცემთ — დაუკავშირდით ექიმს დღესვე', body: 'ეს წამალი ამ ასაკში არ უნდა დაინიშნოს. თუ ბავშვი უკვე იღებს, უეცრად ნუ შეწყვეტთ — ექიმი გეტყვით, როგორ შეიცვალოს.', bullets: [] }
    : a16Action;
  const infoSections = useMemo(() => (a16?.sections ?? []).filter((s) => !s.titleEn.startsWith('Action:') && ((s.body.trim() && s.body.trim() !== '—') || s.bullets.length)), [a16]);
  const md = a16
    ? `# ${history[history.length - 1]?.question ?? ''}\n\n${result?.answer.bottomLine ?? ''}\n\n${a16.sections.map((s) => `## ${s.titleKa}\n${s.body}\n${s.bullets.map((b) => `- ${b}`).join('\n')}`).join('\n\n')}\n\n_ეს არ ცვლის ექიმთან კონსულტაციას._`
    : '';
  const style = URGENCY_STYLE[urgency] ?? URGENCY_STYLE.routine;
  const UrgIcon = style.icon;

  const AskDoctor = ({ titleKa, bodyKa }: { titleKa: string; bodyKa: string }) => (
    <Panel>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#25D366]/15 text-[#25D366]">
          <WhatsAppIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-100">{titleKa}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{bodyKa}</p>
        </div>
        <a
          href={whatsappLink(text.trim() ? `${CONTACT_INTRO_KA} ${text.trim()}` : CONTACT_INTRO_KA)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn shrink-0 border-[#25D366]/45 bg-[#25D366]/10 text-fg hover:bg-[#25D366]/20"
        >
          <WhatsAppIcon className="h-4 w-4 text-[#25D366]" /> მოწერა WhatsApp-ით
          <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
        </a>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{WHATSAPP_DISPLAY} · კითხვა ავტომატურად გადაიტანება შეტყობინებაში</p>
    </Panel>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* 1 — the question, in the person's own words */}
      {stage === 'ask' && (
        <Panel title="რა გაწუხებთ?" subtitle="დაწერეთ თქვენი სიტყვებით — რამდენიმე სიტყვაც საკმარისია. საჭიროების შემთხვევაში დაგისვამთ 2–3 მოკლე კითხვას.">
          <textarea
            ref={inputRef}
            className="field min-h-[110px] resize-y text-[15px]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                next();
              }
            }}
            placeholder="მაგ.: გაფანტული სკლეროზი მაქვს და 2 დღეა საგნები ორად მეჩვენება"
            aria-label="თქვენი კითხვა"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {STARTERS.map((s) => (
              <button
                key={s.labelKa}
                type="button"
                onClick={() => {
                  setText(s.textKa);
                  requestAnimationFrame(() => {
                    const el = inputRef.current;
                    if (el) {
                      el.focus();
                      el.setSelectionRange(s.textKa.length, s.textKa.length);
                    }
                  });
                }}
                className="rounded-full border border-line px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan/40 hover:text-fg"
              >
                {s.labelKa}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" className="btn btn-primary" onClick={next} disabled={loading || text.trim().length < 2}>
              შემდეგი <ArrowRight className="h-4 w-4" />
            </button>
            <span className="text-[11px] text-slate-500">Enter — გაგრძელება</span>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">სერვისი არ სვამს დიაგნოზს და არ ნიშნავს მედიკამენტს. გადაუდებელ შემთხვევაში დარეკეთ 112-ზე.</p>
        </Panel>
      )}

      {/* 2 — a few one-tap questions */}
      {stage === 'clarify' && (
        <Panel title="რამდენიმე სწრაფი კითხვა" subtitle="პასუხები ზუსტ რჩევას მოგცემთ. ყველა კითხვა სურვილისამებრია.">
          <p className="mb-3 rounded-lg border border-line bg-ink-850/50 px-3 py-2 text-sm text-slate-300">„{text.trim()}“</p>
          <div className="space-y-4">
            {questions.map((q) => (
              <div key={q.id}>
                <p className="mb-1.5 text-[14px] font-medium text-slate-100">
                  {q.textKa}
                  {q.multi && <span className="ml-1 text-[11px] font-normal text-slate-500">(შეიძლება რამდენიმე)</span>}
                </p>
                {q.options && (
                  <div className="flex flex-wrap gap-1.5">
                    {q.options.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={isPicked(q, o.value)}
                        onClick={() => pick(q, o.value)}
                        className={cn(
                          'rounded-full border px-3 py-2 text-[13px] transition',
                          isPicked(q, o.value)
                            ? o.danger
                              ? 'border-clinical-critical/70 bg-clinical-critical/20 text-fg'
                              : 'border-cyan/60 bg-cyan/15 text-fg'
                            : 'border-line text-slate-300 hover:border-cyan/40 hover:text-fg',
                        )}
                      >
                        {o.labelKa}
                      </button>
                    ))}
                  </div>
                )}
                {q.freeText && (
                  <textarea
                    className="field mt-1.5 min-h-[64px] resize-y"
                    value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
                    onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                    placeholder={q.freeText.placeholderKa}
                  />
                )}
              </div>
            ))}
          </div>

          {danger && (
            <div className="mt-4 flex flex-col gap-2 rounded-lg border border-clinical-critical/60 bg-clinical-critical/12 p-3 sm:flex-row sm:items-center">
              <AlertTriangle className="h-5 w-5 shrink-0 text-clinical-critical" />
              <p className="flex-1 text-sm font-medium text-fg">ეს ნიშანი შეიძლება საშიში იყოს. დარეკეთ 112-ზე ახლავე — ახსნას შემდეგ წაიკითხავთ.</p>
              <Call112 />
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary" disabled={loading || missingRequired} onClick={() => proceed(text, answers, questions)}>
              <Send className="h-4 w-4" /> პასუხის მიღება
            </button>
            {!missingRequired && (
              <button type="button" className="btn" disabled={loading} onClick={() => proceed(text, {}, [])}>
                გამოტოვება
              </button>
            )}
            <button type="button" className="btn" disabled={loading} onClick={() => setStage('ask')}>
              კითხვის შეცვლა
            </button>
            {missingRequired && (
              <span className="text-[12px] text-slate-500">
                {questions.some((q) => q.id === 'labvalues') ? 'ანალიზის ახსნისთვის შედეგი საჭიროა — გამოგონილ ციფრებს არ დაგიწერთ.' : 'შეავსეთ ველი — უამისოდ პასუხი ზოგადი და არასწორი იქნებოდა.'}
              </span>
            )}
          </div>
        </Panel>
      )}

      {loading && (
        <Panel>
          <p className="mb-2 text-sm text-slate-400">ვამზადებ პასუხს…</p>
          <Skeleton lines={6} />
        </Panel>
      )}
      {error && !loading && !aiOff && <ErrorState title="პასუხი ვერ მომზადდა" detail={error} />}
      {aiOff && !loading && (
        <>
          <Panel title="ავტომატური პასუხი ამჟამად გამორთულია">
            <p className="text-sm leading-relaxed text-slate-300">{error}</p>
          </Panel>
          <AskDoctor titleKa="დაუსვით კითხვა პირდაპირ ექიმს" bodyKa="თქვენი კითხვა გადაეგზავნება ექიმს WhatsApp-ით და პასუხს ის თავად მოგწერთ." />
        </>
      )}

      {/* 3 — what to do first, then the explanation */}
      {stage === 'answer' && !loading && a16 && result && (
        <>
          {actionSection && (
            <section className={cn('rounded-xl border p-4', style.tone)}>
              <div className="flex items-start gap-3">
                <UrgIcon className={cn('mt-0.5 h-5 w-5 shrink-0', urgency === 'emergency' ? 'text-clinical-critical' : urgency === 'routine' ? 'text-clinical-low' : 'text-clinical-moderate')} />
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold text-fg">{actionSection.titleKa}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-200">{actionSection.body}</p>
                  {actionSection.bullets.length > 0 && <Bullets items={actionSection.bullets} className="mt-2" />}
                </div>
                {urgency === 'emergency' && <Call112 className="shrink-0" />}
              </div>
            </section>
          )}

          {a07Data.ageWarnings && a07Data.ageWarnings.length > 0 && <AgeWarningBox warnings={a07Data.ageWarnings} />}

          <Panel
            title="პასუხი"
            actions={
              <div className="flex items-center gap-1.5">
                <Badge tone="info">
                  <HeartPulse className="h-3 w-3" /> პაციენტის რეჟიმი
                </Badge>
                <ExportBar text={md} json={result} filename="patient-answer" onClear={reset} clearLabelKa="ახალი კითხვა" />
              </div>
            }
          >
            <p className="mb-4 whitespace-pre-line text-[15.5px] leading-relaxed text-slate-100">{result.answer.bottomLine}</p>
            <div className="space-y-2">
              {infoSections.map((s, i) => (
                <Collapsible key={`${s.titleEn}-${i}`} title={s.titleKa} tone={s.titleEn === 'Red flags' ? 'critical' : s.titleEn === 'Your symptoms' ? 'warning' : 'neutral'} defaultOpen={i < 2 || s.titleEn === 'Red flags'}>
                  {s.body.trim() && s.body.trim() !== '—' && <p className="mb-2 whitespace-pre-line text-sm leading-relaxed text-slate-300">{s.body}</p>}
                  {s.bullets.length > 0 && <Bullets items={s.bullets} />}
                </Collapsible>
              ))}
            </div>
            {result.sources.some((s) => s.source_type !== 'legal' && s.source_type !== 'regulatory') ? (
              <div className="mt-3">
                <p className="label mb-1">წყაროები</p>
                <Bullets items={result.sources.filter((s) => s.source_type !== 'legal' && s.source_type !== 'regulatory').map((s) => s.citation_text)} />
              </div>
            ) : (
              <p className="mt-3 text-[12px] leading-relaxed text-slate-500">ამ პასუხისთვის ჩვენს წყაროების რეესტრში შესაბამისი სამეცნიერო წყარო არ მოიძებნა — ეს ზოგადი ინფორმაციაა და ექიმის კონსულტაციას არ ცვლის.</p>
            )}
          </Panel>

          {(a07Data.confirmedProducts ?? (a07Data.confirmedProduct ? [{ ...a07Data.confirmedProduct, region: 'US' as const }] : [])).map((p) => (
            <Panel key={p.recordId} title={`წამლის შესახებ — მარტივად · ${p.region === 'EU' ? 'ევროპული ინსტრუქცია (EMA)' : 'აშშ-ის ინსტრუქცია (FDA)'}`} subtitle="დადასტურებული პროდუქტის ინსტრუქციის ქართული შეჯამება (თარგმანი)">
              <DrugSummaryCard product={p} autoLoad />
            </Panel>
          ))}
          {!a07Data.confirmedProduct && a07Data.identityRequired && a07Data.identityRequired.length > 0 && <IdentityRequired mentions={a07Data.identityRequired} />}

          {/* 4 — keep talking */}
          <Panel title="კიდევ რამე გაინტერესებთ?" subtitle="კითხვა წინა პასუხის კონტექსტში დაისმება" actions={<button type="button" className="btn text-xs" onClick={reset}>ახალი თემა</button>}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="field"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && followUp.trim()) {
                    const f = followUp;
                    setFollowUp('');
                    setText(f);
                    void send(f, {}, [], history);
                  }
                }}
                placeholder="მაგ.: რა წამლით მკურნალობენ? შემიძლია ვიმუშაო?"
              />
              <button
                type="button"
                className="btn btn-primary shrink-0"
                disabled={loading || !followUp.trim()}
                onClick={() => {
                  const f = followUp;
                  setFollowUp('');
                  setText(f);
                  void send(f, {}, [], history);
                }}
              >
                <MessageCircleQuestion className="h-4 w-4" /> კითხვა
              </button>
            </div>
            <button type="button" className="mt-2 text-xs text-slate-400 underline-offset-2 hover:text-fg hover:underline" onClick={reset}>
              ახალი თემის დაწყება
            </button>
          </Panel>

          <AskDoctor titleKa="გსურთ ექიმთან პირდაპირ დაკავშირება?" bodyKa="ავტომატური პასუხი კონსულტაციას არ ცვლის — ექიმი პასუხს WhatsApp-ით მოგწერთ." />
        </>
      )}
    </div>
  );
}
