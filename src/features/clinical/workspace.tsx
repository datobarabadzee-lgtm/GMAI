'use client';

import { AttestationBox } from '@/features/settings/attestation-box';
import { SESSION_CLEARED_EVENT } from '@/features/settings/session-clear';
import { clearConfirmed, confirmationExtras, readConfirmedAll, regionKa, type ConfirmedRef } from '@/features/meds/confirmed-store';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowUp, ChevronDown, RotateCcw, Sparkles, UserRound, X } from 'lucide-react';
import { AnswerView, type OrchestrateResult } from './answer-view';
import { ClinicalContextPanel } from '@/features/case/context-panel';
import { ErrorState, Skeleton } from '@/components/ui/primitives';
import { useCase } from '@/features/case/case-store';
import { useRole } from '@/features/settings/role-store';
import { DEMO_CASES } from '@/knowledge/demo-cases';
import type { ClinicalMode } from '@/schemas/clinical';
import { cn, uid } from '@/lib/utils';

const MODES: { id: ClinicalMode; labelKa: string }[] = [
  { id: 'quick', labelKa: 'სწრაფი პასუხი' },
  { id: 'deep', labelKa: 'ღრმა ანალიზი' },
  { id: 'evidence', labelKa: 'მტკიცებულება' },
  { id: 'challenge', labelKa: 'ჩემი გეგმის შემოწმება' },
  { id: 'missing', labelKa: 'რა გამომრჩა?' },
  { id: 'second-opinion', labelKa: 'მეორე აზრი' },
  { id: 'quality', labelKa: 'ხარისხის მიმოხილვა' },
];

const EXAMPLES = [
  '81 წ. ქალი, AF, eGFR 32, ორი დაცემა — რომელი ანტიკოაგულანტი და რა დოზით?',
  '68 წ. მამაკაცი, 40-წუთიანი მარჯვენა მხრის სისუსტე, სრული რეგრესი — შემდეგი ნაბიჯები?',
  'ჰიპონატრიემია 124 მმოლ/ლ, ესციტალოპრამზე — როგორ ვმართო?',
];

type Turn = {
  id: string;
  question: string;
  mode: ClinicalMode;
  result?: OrchestrateResult;
  error?: { title: string; detail?: string };
};

// v3 (2026-10-19): threads saved before the medication identity gate may hold
// answers built on a name-matched label (Colomycin → colchicine); they are not
// read any more.
const KEY = 'gmai.clinical.thread.v3';
export { MED_KEY } from '@/features/meds/confirmed-store';

/**
 * CLINICAL AI — a conversation, not a form.
 *
 * The first answer is rarely the last question. Every follow-up is sent with
 * the earlier turns (question + verified bottom line), so „და თუ eGFR 25-ია?"
 * is understood as being about the same patient and drug.
 */
export function ClinicalWorkspace() {
  const params = useSearchParams();
  const { patient, setPatient } = useCase();
  const { authHeaders } = useRole();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [plan, setPlan] = useState('');
  const [mode, setMode] = useState<ClinicalMode>('quick');
  const [loading, setLoading] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // A product confirmed on the medication page. Only a reference travels; the
  // server checks it against its own receipt and this browser's session.
  const [meds, setMeds] = useState<ConfirmedRef[]>([]);
  useEffect(() => {
    setMeds(readConfirmedAll());
    try {
      sessionStorage.removeItem('gmai.clinical.thread.v2');
    } catch {
      /* ignore */
    }
  }, []);
  const bootstrapped = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const patientFilled = Boolean(patient.age !== null || patient.narrative.trim() || patient.problems.length || patient.medications.length || patient.labs.length);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setTurns(JSON.parse(raw) as Turn[]);
    } catch {
      /* ignore */
    }
  }, []);
  // Consent withdrawal / „clear session" removes the thread and confirmed products from memory too.
  useEffect(() => {
    const onClear = () => {
      setTurns([]);
      setMeds([]);
    };
    window.addEventListener(SESSION_CLEARED_EVENT, onClear);
    return () => window.removeEventListener(SESSION_CLEARED_EVENT, onClear);
  }, []);

  const save = (next: Turn[]) => {
    setTurns(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next.slice(-12)));
    } catch {
      /* ignore */
    }
  };

  const ask = async (question: string, m: ClinicalMode = mode, history: Turn[] = turns, p = patient) => {
    const q = question.trim();
    if (!q && !p.narrative.trim()) {
      inputRef.current?.focus();
      return;
    }
    const turn: Turn = { id: uid(), question: q || 'ქეისის ანალიზი', mode: m };
    const pending = [...history, turn];
    setTurns(pending);
    setDraft('');
    setLoading(true);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

    // Earlier turns travel as context: the question and the bottom line that
    // was actually shown (already verified), never the raw agent output.
    const conversation = history.filter((t) => t.result).slice(-4).map((t) => ({ question: t.question, answer: t.result!.answer.bottomLine }));

    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          question: q,
          mode: m,
          plan: m === 'challenge' ? plan : '',
          patient: p,
          extras: conversation.length || meds.length ? { ...(conversation.length ? { conversation } : {}), ...confirmationExtras(meds) } : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        turn.error = {
          title: json.error === 'AI_UNAVAILABLE' ? 'AI ამჟამად მიუწვდომელია' : json.error === 'INSUFFICIENT_INPUT' ? 'არასაკმარისი მონაცემი' : json.error === 'PROCESSING_BASIS_REQUIRED' ? 'საჭიროა დადასტურება' : 'პასუხი ვერ მომზადდა',
          detail: json.messageKa,
        };
      } else {
        turn.result = json as OrchestrateResult;
      }
    } catch {
      turn.error = { title: 'ქსელური შეცდომა', detail: 'სერვერთან კავშირი ვერ დამყარდა. სცადეთ თავიდან.' };
    } finally {
      save([...history, { ...turn }]);
      setLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  // Entry points: ?q= from the home page, ?mode=, ?demo= for the sample cases.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    const m = params.get('mode') as ClinicalMode | null;
    const chosen = m && MODES.some((x) => x.id === m) ? m : 'quick';
    setMode(chosen);
    const demo = DEMO_CASES.find((d) => d.id === params.get('demo'));
    if (demo) {
      setPatient(demo.patient);
      void ask(demo.suggestedQuestion, 'deep', [], demo.patient);
      return;
    }
    const q = params.get('q');
    if (q) void ask(q, chosen, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newConversation = () => {
    save([]);
    setDraft('');
    setExpanded({});
    inputRef.current?.focus();
  };

  useEffect(() => {
    const onNew = () => newConversation();
    window.addEventListener('gmai:new-question', onNew);
    return () => window.removeEventListener('gmai:new-question', onNew);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const last = turns[turns.length - 1];
  const modeLabel = MODES.find((x) => x.id === mode)?.labelKa;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold text-fg">კლინიკური AI</h1>
        <button type="button" onClick={() => setContextOpen((o) => !o)} className={cn('btn text-[13px]', patientFilled && 'border-cyan/50 text-cyan')}>
          <UserRound className="h-4 w-4" />
          {patientFilled ? patient.label || 'პაციენტის მონაცემები' : 'პაციენტის მონაცემები'}
        </button>
        {turns.length > 0 && (
          <button type="button" onClick={newConversation} className="btn text-[13px]">
            <RotateCcw className="h-4 w-4" /> ახალი საუბარი
          </button>
        )}
      </div>

      {contextOpen && (
        <div className="mb-5 rounded-2xl border border-line bg-ink-900 p-4 shadow-panel">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[15px] font-semibold text-fg">პაციენტის მონაცემები</p>
            <button type="button" onClick={() => setContextOpen(false)} aria-label="დახურვა" className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-ink-850">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-3 text-[13px] text-slate-400">არასავალდებულო. რაც აქ ჩაწერთ, გამოიყენება ყველა მომდევნო კითხვაში — ასაკი, წონა, კრეატინინი, წამლები, ანალიზები.</p>
          <ClinicalContextPanel />
        </div>
      )}

      {turns.length === 0 && !loading && (
        <div className="py-10 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-cyan/10 text-cyan">
            <Sparkles className="h-6 w-6" />
          </span>
          <p className="mt-4 text-lg font-semibold text-fg">დასვით კლინიკური კითხვა</p>
          <p className="mx-auto mt-1.5 max-w-lg text-[14px] text-slate-400">პასუხის შემდეგ შეგიძლიათ გააგრძელოთ საუბარი — დამატებითი კითხვა იგივე პაციენტის კონტექსტში დაისმება.</p>
          <div className="mx-auto mt-6 flex max-w-2xl flex-col gap-2">
            {EXAMPLES.map((x) => (
              <button key={x} type="button" onClick={() => void ask(x)} className="rounded-2xl border border-line bg-ink-900 px-4 py-3 text-left text-[14px] text-slate-300 transition hover:border-cyan/50 hover:text-fg">
                {x}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {turns.map((t, i) => {
          const isLast = i === turns.length - 1;
          const open = isLast || expanded[t.id];
          return (
            <div key={t.id} ref={isLast ? endRef : undefined} className="scroll-mt-24 space-y-3">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-3xl rounded-br-md bg-navy px-4 py-3 text-[15px] leading-relaxed text-white">
                  {t.question}
                  {t.mode !== 'quick' && <span className="mt-1 block text-[11px] text-cyan-brand">{MODES.find((x) => x.id === t.mode)?.labelKa}</span>}
                </div>
              </div>

              {isLast && loading && !t.result && !t.error && (
                <div className="rounded-2xl border border-line bg-ink-900 p-5">
                  <p className="mb-3 flex items-center gap-2 text-[13px] text-slate-400">
                    <Sparkles className="h-4 w-4 animate-pulse-soft text-cyan" /> ვამოწმებ წყაროებს და ვამზადებ პასუხს…
                  </p>
                  <Skeleton lines={4} />
                </div>
              )}

              {t.error && <ErrorState title={t.error.title} detail={t.error.detail} />}

              {t.result &&
                (open ? (
                  <AnswerView result={t.result} onClear={newConversation} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [t.id]: true }))}
                    className="block w-full rounded-2xl border border-line bg-ink-900 p-4 text-left transition hover:border-cyan/40"
                  >
                    <p className="line-clamp-3 text-[14px] leading-relaxed text-slate-300">{t.result.answer.bottomLine}</p>
                    <p className="mt-2 text-[12px] font-medium text-cyan">სრული პასუხი →</p>
                  </button>
                ))}
            </div>
          );
        })}
      </div>

      {/* Composer — always at hand, above the phone tab bar. */}
      <div className="sticky bottom-[76px] z-20 mt-6 lg:bottom-4">
        <div className="rounded-3xl border border-line bg-ink-900 p-2 shadow-panel">
          <div className="mb-2 px-1">
            <AttestationBox needed={patientFilled} />
          </div>
          {meds.map((med) => (
            <div key={med.region} className="mb-2 flex flex-wrap items-center gap-2 rounded-2xl bg-ink-850 px-3 py-2 text-[12.5px]">
              <span className="text-slate-400">დადასტურებული პროდუქტი · {regionKa(med.region)}:</span>
              <span className="font-medium text-fg">{med.title}</span>
              <button
                type="button"
                className="ml-auto text-slate-400 hover:text-fg"
                onClick={() => {
                  setMeds((m) => m.filter((x) => x.region !== med.region));
                  clearConfirmed(med.region);
                }}
              >
                მოხსნა ×
              </button>
            </div>
          ))}
          {mode === 'challenge' && (
            <textarea
              className="mb-2 min-h-[70px] w-full resize-y rounded-2xl bg-ink-850 px-4 py-3 text-[14px] text-slate-100 outline-none placeholder:text-slate-500"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="თქვენი გეგმა — დიაგნოსტიკა და მკურნალობა, რომელიც უნდა შემოწმდეს…"
            />
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!loading) void ask(draft);
                }
              }}
              placeholder={turns.length ? 'დამატებითი კითხვა — მაგ.: და თუ eGFR 25-ია?' : 'დაწერეთ კლინიკური კითხვა…'}
              aria-label="კითხვა"
              className="max-h-48 min-h-[48px] flex-1 resize-none bg-transparent px-3 py-3 text-[15px] text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => void ask(draft)}
              disabled={loading || (!draft.trim() && !patient.narrative.trim())}
              aria-label="გაგზავნა"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-cyan-brand text-white transition hover:bg-cyan-deep disabled:opacity-40"
            >
              {loading ? <Sparkles className="h-5 w-5 animate-pulse-soft" /> : <ArrowUp className="h-5 w-5" />}
            </button>
          </div>
          <div className="relative flex items-center gap-2 px-2 pb-1 pt-1">
            <button type="button" onClick={() => setModeOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-slate-400 hover:bg-ink-850 hover:text-fg">
              რეჟიმი: <span className="font-medium text-slate-200">{modeLabel}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {modeOpen && (
              <div className="absolute bottom-9 left-1 z-30 w-60 rounded-2xl border border-line bg-ink-900 p-1.5 shadow-panel">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setMode(m.id);
                      setModeOpen(false);
                    }}
                    className={cn('block w-full rounded-xl px-3 py-2 text-left text-[13px]', m.id === mode ? 'bg-cyan/10 text-cyan' : 'text-slate-300 hover:bg-ink-850')}
                  >
                    {m.labelKa}
                  </button>
                ))}
              </div>
            )}
            <span className="ml-auto hidden text-[11px] text-slate-500 sm:block">Enter — გაგზავნა · Shift+Enter — ახალი ხაზი</span>
          </div>
        </div>
        {last?.result && <p className="mt-2 text-center text-[11px] text-slate-500">ასისტენტი არ ცვლის კლინიკურ გადაწყვეტილებას. გადაუდებელ შემთხვევაში — 112.</p>}
      </div>
    </div>
  );
}
