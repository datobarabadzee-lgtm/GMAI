'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Baby, Languages, RefreshCw } from 'lucide-react';
import { Bullets, Collapsible, Skeleton } from '@/components/ui/primitives';

export type DrugSummaryKa = {
  inn: string;
  classKa: string;
  whatKa: string;
  mechanismKa: string;
  indicationsKa: string[];
  dosingKa: string[];
  expectKa: string[];
  adverseKa: string[];
  seriousKa: string[];
  contraindicationsKa: string[];
  interactionsKa: string[];
  groupsKa: string[];
  stoppingKa: string;
  droppedUnverified: number;
  sourceKa: string;
};

export type AgeWarning = { ruleId: string; inn: string; level: string; levelKa: string; textKa: string; sourceKa: string; ageKa: string };

type State = { status: 'idle' | 'loading' | 'done' | 'failed'; summary?: DrugSummaryKa | null; messageKa?: string };

/** Red, impossible-to-miss age restriction — shown above everything else. */
export function AgeWarningBox({ warnings }: { warnings: AgeWarning[] }) {
  if (!warnings.length) return null;
  return (
    <div className="space-y-2" role="alert">
      {warnings.map((w) => (
        <div key={`${w.ruleId}-${w.inn}`} className="rounded-xl border-2 border-clinical-critical/70 bg-clinical-critical/15 p-4">
          <div className="flex items-start gap-2.5">
            <Baby className="mt-0.5 h-5 w-5 shrink-0 text-clinical-critical" />
            <div>
              <p className="text-[15px] font-semibold text-fg">
                {w.inn} — {w.ageKa}: {w.levelKa}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-100">{w.textKa}</p>
              <p className="mt-1.5 text-[11px] text-slate-400">წყარო: {w.sourceKa}. დანიშნულების შეცვლა მხოლოდ ექიმთან — თუ ბავშვი უკვე იღებს, ნუ შეწყვეტთ უეცრად, დაუკავშირდით ექიმს დღესვე.</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Block({ title, items, tone }: { title: string; items: string[]; tone?: 'critical' }) {
  if (!items.length) return null;
  return (
    <div>
      <p className={tone === 'critical' ? 'label mb-1 text-clinical-critical' : 'label mb-1'}>{title}</p>
      <Bullets items={items} />
    </div>
  );
}

/**
 * Georgian summary of a CONFIRMED product's label, fetched on demand. It needs
 * the server-issued confirmation (token + the same browser session); a name
 * alone is refused by the server. Marked as a machine translation; the
 * original text stays available on the medication page.
 */
export function DrugSummaryCard({
  product,
  autoLoad,
  original,
}: {
  product: { query: string; recordId: number; token: string };
  autoLoad?: boolean;
  original?: { labelKa: string; text: string; key: string }[];
}) {
  const [st, setSt] = useState<State>({ status: 'idle' });

  const load = async () => {
    setSt({ status: 'loading' });
    try {
      const res = await fetch('/api/drug-summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(product),
      });
      const json = await res.json();
      if (!res.ok || !json.summary) {
        setSt({ status: 'failed', messageKa: json.messageKa ?? 'ქართული შეჯამება ვერ მომზადდა.' });
        return;
      }
      setSt({ status: 'done', summary: json.summary as DrugSummaryKa });
    } catch {
      setSt({ status: 'failed', messageKa: 'სერვერთან კავშირი ვერ დამყარდა.' });
    }
  };

  useEffect(() => {
    if (autoLoad) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, product.recordId, product.token]);

  const s = st.summary;
  return (
    <div className="space-y-3">
      {st.status === 'idle' && (
        <button type="button" className="btn btn-primary text-xs" onClick={() => void load()}>
          <Languages className="h-3.5 w-3.5" /> ქართული შეჯამება (თარგმანი)
        </button>
      )}
      {st.status === 'loading' && (
        <div>
          <p className="mb-2 text-[12px] text-slate-400">ინსტრუქციას ვაჯამებ ქართულად — 10–30 წამი…</p>
          <Skeleton lines={5} />
        </div>
      )}
      {st.status === 'failed' && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] text-amber-200/80">{st.messageKa}</p>
          <button type="button" className="btn btn-ghost text-[11px]" onClick={() => void load()}>
            <RefreshCw className="h-3 w-3" /> თავიდან ცდა
          </button>
        </div>
      )}
      {st.status === 'done' && s && (
        <div className="space-y-3">
          <p className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-[11px] text-slate-400">
            <Languages className="h-3 w-3" aria-hidden /> მანქანური თარგმანი-შეჯამება · ორიგინალი — წყაროს სექციებში
          </p>
          {s.classKa && <p className="chip inline-block text-[11px]">{s.classKa}</p>}
          {s.whatKa && <p className="text-[14px] leading-relaxed text-slate-100">{s.whatKa}</p>}
          {s.mechanismKa && (
            <div className="rounded-lg border border-cyan/30 bg-cyan/5 p-3">
              <p className="label mb-1">როგორ მოქმედებს — და რას ნიშნავს ეს პრაქტიკაში</p>
              <p className="text-[13px] leading-relaxed text-slate-200">{s.mechanismKa}</p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Block title="რისთვის ინიშნება" items={s.indicationsKa} />
            <Block title="დოზირება (მოზრდილები)" items={s.dosingKa} />
            <Block title="რას უნდა ელოდოთ / როგორ მივიღოთ" items={s.expectKa} />
            <Block title="ხშირი გვერდითი მოვლენები" items={s.adverseKa} />
            <Block title="სასწრაფოდ მიმართეთ ექიმს, თუ…" items={s.seriousKa} tone="critical" />
            <Block title="არ შეიძლება, თუ…" items={s.contraindicationsKa} />
            <Block title="სახიფათო კომბინაციები" items={s.interactionsKa} />
            <Block title="ბავშვები, ხანდაზმულები, ორსულობა" items={s.groupsKa} />
          </div>
          {s.stoppingKa && (
            <p className="flex gap-2 rounded-lg border border-clinical-moderate/40 bg-clinical-moderate/10 p-3 text-[13px] leading-relaxed text-slate-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-clinical-moderate" />
              <span>
                <span className="font-medium">შეწყვეტა: </span>
                {s.stoppingKa}
              </span>
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-slate-500">
            {s.sourceKa}
            {s.droppedUnverified > 0 ? ` ${s.droppedUnverified} ფრაზა ამოღებულია, რადგან მისი რიცხვი ეტიკეტში ვერ დადასტურდა.` : ''}
          </p>
        </div>
      )}
      {original && original.length > 0 && (
        <Collapsible title="ორიგინალი ინსტრუქცია (ინგლისურად, წყაროს ტექსტი)" defaultOpen={false}>
          <div className="space-y-2">
            {original.slice(0, 8).map((sec) => (
              <div key={sec.key}>
                <p className="label mb-0.5">{sec.labelKa}</p>
                <p className="text-[11px] leading-relaxed text-slate-400">{sec.text}</p>
              </div>
            ))}
          </div>
        </Collapsible>
      )}
    </div>
  );
}

export type IdentityMention = { input: string; kind: string; href: string; catalog?: { name_ka: string; name_en: string; source_url: string }[]; selectableTotal?: number; emaTotal?: number };

const KIND_KA: Record<string, string> = {
  brand_curated: 'სავაჭრო დასახელება — საჭიროა პროდუქტის არჩევა',
  curator_approved: 'კურატორის მიერ დაკავშირებული — აირჩიეთ ზუსტი პროდუქტი',
  catalog_only: 'დასახელება კატალოგში მოიძებნა; დადასტურებული ინსტრუქცია ჯერ არ არის დაკავშირებული.',
  product_candidates: 'რამდენიმე პროდუქტი — აირჩიეთ ზუსტი',
  ingredient_only: 'მოქმედი ნივთიერების სახელი — აირჩიეთ პროდუქტი',
  unknown: 'ზუსტად ვერ მოიძებნა — ჩაწერეთ ზუსტი სახელი ან შეფუთვის მონაცემები',
  substance_exact: 'ნივთიერება ზუსტად დასახელებულია — პროდუქტი არ არის დადასტურებული',
};

/** For each named drug without a confirmed product: status and the link to choose it. No dose. */
export function IdentityRequired({ mentions }: { mentions: IdentityMention[] }) {
  if (!mentions.length) return null;
  return (
    <div className="space-y-1.5 rounded-lg border border-clinical-moderate/45 bg-clinical-moderate/10 p-3" role="status">
      <p className="text-[13px] font-semibold text-fg">ინსტრუქცია და დოზა ჩანს მხოლოდ დადასტურებულ პროდუქტზე</p>
      <ul className="space-y-1">
        {mentions.map((m) => (
          <li key={m.input} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
            <span className="font-medium text-fg">{m.input}</span>
            <span className="text-slate-400">{KIND_KA[m.kind] ?? ''}</span>
            {m.catalog?.[0] && <span className="text-[12px] text-slate-500">კატალოგი: {[m.catalog[0].name_ka, m.catalog[0].name_en].filter(Boolean).join(' / ')}</span>}
            {m.emaTotal ? <span className="text-[12px] text-slate-500">ევროპა (EMA): {m.emaTotal}</span> : null}
            <a href={m.href} className="text-[12.5px] font-medium text-cyan hover:underline">
              პროდუქტის არჩევა →
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
