'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * LIGHT BY DEFAULT, DARK ON REQUEST
 *
 * The choice lives in the browser only. The inline script below runs before the
 * first paint so a visitor who chose dark never sees a light flash.
 */
const KEY = 'gmai.theme.v1';

export const THEME_BOOT_SCRIPT = `try{if(localStorage.getItem('${KEY}')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`;

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      window.localStorage.setItem(KEY, next ? 'dark' : 'light');
    } catch {
      /* the choice still applies to this page view */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'ღია ფერები' : 'მუქი ფერები'}
      title={dark ? 'ღია ფერები' : 'მუქი ფერები'}
      className={cn(
        'grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 text-white/85 transition hover:border-cyan-brand/60 hover:text-white',
        className,
      )}
    >
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}
