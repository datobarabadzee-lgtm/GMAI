'use client';

import { useEffect, useState } from 'react';

/**
 * Sends an answer marked „needs human review" to the internal review workflow
 * (audit F15). Rendered only in the internal tier; in the public tier the
 * label stays a warning, because there are no reviewers there.
 */
export function SubmitForReview({ title, runId, content }: { title: string; runId: string | null; content: unknown }) {
  const [internal, setInternal] = useState(false);
  const [state, setState] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null });
  useEffect(() => setInternal(document.body.dataset.tier === 'internal'), []);
  if (!internal) return null;
  const send = async () => {
    let token = '';
    try {
      token = sessionStorage.getItem('gmai.reviewer.token') ?? '';
    } catch {
      /* storage unavailable */
    }
    if (!token) return setState({ busy: false, msg: 'ჯერ შეიყვანეთ რეცენზენტის გასაღები გვერდზე „ადამიანური განხილვა“ (/admin/review).' });
    setState({ busy: true, msg: null });
    const r = await fetch('/api/review', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ kind: 'answer', title, runId, content }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setState({ busy: false, msg: r?.ok ? 'გაიგზავნა განხილვაზე. სტატუსი: მოლოდინში.' : (j.messageKa ?? 'გაგზავნა ვერ მოხერხდა.') });
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" className="btn text-[12px]" disabled={state.busy} onClick={() => void send()}>
        განხილვაზე გაგზავნა
      </button>
      {state.msg && <span className="text-[12px] text-slate-300">{state.msg}</span>}
    </div>
  );
}
