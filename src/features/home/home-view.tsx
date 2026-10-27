'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight, BookOpen, FileText, FlaskConical, GraduationCap, Heart, ListChecks, Lock, MessageSquareText,
  Microscope, Phone, Pill, ShieldAlert, ShieldPlus, AlignLeft, Stethoscope, Users, HeartHandshake,
} from 'lucide-react';
import { ASK_HREF, audienceOf, type Audience } from '@/components/layout/nav';
import { useRole } from '@/features/settings/role-store';
import { DEMO_CASES } from '@/knowledge/demo-cases';
import { CONTACT_INTRO_KA, whatsappLink } from '@/lib/contact';

type Tile = { href: string; titleKa: string; textKa: string; icon: LucideIcon; external?: boolean };

const COPY: Record<Audience, { eyebrow: string; sub: string; placeholder: string; tiles: Tile[]; examples: string[] }> = {
  patient: {
    eyebrow: 'პაციენტის რეჟიმი',
    sub: 'დაგვისვით კითხვა თქვენი სიტყვებით — საჭიროების შემთხვევაში დაგისვამთ 2–3 მოკლე კითხვას და მიიღებთ გასაგებ პასუხს ქართულად.',
    placeholder: 'მაგ: ჰემოგლობინი 10.2 მაქვს — რას ნიშნავს?',
    tiles: [
      { href: '/labs', titleKa: 'ანალიზების ახსნა', textKa: 'გაიგეთ, რას ნიშნავს თქვენი შედეგები', icon: FlaskConical },
      { href: '/medication-review', titleKa: 'წამლების შემოწმება', textKa: 'შეიძლება თუ არა მათი ერთად მიღება', icon: Pill },
      { href: '/patient?start=diagnosis', titleKa: 'ამიხსენი მარტივად', textKa: 'დიაგნოზი გასაგებ ენაზე', icon: AlignLeft },
      { href: 'whatsapp', titleKa: 'ჰკითხეთ ექიმს', textKa: 'ცოცხალი პასუხი WhatsApp-ით', icon: Phone, external: true },
    ],
    examples: ['რას ნიშნავს მაღალი ქოლესტერინი?', 'რა ვკითხო ექიმს ვიზიტზე?', 'შეიძლება თუ არა პარაცეტამოლი ორსულობისას?'],
  },
  clinician: {
    eyebrow: 'ექიმის რეჟიმი',
    sub: 'კლინიკური მსჯელობა, მედიკამენტები, მტკიცებულება და დოკუმენტაცია — ყოველი მტკიცება წყაროთი. საუბარი გრძელდება დამატებითი კითხვებით.',
    placeholder: 'მაგ: 81 წ. ქალი, AF, eGFR 32, ორი დაცემა — რომელი ანტიკოაგულანტი?',
    tiles: [
      { href: '/clinical?mode=deep', titleKa: 'ქეისის ანალიზი', textKa: 'კლინიკური მსჯელობა და DDx', icon: Stethoscope },
      { href: '/medication-review', titleKa: 'მედიკამენტი და დოზა', textKa: 'ურთიერთქმედება, ასაკი, ინსტრუქცია ქართულად', icon: Pill },
      { href: '/evidence', titleKa: 'მტკიცებულება', textKa: 'გაიდლაინები და კვლევები', icon: BookOpen },
      { href: '/documents', titleKa: 'დოკუმენტაცია', textKa: 'ფორმა 100, ეპიკრიზი, მიმართვა', icon: FileText },
    ],
    examples: [],
  },
  student: {
    eyebrow: 'სტუდენტის რეჟიმი',
    sub: 'ისწავლეთ თქვენს დონეზე: ახსნა ნაბიჯ-ნაბიჯ, კლინიკური ქეისები, ქვიზები და კვლევა.',
    placeholder: 'მაგ: ამიხსენი ინსულტის მეორადი პრევენცია',
    tiles: [
      { href: '/academy', titleKa: 'სამედიცინო აკადემია', textKa: 'თემის ახსნა ნაბიჯ-ნაბიჯ', icon: GraduationCap },
      { href: '/academy?mode=case', titleKa: 'კლინიკური ქეისები', textKa: 'ივარჯიშეთ რეალისტურ ქეისებზე', icon: Users },
      { href: '/academy?mode=quiz', titleKa: 'ქვიზი და OSCE', textKa: 'შეამოწმეთ ცოდნა', icon: ListChecks },
      { href: '/research', titleKa: 'კვლევა', textKa: 'PICO, ძიება, მეთოდოლოგია', icon: Microscope },
    ],
    examples: [],
  },
};

const FEATURED = ['demo-ob', 'demo-polypharmacy', 'demo-tia'];

export function HomeView() {
  const { role } = useRole();
  const audience = audienceOf(role);
  const copy = COPY[audience];
  const router = useRouter();
  const [q, setQ] = useState('');

  const go = (text = q) => {
    const t = text.trim();
    router.push(t ? `${ASK_HREF[audience]}?q=${encodeURIComponent(t)}` : ASK_HREF[audience]);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Hero — navy in both themes, the one place the brand speaks loudly. */}
      <section className="relative overflow-hidden rounded-3xl bg-navy ring-white/10 dark:ring-1 px-6 py-9 text-white sm:px-11 sm:py-12">
        <span aria-hidden className="pointer-events-none absolute -bottom-14 -right-14 h-36 w-36 rounded-full bg-cyan-brand sm:-right-16 sm:-top-24 sm:bottom-auto sm:h-[300px] sm:w-[300px]" />
        <div className="relative max-w-2xl">
          <p className="text-[13px] font-medium text-cyan-brand">{copy.eyebrow}</p>
          <h1 className="mt-3 text-[28px] font-bold leading-tight sm:text-[38px]">
            გამარჯობა! <span className="text-cyan-brand">რით დაგეხმაროთ დღეს?</span>
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/80">{copy.sub}</p>
          <form
            className="mt-7 flex items-center gap-2 rounded-full bg-white p-1.5 pl-5 shadow-soft"
            onSubmit={(e) => {
              e.preventDefault();
              go();
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={copy.placeholder}
              aria-label="თქვენი კითხვა"
              className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-navy outline-none placeholder:text-slate-500"
            />
            <button type="submit" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-cyan-brand px-5 py-3 text-sm font-medium text-white transition hover:bg-cyan-deep">
              კითხვა <ArrowRight className="h-4 w-4" />
            </button>
          </form>
          {copy.examples.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {copy.examples.map((x) => (
                <button key={x} type="button" onClick={() => go(x)} className="rounded-full border border-white/20 px-3 py-1.5 text-[12px] text-white/85 transition hover:border-cyan-brand hover:text-white">
                  {x}
                </button>
              ))}
            </div>
          )}
          <p className="mt-4 text-[12px] text-white/55">უფასოა · რეგისტრაცია არ არის საჭირო · სერვერზე არაფერი ინახება</p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {copy.tiles.map((t) => {
          const Icon = t.icon;
          const inner = (
            <>
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/45 text-navy dark:bg-white/15 dark:text-white">
                <Icon className="h-5 w-5" />
              </span>
              <span className="mt-auto block pt-8">
                <span className="block text-[16px] font-semibold leading-snug text-navy dark:text-white">{t.titleKa}</span>
                <span className="mt-1.5 block text-[13px] leading-snug text-navy/75 dark:text-white/75">{t.textKa}</span>
              </span>
              <span className="mt-4 flex items-center justify-end gap-0">
                <span className="h-px w-8 bg-navy/70 dark:bg-white/60" />
                <span className="grid h-8 w-8 place-items-center rounded-full bg-navy text-white transition group-hover:translate-x-0.5 dark:bg-white dark:text-navy">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </span>
            </>
          );
          const cls =
            'group flex min-h-[210px] flex-col rounded-3xl bg-gradient-to-b from-[#1FC3F5] to-[#D5EEF6] p-5 transition hover:-translate-y-0.5 hover:shadow-soft dark:from-[#0B8DB8] dark:to-[#173B52]';
          return t.external ? (
            <a key={t.titleKa} href={whatsappLink(CONTACT_INTRO_KA)} target="_blank" rel="noopener noreferrer" className={cls}>
              {inner}
            </a>
          ) : (
            <Link key={t.titleKa} href={t.href} className={cls}>
              {inner}
            </Link>
          );
        })}
      </section>

      {audience === 'patient' && (
        <Link href="/prevention" className="group relative flex flex-col gap-4 overflow-hidden rounded-3xl border border-line bg-ink-900 p-6 shadow-panel transition hover:-translate-y-0.5 hover:shadow-soft sm:flex-row sm:items-center">
          <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-cyan-brand/15 blur-2xl" />
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-navy text-cyan-brand">
            <ShieldPlus className="h-7 w-7" />
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="block text-[12px] font-semibold uppercase tracking-wider text-cyan">ახალი · 2 წუთში</span>
            <span className="mt-1 block text-[19px] font-bold leading-snug text-fg">ჩემი პრევენციის გეგმა</span>
            <span className="mt-1 block text-[13.5px] leading-relaxed text-slate-400">რა კვლევა და ვაქცინა გჭირდებათ, როდის და რატომ — და რაზე არ ღირს ფულის დახარჯვა.</span>
          </span>
          <span className="relative inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-cyan-brand px-5 py-3 text-sm font-medium text-white transition group-hover:bg-cyan-deep sm:self-center">
            დაწყება <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      {audience === 'patient' && (
        <Link href="/reproductive" className="group relative flex flex-col gap-4 overflow-hidden rounded-3xl border border-line bg-ink-900 p-6 shadow-panel transition hover:-translate-y-0.5 hover:shadow-soft sm:flex-row sm:items-center">
          <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-rose-400/15 blur-2xl" />
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-navy text-cyan-brand">
            <HeartHandshake className="h-7 w-7" />
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="block text-[12px] font-semibold uppercase tracking-wider text-cyan">ახალი · ორსულობა და ნაყოფიერება</span>
            <span className="mt-1 block text-[19px] font-bold leading-snug text-fg">მშობიარობის თარიღი და ორსულობის კალენდარი</span>
            <span className="mt-1 block text-[13.5px] leading-relaxed text-slate-400">ვადის გამოთვლა, კვლევები და ვაქცინები კვირების მიხედვით შეხსენებებით, ოვულაციის დღეები.</span>
          </span>
          <span className="relative inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-cyan-brand px-5 py-3 text-sm font-medium text-white transition group-hover:bg-cyan-deep sm:self-center">
            გახსნა <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      {audience === 'patient' && (
        <section className="flex flex-col gap-3 rounded-2xl border border-line border-l-4 border-l-clinical-critical bg-ink-900 p-4 sm:flex-row sm:items-center">
          <ShieldAlert className="h-5 w-5 shrink-0 text-clinical-critical" />
          <p className="flex-1 text-[14px] leading-relaxed text-slate-300">
            <span className="font-semibold text-fg">ეს სერვისი არ ცვლის ექიმს.</span> მკვეთრი ტკივილი გულმკერდში, სუნთქვის გაძნელება, სახის ასიმეტრია ან ცნობიერების დაკარგვა — არ დაელოდოთ პასუხს.
          </p>
          <a href="tel:112" className="shrink-0 font-semibold text-clinical-critical">დარეკეთ 112</a>
        </section>
      )}

      {audience !== 'patient' && (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-xl font-semibold text-fg">სცადეთ მაგალითზე</h2>
            <span className="text-[12px] text-slate-500">ფიქტიური მონაცემები</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {FEATURED.map((id) => DEMO_CASES.find((d) => d.id === id)!).filter(Boolean).map((d) => (
              <Link key={d.id} href={`/clinical?demo=${d.id}`} className="group rounded-2xl border border-line bg-ink-900 p-5 transition hover:border-cyan/50 hover:shadow-panel">
                <span className="inline-block rounded-full bg-cyan/10 px-2.5 py-1 text-[11px] font-medium text-cyan">{d.tag}</span>
                <p className="mt-3 text-[15px] font-semibold text-fg">{d.titleKa}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{d.summaryKa}</p>
                <p className="mt-3 text-[13px] font-medium text-cyan">ნახვა →</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-5 pt-2 sm:grid-cols-3">
        {[
          { icon: MessageSquareText, t: 'ყოველი პასუხი — წყაროთი', d: 'თუ წყარო არ არსებობს, სისტემა ამბობს, რომ არ იცის.' },
          { icon: Lock, t: 'ბაზა არ გვაქვს', d: 'ქეისი რჩება თქვენს ბრაუზერში; AI-პასუხისთვის ტექსტი გადაეცემა OpenAI-ს — დეტალები კონფიდენციალურობის გვერდზე.' },
          { icon: Heart, t: 'ქართულად და უფასოდ', d: 'სამედიცინო ცოდნა ყველასთვის ღიაა.' },
        ].map((x) => (
          <div key={x.t} className="flex gap-3">
            <x.icon className="mt-0.5 h-5 w-5 shrink-0 text-cyan" />
            <div>
              <p className="text-[14px] font-semibold text-fg">{x.t}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{x.d}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
