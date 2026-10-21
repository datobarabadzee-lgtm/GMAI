'use client';

import { useEffect, useState } from 'react';
import { Share, X, Plus } from 'lucide-react';

const DISMISS_KEY = 'gmai.install-hint.dismissed';

type Prompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * Install affordance.
 *
 * Chrome/Edge fire `beforeinstallprompt` and we can install in one tap. iOS Safari
 * fires nothing and offers no programmatic install, so the only honest thing to do
 * there is show the actual manual steps.
 */
export function InstallHint() {
  const [mode, setMode] = useState<'hidden' | 'ios' | 'prompt'>('hidden');
  const [deferred, setDeferred] = useState<Prompt | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      /* private mode — treat as not dismissed */
    }
    if (dismissed) return;

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as Prompt);
      setMode('prompt');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const ua = window.navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
    const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    if (iOS && safari) {
      const t = window.setTimeout(() => setMode((m) => (m === 'hidden' ? 'ios' : m)), 2500);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', onPrompt);
      };
    }
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (mode === 'hidden') return null;

  const dismiss = () => {
    setMode('hidden');
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* nothing to persist to — the hint simply reappears next visit */
    }
  };

  return (
    <div className="no-print fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-xl border border-cyan/25 bg-ink-900/95 p-3 shadow-2xl backdrop-blur">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-cyan/30 bg-cyan/10">
          {mode === 'ios' ? <Share className="h-4 w-4 text-cyan" /> : <Plus className="h-4 w-4 text-cyan" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-slate-100">დააყენეთ აპლიკაციად</p>
          {mode === 'ios' ? (
            <p className="mt-0.5 text-[12px] leading-relaxed text-slate-400">
              Safari-ის ქვედა ზოლში დააჭირეთ <span className="text-slate-200">გაზიარების</span> ღილაკს, ჩამოსქროლეთ და
              აირჩიეთ <span className="text-slate-200">{'„Add to Home Screen"'}</span>. შემდეგ აპლიკაცია გაიხსნება ეკრანიდან,
              ბრაუზერის ზოლის გარეშე.
            </p>
          ) : (
            <>
              <p className="mt-0.5 text-[12px] leading-relaxed text-slate-400">დაამატეთ მთავარ ეკრანზე და გაუშვით ცალკე ფანჯარაში.</p>
              <button
                type="button"
                className="btn btn-primary mt-2 text-xs"
                onClick={() => {
                  void deferred?.prompt();
                  dismiss();
                }}
              >
                დაყენება
              </button>
            </>
          )}
        </div>
        <button type="button" onClick={dismiss} aria-label="დახურვა" className="btn btn-ghost -mr-1 -mt-1 px-2">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
