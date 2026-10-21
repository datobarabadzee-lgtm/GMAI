'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, ChevronDown, ExternalLink, FileText, Globe2, Loader2 } from 'lucide-react';
import { ErrorState } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { DrugSummaryCard } from './drug-summary-card';
import { post } from './med-api';
import { saveConfirmed } from './confirmed-store';

/**
 * EUROPE (EMA) — the second, separate source on the medication page.
 *
 * Exact name → EMA medicines (each with its own EMA product number) → the
 * product-information PDF is read on the server → every SmPC in it is shown
 * with its checked identity → the user confirms one → its sections. Nothing
 * here is linked to the FDA result above; the two are compared side by side
 * only after both were confirmed separately.
 */

export type EmaCandidate = {
  record_id: number;
  ema_number: string;
  name: string;
  active_substance: string;
  inn: string;
  status: string;
  mah: string;
  atc: string;
  generic: boolean;
  biosimilar: boolean;
  match_kind: 'name' | 'previous_name' | 'active_substance' | 'inn';
  pi_available: boolean;
  pi_updated: string;
  medicine_url: string;
  selectable: boolean;
  noteKa: string | null;
};
export type EmaSearch = { query: string; total: number; candidates: EmaCandidate[]; messageKa: string; unavailable?: boolean };
type EmaIdentity = {
  record_id: number;
  source_id: string;
  effective: string;
  brand_names: string[];
  generic_names: string[];
  ingredients: { name: string; strength: string }[];
  dosage_forms: string[];
  manufacturer: string | null;
  linked: { noteKa: string };
  complete: boolean;
  missingKa: string[];
  smpc_index: number;
  smpc_count: number;
  smpc_name: string;
  medicine_url: string;
  pi_url: string;
};
export type Section = { key: string; titleKa: string; text: string; truncated: boolean };
export type EmaConfirmed = { token: string; expires_at: number; identity: EmaIdentity; retrieved_at: string; index: { key: string; titleKa: string; chars: number }[]; sections: Section[]; recordId: number; query: string };

const MATCH_KA: Record<EmaCandidate['match_kind'], string> = { name: 'სავაჭრო სახელი', previous_name: 'წინა სახელი', active_substance: 'მოქმედი ნივთიერება', inn: 'INN' };

export function EmaPanel({ data, onConfirmed }: { data: EmaSearch; onConfirmed: (c: EmaConfirmed | null) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ loading: boolean; error: string | null; identities: EmaIdentity[] }>({ loading: false, error: null, identities: [] });
  const [confirming, setConfirming] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState<{ error: string | null; data: EmaConfirmed | null }>({ error: null, data: null });
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setSelected(null);
    setPreview({ loading: false, error: null, identities: [] });
    setConfirmed({ error: null, data: null });
    onConfirmed(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.query]);

  const choose = async (id: number) => {
    setSelected(id);
    setConfirmed({ error: null, data: null });
    onConfirmed(null);
    setPreview({ loading: true, error: null, identities: [] });
    const r = await post<{ identities: EmaIdentity[] }>('/api/medications/preview', { query: data.query, recordId: id }).catch(() => null);
    if (!r) return setPreview({ loading: false, error: 'სერვერთან კავშირი ვერ დამყარდა.', identities: [] });
    setPreview({ loading: false, error: r.ok ? null : r.data.messageKa ?? 'ევროპული ინსტრუქცია ვერ ჩაიტვირთა.', identities: r.ok ? r.data.identities : [] });
    requestAnimationFrame(() => document.getElementById('ema-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const confirm = async (recordId: number) => {
    setConfirming(recordId);
    const r = await post<Omit<EmaConfirmed, 'recordId' | 'query'>>('/api/medications/confirm', { query: data.query, recordId }).catch(() => null);
    setConfirming(null);
    if (!r || !r.ok) return setConfirmed({ error: r?.data.messageKa ?? 'დადასტურება ვერ მოხერხდა.', data: null });
    const c: EmaConfirmed = { ...r.data, recordId, query: data.query };
    setConfirmed({ error: null, data: c });
    onConfirmed(c);
    saveConfirmed('EU', { query: data.query, recordId, token: c.token, title: `${c.identity.smpc_name} (EMA)`.slice(0, 140), expires_at: c.expires_at });
  };

  const loadMore = async (key: string, start: number) => {
    const c = confirmed.data;
    if (!c) return;
    const r = await post<{ sections: Section[] }>('/api/medications/context', { query: c.query, recordId: c.recordId, token: c.token, section: key, start }).catch(() => null);
    if (!r || !r.ok) return setConfirmed((x) => ({ ...x, error: r?.data.messageKa ?? 'სექცია ვერ ჩაიტვირთა.' }));
    const add = r.data.sections[0];
    if (!add) return;
    setConfirmed((x) => {
      if (!x.data) return x;
      const exists = x.data.sections.find((s) => s.key === key);
      const sections = exists ? x.data.sections.map((s) => (s.key === key ? { ...s, text: s.text + add.text, truncated: add.truncated } : s)) : [...x.data.sections, add];
      return { ...x, data: { ...x.data, sections } };
    });
  };

  const list = showAll ? data.candidates : data.candidates.slice(0, 8);
  return (
    <section className="space-y-3" aria-label="ევროპის წამლების სააგენტო (EMA)">
      <div className="flex items-center gap-2">
        <Globe2 className="h-4 w-4 text-cyan" aria-hidden />
        <h2 className="text-[15px] font-semibold text-fg">ევროპა — EMA</h2>
        <span className="text-[12px] text-slate-500">ცალკე წყარო; FDA-ს ჩანაწერს ავტომატურად არ უკავშირდება</span>
      </div>
      <div className={cn('rounded-xl border p-3 text-[13.5px] leading-relaxed', data.total ? 'border-line bg-ink-900 text-slate-300' : 'border-line/70 bg-ink-900/60 text-slate-400')}>
        <p>{data.messageKa}</p>
        {data.total > 0 && <p className="mt-0.5 text-[12px] text-slate-500">{data.total} ჩანაწერი · {data.candidates.filter((c) => c.selectable).length} არჩევადი (მოქმედი რეგისტრაცია + ინსტრუქცია)</p>}
      </div>

      {list.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {list.map((c) => (
            <li key={c.record_id} className="min-w-0">
              <div className={cn('h-full rounded-xl border bg-ink-900 p-3', selected === c.record_id ? 'border-cyan' : 'border-line')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-fg">{c.name}</p>
                    <p className="text-[12px] text-slate-400">{c.active_substance || c.inn}</p>
                  </div>
                  <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-slate-400">EU · {MATCH_KA[c.match_kind]}</span>
                </div>
                <dl className="mt-2 space-y-0.5 text-[12px] text-slate-400">
                  <Row k="რეგისტრაციის მფლობელი" v={c.mah || '—'} />
                  <Row k="სტატუსი" v={`${c.status}${c.generic ? ' · გენერიკი' : ''}${c.biosimilar ? ' · ბიოსიმილარი' : ''}`} />
                  <Row k="EMA ნომერი" v={`${c.ema_number}${c.atc ? ` · ATC ${c.atc}` : ''}`} />
                  {c.pi_updated && <Row k="ინსტრუქციის განახლება" v={c.pi_updated} />}
                </dl>
                {c.medicine_url && (
                  <a href={c.medicine_url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 text-[12px] text-cyan hover:underline">
                    EMA-ს გვერდი <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
                {c.selectable ? (
                  <button type="button" className="btn mt-2 w-full !min-h-0 !py-1.5 text-[12.5px]" onClick={() => void choose(c.record_id)} aria-pressed={selected === c.record_id}>
                    ევროპული ინსტრუქციის შემოწმება
                  </button>
                ) : (
                  <p className="mt-2 text-[11.5px] text-slate-500">{c.noteKa}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.candidates.length > 8 && !showAll && (
        <button type="button" className="btn !min-h-0 !py-1.5 text-[12.5px]" onClick={() => setShowAll(true)}>
          ყველა ({data.candidates.length})
        </button>
      )}

      {selected !== null && (
        <div id="ema-preview" className="panel scroll-mt-20 space-y-3 p-4">
          <h3 className="text-[15px] font-semibold text-fg">ევროპული პროდუქტის იდენტობა</h3>
          {preview.loading && (
            <p className="flex items-center gap-2 text-[13px] text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> EMA-ს ინსტრუქცია (PDF) იკითხება და მოწმდება — დასახელება, მოქმედი ნივთიერება, სიძლიერე, ფორმა…
            </p>
          )}
          {preview.error && <ErrorState title="ვერ შემოწმდა" detail={preview.error} />}
          {preview.identities.length > 1 && <p className="text-[12.5px] text-slate-400">ამ ინსტრუქციაში {preview.identities.length} ცალკე პროდუქტის აღწერაა (SmPC) — აირჩიეთ თქვენი ფორმა და სიძლიერე.</p>}
          {preview.identities.map((id) => (
            <div key={id.record_id} className={cn('space-y-2 rounded-lg border p-3', confirmed.data?.recordId === id.record_id ? 'border-clinical-low/60' : 'border-line')}>
              <p className="text-[13.5px] font-semibold text-fg">{id.smpc_name}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Cell k="მოქმედი ნივთიერება" v={id.ingredients.map((i) => i.name).join('; ')} />
                <Cell k="სიძლიერე (SmPC, ნაწილი 2)" v={id.ingredients.map((i) => i.strength).join('; ')} />
                <Cell k="ფორმა (ნაწილი 3)" v={id.dosage_forms.join('; ')} />
                <Cell k="რეგისტრაციის მფლობელი" v={id.manufacturer ?? ''} />
              </div>
              <p className="text-[12px] leading-relaxed text-slate-500">
                {id.linked.noteKa} · განახლება {id.effective} ·{' '}
                <a href={id.pi_url} target="_blank" rel="noreferrer noopener" className="text-cyan hover:underline">
                  PDF
                </a>
              </p>
              {!id.complete ? (
                <p className="flex gap-2 rounded-lg border border-clinical-high/50 bg-clinical-high/10 p-2.5 text-[12.5px] text-slate-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-clinical-high" aria-hidden />
                  დადასტურება შეუძლებელია — ვერ შემოწმდა: {id.missingKa.join(', ')}. ამ პროდუქტზე ინსტრუქცია არ გამოჩნდება.
                </p>
              ) : confirmed.data?.recordId === id.record_id ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-clinical-low/50 bg-clinical-low/10 px-2 py-0.5 text-[12px] font-medium text-clinical-low">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> დადასტურებულია
                </span>
              ) : (
                <button type="button" className="btn btn-primary !min-h-0 !py-1.5 text-[13px]" onClick={() => void confirm(id.record_id)} disabled={confirming !== null}>
                  {confirming === id.record_id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BadgeCheck className="h-4 w-4" aria-hidden />} ვადასტურებ — ეს ჩემი პროდუქტია
                </button>
              )}
            </div>
          ))}
          {confirmed.error && <ErrorState title="ევროპული ინსტრუქცია ვერ გამოჩნდა" detail={confirmed.error} />}
        </div>
      )}

      {confirmed.data && (
        <div className="panel space-y-3 p-4" aria-label="დადასტურებული ევროპული ინსტრუქცია">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-clinical-low/50 bg-clinical-low/10 px-2 py-0.5 text-[12px] font-medium text-clinical-low">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> ევროპა (EMA) · იდენტობა დადასტურებულია
            </span>
            <span className="text-[12px] text-slate-500">
              {confirmed.data.identity.source_id} · განახლება {confirmed.data.identity.effective} · ჩამოტვირთულია {new Date(confirmed.data.retrieved_at).toLocaleString('ka-GE')}
            </span>
          </div>
          <p className="text-[12px] text-slate-500">ევროპული ინსტრუქცია (SmPC). კლინიკური ვალიდაცია არ ჩატარებულა; საქართველოში რეგისტრირებული ფორმის ინსტრუქცია შეიძლება განსხვავდებოდეს.</p>
          <DrugSummaryCard product={{ query: confirmed.data.query, recordId: confirmed.data.recordId, token: confirmed.data.token }} />
          <SectionList index={confirmed.data.index} sections={confirmed.data.sections} onMore={loadMore} />
        </div>
      )}
    </section>
  );
}

export function SectionList({ index, sections, onMore }: { index: { key: string; titleKa: string }[]; sections: Section[]; onMore: (key: string, start: number) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="label">ორიგინალი ტექსტი (ინგლისურად)</p>
      {index.map((ix) => {
        const sec = sections.find((s) => s.key === ix.key);
        return (
          <details key={ix.key} className="group rounded-lg border border-line bg-ink-900">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[13.5px] font-medium text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-500" aria-hidden />
                {ix.titleKa}
              </span>
              <ChevronDown className="h-4 w-4 text-slate-500 transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="border-t border-line px-3 py-2.5">
              {sec ? (
                <>
                  <p className="whitespace-pre-line break-words text-[12.5px] leading-relaxed text-slate-300">{sec.text}</p>
                  {sec.truncated && (
                    <button type="button" className="mt-2 text-[12px] text-cyan hover:underline" onClick={() => onMore(ix.key, sec.text.length)}>
                      გაგრძელება…
                    </button>
                  )}
                </>
              ) : (
                <button type="button" className="text-[12px] text-cyan hover:underline" onClick={() => onMore(ix.key, 0)}>
                  ჩატვირთვა
                </button>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

/**
 * The same section from the two confirmed products, next to each other.
 * Labelled by regulator; nothing is merged, reconciled or ranked.
 */
export function CompareSections({ us, eu }: { us: { title: string; sections: Section[]; index: { key: string; titleKa: string }[] }; eu: { title: string; sections: Section[]; index: { key: string; titleKa: string }[] } }) {
  const keys = ['indications_and_usage', 'contraindications', 'dosage_and_administration', 'warnings_and_cautions', 'drug_interactions', 'pregnancy', 'adverse_reactions', 'overdosage'];
  const titleOf = (k: string) => us.index.find((i) => i.key === k)?.titleKa ?? eu.index.find((i) => i.key === k)?.titleKa ?? k;
  const text = (sections: Section[], k: string) => sections.find((s) => s.key === k)?.text ?? '';
  const clip = (t: string) => (t.length > 1500 ? `${t.slice(0, 1500)}… (სრული ტექსტი — ზემოთ)` : t);
  const rows = keys.filter((k) => text(us.sections, k) || text(eu.sections, k));
  if (!rows.length) return null;
  return (
    <section className="panel space-y-3 p-4" aria-label="შედარება: აშშ და ევროპა">
      <h2 className="text-[15px] font-semibold text-fg">შედარება — აშშ (FDA) და ევროპა (EMA)</h2>
      <p className="text-[12.5px] leading-relaxed text-slate-400">
        ორი სხვადასხვა მარეგულირებლის ინსტრუქცია: {us.title} · {eu.title}. განსხვავება (ჩვენებები, უკუჩვენებები, დოზა) მოსალოდნელია; ერთი მეორით არ ჩანაცვლდება.
      </p>
      {rows.map((k) => (
        <details key={k} className="group rounded-lg border border-line bg-ink-900" open={k === 'contraindications'}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[13.5px] font-medium text-fg">
            {titleOf(k)}
            <ChevronDown className="h-4 w-4 text-slate-500 transition group-open:rotate-180" aria-hidden />
          </summary>
          <div className="grid gap-3 border-t border-line px-3 py-2.5 md:grid-cols-2">
            {[
              ['აშშ (FDA)', text(us.sections, k)],
              ['ევროპა (EMA)', text(eu.sections, k)],
            ].map(([who, t]) => (
              <div key={who} className="min-w-0">
                <p className="label mb-1">{who}</p>
                <p className="whitespace-pre-line break-words text-[12.5px] leading-relaxed text-slate-300">{t ? clip(t) : 'ამ ინსტრუქციაში ეს ნაწილი არ არის.'}</p>
              </div>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 text-slate-500">{k}:</dt>
      <dd className="min-w-0 break-words text-slate-300">{v}</dd>
    </div>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div className={cn('min-w-0 rounded-lg border p-2.5', v ? 'border-line' : 'border-clinical-high/50')}>
      <p className="text-[11px] font-medium text-slate-500">{k}</p>
      <p className={cn('mt-0.5 break-words text-[13px]', v ? 'text-fg' : 'text-clinical-high')}>{v || 'ვერ შემოწმდა'}</p>
    </div>
  );
}
