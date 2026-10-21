'use client';

import { useState } from 'react';
import { KeyRound, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { ROLES, primaryFor, type Role } from '@/components/layout/nav';
import { useRole } from '@/features/settings/role-store';
import { cn } from '@/lib/utils';

/**
 * First screen a visitor meets. Four choices, each saying what it gives you,
 * so the product explains itself before it shows nineteen modules.
 */
export function RolePicker({ onPicked }: { onPicked?: (r: Role) => void }) {
  const { setRole } = useRole();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-2xl font-semibold text-fg sm:text-3xl">ვინ იყენებს სისტემას?</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        აირჩიეთ — და დაინახავთ მხოლოდ იმას, რაც თქვენ გჭირდებათ. არჩევანი ნებისმიერ მომენტში იცვლება.
        რეგისტრაცია არ არის საჭირო; სერვერს მონაცემთა ბაზა არ აქვს.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {ROLES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => {
              setRole(r.id);
              onPicked?.(r.id);
            }}
            className="rounded-xl border border-line bg-ink-850/50 p-4 text-left transition hover:border-cyan/50 hover:bg-ink-850"
          >
            <p className="text-[15px] font-semibold text-fg">{r.labelKa}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{r.blurbKa}</p>
            {primaryFor(r.id) && (
              <p className="mt-2 text-[11px] text-cyan">იწყება აქ: {primaryFor(r.id)!.labelKa}</p>
            )}
          </button>
        ))}
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-slate-500">
        არჩევანი მხოლოდ ეკრანს ცვლის. ეს არ არის ანგარიში და არ ზღუდავს წვდომას — ყველა მოდული
        ხელმისაწვდომი რჩება მენიუდან „ყველა მოდულის ჩვენება“ ღილაკით.
      </p>
    </div>
  );
}

/** Role switch plus the optional own-key field, shown in the shell. */
export function RoleSettings({ compact = false }: { compact?: boolean }) {
  const { role, setRole, userKey, setUserKey, clearUserKey } = useRole();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const current = ROLES.find((r) => r.id === role);

  return (
    <div className={cn('rounded-lg border border-line bg-ink-850/40 p-3', compact && 'p-2.5')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-[12px] text-slate-300">
          <UserCog className="h-3.5 w-3.5 text-cyan" />
          {current?.labelKa ?? 'რეჟიმის არჩევა'}
        </span>
        <span className="text-[11px] text-slate-500">{open ? 'დახურვა' : 'შეცვლა'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] transition',
                  r.id === role ? 'border-cyan/50 bg-cyan/15 text-fg' : 'border-line text-slate-400 hover:text-slate-200',
                )}
              >
                {r.labelKa}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setRole(null)}
              className="rounded-full border border-line px-2.5 py-1 text-[11px] text-slate-400 transition hover:text-slate-200"
            >
              ყველა მოდული
            </button>
          </div>

          <div className="border-t border-line pt-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
              <KeyRound className="h-3 w-3 text-cyan" /> საკუთარი API გასაღები
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              არასავალდებულო. მიამაგრეთ და მოთხოვნები თქვენს ანგარიშზე დაითვლება — ლიმიტების გარეშე.
              გასაღები ინახება მხოლოდ ამ ჩანართში და იშლება მისი დახურვისას. სერვერზე არ იწერება და არ ჩაიწერება ჟურნალში.
            </p>

            {userKey ? (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-clinical-low/40 bg-clinical-low/10 px-2.5 py-1.5">
                <span className="flex items-center gap-1.5 text-[11px] text-clinical-low">
                  <ShieldCheck className="h-3 w-3" /> მიმაგრებულია · sk-…{userKey.slice(-4)}
                </span>
                <button type="button" onClick={clearUserKey} className="text-slate-400 transition hover:text-clinical-critical">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="mt-2 flex gap-1.5">
                <input
                  type="password"
                  autoComplete="off"
                  className="field flex-1 text-[11px]"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="sk-..."
                />
                <button
                  type="button"
                  className="btn btn-ghost text-[11px]"
                  onClick={() => {
                    setUserKey(draft);
                    setDraft('');
                  }}
                  disabled={!draft.trim()}
                >
                  მიმაგრება
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The optional own-key field on its own; the role now lives in the header. */
export function KeySettings() {
  const { userKey, setUserKey, clearUserKey } = useRole();
  const [draft, setDraft] = useState('');
  return (
    <div className="mt-2 rounded-xl border border-line bg-ink-850 p-3">
      <p className="text-[11px] leading-relaxed text-slate-400">
        არასავალდებულო. მოთხოვნები დაითვლება თქვენს ანგარიშზე, ლიმიტების გარეშე. გასაღები ინახება მხოლოდ ამ ჩანართში და სერვერზე არ იწერება.
      </p>
      {userKey ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-clinical-low/40 bg-clinical-low/10 px-2.5 py-1.5">
          <span className="flex items-center gap-1.5 text-[11px] text-clinical-low">
            <ShieldCheck className="h-3 w-3" /> მიმაგრებულია · …{userKey.slice(-4)}
          </span>
          <button type="button" onClick={clearUserKey} aria-label="წაშლა" className="text-slate-400 transition hover:text-clinical-critical">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="mt-2 flex gap-1.5">
          <input type="password" autoComplete="off" className="field flex-1 py-1.5 text-[12px]" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="sk-..." />
          <button type="button" className="btn px-3 py-1 text-[12px]" onClick={() => { setUserKey(draft); setDraft(''); }} disabled={!draft.trim()}>
            OK
          </button>
        </div>
      )}
    </div>
  );
}
