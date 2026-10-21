'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, KeyRound, Menu, Plus, X } from 'lucide-react';
import { ASK_HREF, AUDIENCES, MENU, MORE_TOOLS, audienceOf, type Audience, type MenuItem } from './nav';
import { ThemeToggle } from './theme';
import { WhatsAppIcon } from './whatsapp-button';
import { useRole } from '@/features/settings/role-store';
import { KeySettings } from '@/features/settings/role-gate';
import { CONTACT_INTRO_KA, whatsappLink } from '@/lib/contact';
import { cn } from '@/lib/utils';
import type { AppTier } from '@/lib/tier';

/**
 * THE SHELL — LeaderMED layout.
 *
 * Navy header with the role switch, a short menu per audience, and on phones a
 * bottom tab bar. Everything else stays reachable but out of the way.
 */
export function AppShell({ children }: { children: React.ReactNode; engine?: { engine: 'mock' | 'live'; label: string }; tier?: AppTier }) {
  const pathname = usePathname();
  const { role, setRole } = useRole();
  const audience = audienceOf(role);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-40 bg-navy text-white">
        <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6">
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full text-white/85 hover:bg-white/10 lg:hidden"
            aria-label="მენიუ"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="ლიდერმედი — მთავარი">
            <Image src="/brand/leadermed-logo-dark.png" alt="ლიდერმედი" width={560} height={171} priority className="hidden h-9 w-auto sm:block" />
            <Image src="/brand/leadermed-mark.png" alt="ლიდერმედი" width={64} height={64} priority className="h-9 w-9 sm:hidden" />
            <span className="hidden h-6 w-px bg-white/20 sm:block" />
            <span className="hidden text-[11px] font-semibold tracking-[0.16em] text-cyan-brand sm:block">MEDICAL AI</span>
          </Link>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div role="tablist" aria-label="ვისთვის" className="flex rounded-full bg-white/10 p-1">
              {AUDIENCES.map((a) => (
                <button
                  key={a.id}
                  role="tab"
                  type="button"
                  aria-selected={audience === a.id}
                  onClick={() => setRole(a.id)}
                  className={cn(
                    'rounded-full px-2.5 py-1.5 text-[12px] transition sm:px-3.5 sm:text-[13px]',
                    audience === a.id ? 'bg-cyan-brand font-medium text-white' : 'text-white/80 hover:text-white',
                  )}
                >
                  {a.labelKa}
                </button>
              ))}
            </div>
            <ThemeToggle />
            <Link
              href={ASK_HREF[audience]}
              // Already on that page: the workspace starts over instead of doing nothing.
              onClick={() => window.dispatchEvent(new Event('gmai:new-question'))}
              className="hidden items-center gap-1.5 rounded-full bg-cyan-brand px-4 py-2.5 text-sm font-medium text-white shadow-soft transition hover:bg-cyan-deep sm:inline-flex"
            >
              <Plus className="h-4 w-4" /> ახალი კითხვა
            </Link>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside
          className={cn(
            'no-print fixed inset-y-16 left-0 z-30 flex w-[264px] shrink-0 flex-col overflow-y-auto border-r border-line bg-ink-900 px-3 py-5 transition-transform lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:translate-x-0',
            open ? 'translate-x-0 shadow-panel' : '-translate-x-full',
          )}
        >
          <p className="mb-2 px-3 text-[12px] text-slate-500">მენიუ</p>
          <Suspense fallback={null}>
            <SideMenu items={MENU[audience]} />
          </Suspense>

          {audience === 'clinician' && <MoreTools />}

          <div className="mt-auto space-y-3 pt-6">
            <a
              href={whatsappLink(CONTACT_INTRO_KA)}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-2xl border border-line bg-ink-850 p-3.5 transition hover:border-[#25D366]/50"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#25D366] text-white">
                <WhatsAppIcon className="h-5 w-5" />
              </span>
              <span className="mt-2 block text-sm font-semibold text-fg">ჰკითხეთ ექიმს</span>
              <span className="block text-xs text-slate-400">ცოცხალი პასუხი WhatsApp-ით</span>
            </a>
            <nav className="space-y-1 px-1 text-[13px]">
              <Link href="/about" className="block rounded-lg px-2 py-1.5 text-slate-400 hover:text-fg">შესახებ და მეთოდოლოგია</Link>
              <Link href="/privacy" className="block rounded-lg px-2 py-1.5 text-slate-400 hover:text-fg">კონფიდენციალობა</Link>
            </nav>
            <KeyCorner />
          </div>
        </aside>

        {open && <div className="fixed inset-0 z-20 bg-navy/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

        <main className="min-w-0 flex-1 px-4 pb-28 pt-6 sm:px-8 sm:pt-8 lg:pb-12">{children}</main>
      </div>

      <footer className="no-print hidden border-t border-line bg-ink-900 px-6 py-5 lg:block">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <p>შპს „ინ ვიტრო განაყოფიერების ცენტრი“ — ლიდერმედი · ნოდარ ბოხუას ქ. 21, თბილისი · ს/კ 202462708</p>
          <p>
            <a className="hover:text-fg" href="tel:+995322157777">(+995 32) 215 77 77</a>
            {' · '}
            <a className="hover:text-fg" href="mailto:info@leadermed.ge">info@leadermed.ge</a>
            {' · '}
            გადაუდებელი: <a className="font-medium text-clinical-critical" href="tel:112">112</a>
          </p>
        </div>
      </footer>

      <Suspense fallback={null}>
        <TabBar audience={audience} />
      </Suspense>
    </div>
  );
}

/** A menu entry is active on its path, and — for entries with a query — only on that query. */
function useIsActive() {
  const pathname = usePathname();
  const params = useSearchParams();
  return (item: MenuItem) => {
    if (item.external) return false;
    const [path, query] = item.href.split('?');
    if (query) return pathname === path && params.toString() === query;
    if (path === '/') return pathname === '/';
    // /academy must not light up on /academy/clinical, which has its own item.
    if (path === '/academy' && pathname.startsWith('/academy/clinical')) return false;
    return pathname.startsWith(path) && !params.get('mode') && !params.get('start');
  };
}

function MenuLink({ item, active, compact = false }: { item: MenuItem; active: boolean; compact?: boolean }) {
  const Icon = item.icon;
  const cls = compact
    ? cn('flex flex-1 flex-col items-center gap-1 py-2 text-[11px]', active ? 'text-cyan' : 'text-slate-400')
    : cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition',
        active ? 'bg-cyan/10 font-medium text-cyan' : 'text-slate-200 hover:bg-ink-850 hover:text-fg',
      );
  const body = (
    <>
      <Icon className={cn(compact ? 'h-5 w-5' : 'h-[18px] w-[18px] shrink-0', active ? 'text-cyan' : 'text-slate-400')} />
      <span className={compact ? 'leading-none' : 'truncate'}>{compact ? item.shortKa : item.labelKa}</span>
    </>
  );
  if (item.external) {
    return (
      <a href={whatsappLink(CONTACT_INTRO_KA)} target="_blank" rel="noopener noreferrer" className={cls}>
        {body}
      </a>
    );
  }
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined} className={cls}>
      {body}
    </Link>
  );
}

function SideMenu({ items }: { items: MenuItem[] }) {
  const isActive = useIsActive();
  return (
    <nav aria-label="მთავარი ნავიგაცია">
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.href}>
            <MenuLink item={item} active={isActive(item)} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function MoreTools() {
  const pathname = usePathname();
  const inside = MORE_TOOLS.some((t) => pathname.startsWith(t.href));
  const [open, setOpen] = useState(inside);
  return (
    <div className="mt-4 border-t border-line pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] text-slate-400 hover:text-fg"
      >
        სხვა ხელსაწყოები
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5">
          {MORE_TOOLS.map((t) => {
            const Icon = t.icon;
            const active = pathname.startsWith(t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-[13px]', active ? 'bg-cyan/10 text-cyan' : 'text-slate-300 hover:bg-ink-850 hover:text-fg')}
                >
                  <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                  {t.labelKa}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function KeyCorner() {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 px-2 py-1 text-[12px] text-slate-500 hover:text-fg">
        <KeyRound className="h-3.5 w-3.5" /> საკუთარი API გასაღები
      </button>
      {open && <KeySettings />}
    </div>
  );
}

/** Phone navigation: the first five entries of the audience's menu. */
function TabBar({ audience }: { audience: Audience }) {
  const isActive = useIsActive();
  const items = MENU[audience].slice(0, 5);
  return (
    <nav
      aria-label="ნავიგაცია"
      className="no-print fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {items.map((item) => (
        <MenuLink key={item.href} item={item} active={isActive(item)} compact />
      ))}
    </nav>
  );
}
