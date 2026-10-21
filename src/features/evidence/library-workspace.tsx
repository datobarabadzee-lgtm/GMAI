'use client';

import { useMemo, useState } from 'react';
import { Library, Search, Lock } from 'lucide-react';
import type { Source } from '@/schemas/evidence';
import { Badge, EmptyState, Panel } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const CATEGORIES: { id: string; labelKa: string; match: (s: Source) => boolean }[] = [
  { id: 'all', labelKa: 'ყველა', match: () => true },
  { id: 'guidelines', labelKa: 'გაიდლაინები', match: (s) => s.source_type === 'guideline' },
  { id: 'books', labelKa: 'წიგნები / ცნობარები', match: (s) => s.source_type === 'textbook' },
  { id: 'protocols', labelKa: 'პროტოკოლები', match: (s) => s.source_type === 'local_protocol' },
  { id: 'articles', labelKa: 'სტატიები', match: (s) => ['rct', 'cohort', 'case_control', 'systematic_review', 'meta_analysis'].includes(s.source_type) },
  { id: 'drugs', labelKa: 'წამლის წყაროები', match: (s) => s.source_type === 'drug_label' || s.specialty.includes('clinical pharmacology') },
  { id: 'georgian', labelKa: 'ქართული წყაროები', match: (s) => s.jurisdiction === 'georgia' },
  { id: 'quality', labelKa: 'ხარისხი და უსაფრთხოება', match: (s) => s.specialty.includes('quality') || s.specialty.includes('patient safety') || s.specialty.includes('infection control') },
  { id: 'education', labelKa: 'განათლება', match: (s) => s.specialty.includes('digital health') || s.specialty.includes('health informatics') },
];

const RIGHTS = ['OPEN', 'PUBLIC_DOMAIN', 'LICENSED', 'INTERNAL_REFERENCE', 'RESTRICTED', 'UNKNOWN'] as const;

type LibItem = Source & { restrictedNoteKa: string };

export function LibraryWorkspace({ items }: { items: LibItem[] }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [rights, setRights] = useState<string>('');

  const filtered = useMemo(() => {
    const cat = CATEGORIES.find((c) => c.id === category)!;
    const n = q.toLowerCase().trim();
    return items.filter((s) => {
      if (!cat.match(s)) return false;
      if (rights && s.rights_status !== rights) return false;
      if (!n) return true;
      return [s.title, s.publisher, s.key_finding, ...s.keywords].join(' ').toLowerCase().includes(n);
    });
  }, [items, q, category, rights]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Panel>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input className="field pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ძიება სათაურით, გამომცემლით ან საკვანძო სიტყვით…" />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" onClick={() => setCategory(c.id)} className={cn('rounded-full border px-3 py-1 text-xs transition', c.id === category ? 'border-cyan/50 bg-cyan/15 text-fg' : 'border-line text-slate-400 hover:text-slate-200')}>
              {c.labelKa}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setRights('')} className={cn('rounded-full border px-2.5 py-0.5 text-[11px] transition', !rights ? 'border-cyan/45 text-fg' : 'border-line text-slate-500')}>
            ყველა უფლება
          </button>
          {RIGHTS.map((r) => (
            <button key={r} type="button" onClick={() => setRights(r)} className={cn('rounded-full border px-2.5 py-0.5 text-[11px] transition', rights === r ? 'border-cyan/45 text-fg' : 'border-line text-slate-500')}>
              {r}
            </button>
          ))}
        </div>
      </Panel>

      {filtered.length === 0 ? (
        <EmptyState title="ჩანაწერი ვერ მოიძებნა" description="შეცვალეთ ფილტრები ან საკვანძო სიტყვა. ბიბლიოთეკა ივსება rights-aware ingestion pipeline-ით." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((s) => (
            <Panel key={s.source_id} className="p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={s.rights_status === 'OPEN' || s.rights_status === 'PUBLIC_DOMAIN' ? 'low' : s.rights_status === 'RESTRICTED' || s.rights_status === 'UNKNOWN' ? 'critical' : 'moderate'}>
                  {(s.rights_status === 'RESTRICTED' || s.rights_status === 'INTERNAL_REFERENCE' || s.rights_status === 'UNKNOWN') && <Lock className="h-3 w-3" />}
                  {s.rights_status}
                </Badge>
                <Badge>{s.source_type}</Badge>
                <Badge tone={s.freshness === 'current' ? 'low' : s.freshness === 'review_due' ? 'moderate' : 'neutral'}>{s.freshness}</Badge>
              </div>
              <h3 className="mt-2 text-sm font-semibold leading-snug text-slate-100">{s.title}</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {s.publisher} · {s.year} · v{s.version}
              </p>
              {s.key_finding && <p className="mt-2 text-[13px] leading-relaxed text-slate-300">{s.key_finding}</p>}
              {s.excerpt ? (
                <blockquote className="mt-2 border-l-2 border-cyan/40 pl-3 text-xs italic leading-relaxed text-slate-400">{s.excerpt}</blockquote>
              ) : (
                <p className="mt-2 rounded-md border border-line bg-ink-950/60 p-2 text-[11px] leading-relaxed text-slate-500">{s.restrictedNoteKa}</p>
              )}
              <p className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-slate-500">{s.citation_text}</p>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-600">
                <span>ბოლო შემოწმება: {s.last_checked}</span>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-cyan hover:underline">
                    წყარო
                  </a>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Panel title="უფლებრივი პოლიტიკა" actions={<Library className="h-4 w-4 text-cyan" />}>
        <p className="text-sm leading-relaxed text-slate-400">
          ღია წვდომის ფილოსოფია არ აუქმებს საავტორო უფლებას. RESTRICTED, INTERNAL_REFERENCE და UNKNOWN სტატუსის წყაროების სრული ტექსტი საჯარო ინტერფეისში არ ქვეყნდება — ხელმისაწვდომია მხოლოდ მეტამონაცემები და ციტირება. UNKNOWN სტატუსი ნიშნავს კარანტინს უფლებრივი მიმოხილვის დასრულებამდე.
        </p>
      </Panel>
    </div>
  );
}
