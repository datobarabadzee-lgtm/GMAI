'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Panel } from '@/components/ui/primitives';

type Item = { id: string; kind: string; title: string; run_id: string | null; status: 'pending' | 'assigned' | 'approved' | 'rejected'; version: number; content_sha256: string; submitted_by: string; assignee: string | null; updated_at: string; content?: unknown };
type Ev = { seq: number; at: string; actor: string; actor_role: string; action: string; version: number; content_sha256: string; note: string | null; to_status: string };

const STATUS_KA: Record<Item['status'], string> = { pending: 'მოლოდინში', assigned: 'მინიჭებული', approved: 'დამტკიცებული', rejected: 'უარყოფილი' };
const ACTION_KA: Record<string, string> = { submit: 'წარდგენა', assign: 'მინიჭება', approve: 'დამტკიცება', reject: 'უარყოფა', revise: 'ახალი ვერსია', comment: 'კომენტარი' };
const KEY = 'gmai.reviewer.token';

export function ReviewWorkspace() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Item['status'] | ''>('pending');
  const [items, setItems] = useState<Item[]>([]);
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [open, setOpen] = useState<{ item: Item; events: Ev[] } | null>(null);
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      setToken(sessionStorage.getItem(KEY) ?? '');
    } catch {
      /* storage unavailable */
    }
  }, []);

  const headers = useCallback(() => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` }), [token]);

  const load = useCallback(async () => {
    if (!token) return;
    const r = await fetch(`/api/review${status ? `?status=${status}` : ''}`, { headers: headers() });
    const j = await r.json();
    if (!r.ok) return setMsg(j.messageKa ?? 'სია ვერ ჩაიტვირთა.');
    setMsg(null);
    setMe(j.reviewer);
    setItems(j.items);
  }, [token, status, headers]);

  useEffect(() => {
    void load();
  }, [load]);

  const show = async (id: string) => {
    const r = await fetch(`/api/review/${id}`, { headers: headers() });
    if (r.ok) setOpen(await r.json());
  };

  const act = async (action: string) => {
    if (!open) return;
    const r = await fetch(`/api/review/${open.item.id}`, { method: 'POST', headers: headers(), body: JSON.stringify({ action, note: note || undefined, assignee: assignee || undefined, expectedVersion: open.item.version }) });
    const j = await r.json();
    if (!r.ok) return setMsg(j.messageKa ?? 'მოქმედება ვერ შესრულდა.');
    setOpen(j);
    setNote('');
    setMsg(null);
    void load();
  };

  return (
    <div className="space-y-4">
      <Panel title="რეცენზენტის გასაღები" subtitle="ინახება მხოლოდ ამ ჩანართში">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            autoComplete="off"
            className="field flex-1"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              try {
                sessionStorage.setItem(KEY, e.target.value);
              } catch {
                /* storage unavailable */
              }
            }}
            placeholder="რეცენზენტის token"
          />
          {me && <Badge tone="low">{me.name} · {me.role === 'lead' ? 'წამყვანი' : 'რეცენზენტი'}</Badge>}
        </div>
        {msg && <p className="mt-2 text-[12.5px] text-clinical-high">{msg}</p>}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Panel title="ჩანაწერები">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(['pending', 'assigned', 'approved', 'rejected', ''] as const).map((s) => (
              <button key={s || 'all'} type="button" onClick={() => setStatus(s)} className={`rounded-full border px-2.5 py-1 text-[11px] ${status === s ? 'border-cyan/50 bg-cyan/15 text-fg' : 'border-line text-slate-400'}`}>
                {s ? STATUS_KA[s] : 'ყველა'}
              </button>
            ))}
          </div>
          <ul className="space-y-1.5">
            {items.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => void show(i.id)} className="w-full rounded-lg border border-line bg-ink-850/40 p-2.5 text-left text-[13px] hover:border-cyan/40">
                  <span className="font-medium text-fg">{i.title}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {STATUS_KA[i.status]} · v{i.version} · {i.submitted_by}
                    {i.assignee ? ` → ${i.assignee}` : ''}
                  </span>
                </button>
              </li>
            ))}
            {!items.length && <li className="text-[12.5px] text-slate-500">ჩანაწერი არ არის.</li>}
          </ul>
        </Panel>

        {open && (
          <Panel title={open.item.title} subtitle={`${STATUS_KA[open.item.status]} · ვერსია ${open.item.version} · sha256 ${open.item.content_sha256.slice(0, 12)}…`}>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-ink-900 p-3 text-[12px] text-slate-300">{JSON.stringify(open.item.content, null, 2)}</pre>
            <div className="mt-3 space-y-2">
              <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="შენიშვნა / უარყოფის მიზეზი" />
              {me?.role === 'lead' && (
                <div className="flex gap-2">
                  <input className="field flex-1" value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="რეცენზენტის სახელი" />
                  <button type="button" className="btn" onClick={() => void act('assign')}>მინიჭება</button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" onClick={() => void act('approve')}>დამტკიცება</button>
                <button type="button" className="btn" onClick={() => void act('reject')}>უარყოფა</button>
                <button type="button" className="btn btn-ghost" onClick={() => void act('comment')}>კომენტარი</button>
              </div>
            </div>
            <ol className="mt-4 space-y-1 text-[12px] text-slate-400">
              {open.events.map((e) => (
                <li key={e.seq}>
                  {e.at.slice(0, 16).replace('T', ' ')} · {ACTION_KA[e.action] ?? e.action} · {e.actor} · v{e.version}
                  {e.note ? ` — ${e.note}` : ''}
                </li>
              ))}
            </ol>
          </Panel>
        )}
      </div>
    </div>
  );
}
