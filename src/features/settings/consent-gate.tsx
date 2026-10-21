'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Check, ShieldCheck, Trash2 } from 'lucide-react';
import { CONSENT_POINTS, DISCLOSURE, SUPERVISORY_AUTHORITY } from '@/knowledge/controller';
import { useConsent } from '@/features/settings/consent-store';
import { Collapsible, Panel } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/**
 * Blocks health-data processing until informed consent is given.
 *
 * Deliberate choices, each tied to a requirement:
 *  - nothing is pre-ticked; the box starts empty (Article 3(l), active action)
 *  - the full disclosure is on the same screen, not behind a link alone
 *    (Article 24(1), information before collection)
 *  - refusing leaves the deterministic modules usable, so consent is not a
 *    condition of the service (Article 32(2), voluntariness)
 *  - withdrawal sits next to the status, one click, no explanation (Article 20)
 */
export function ConsentGate({ children }: { children: ReactNode }) {
  const { granted, loading, grant, withdraw, consent } = useConsent();
  const [checked, setChecked] = useState<boolean[]>(CONSENT_POINTS.map(() => false));
  const all = checked.every(Boolean);

  if (loading) return null;

  if (!granted) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Panel
          title="ინფორმირებული თანხმობა"
          subtitle={'ჯანმრთელობის მონაცემის დამუშავებამდე — „პერსონალურ მონაცემთა დაცვის შესახებ“ საქართველოს კანონის მოთხოვნით'}
        >
          <p className="text-sm leading-relaxed text-slate-300">
            ამ მოდულში შეყვანილი ინფორმაცია ჯანმრთელობის მონაცემია. კანონი მოითხოვს, რომ დამუშავებამდე
            მიიღოთ სრული ინფორმაცია და გასცეთ წერილობითი თანხმობა. ქვემოთ მოცემულია ყველაფერი, რაც
            კანონით უნდა გაცნობოთ.
          </p>

          <div className="mt-4 space-y-1.5">
            {DISCLOSURE.map((d) => (
              <Collapsible key={d.labelKa} title={d.labelKa} defaultOpen={d.labelKa === 'გადაეცემა თუ არა სხვა ქვეყანაში'}>
                <p className="text-[13px] leading-relaxed text-slate-300">{d.bodyKa}</p>
              </Collapsible>
            ))}
          </div>

          <div className="mt-5 space-y-2.5 rounded-lg border border-line bg-ink-950/50 p-4">
            {CONSENT_POINTS.map((point, i) => (
              <label key={point} className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={checked[i]}
                  onChange={(e) =>
                    setChecked((prev) => prev.map((v, idx) => (idx === i ? e.target.checked : v)))
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 accent-cyan"
                />
                <span className="text-[13px] leading-relaxed text-slate-200">{point}</span>
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!all}
              onClick={() => grant([...CONSENT_POINTS])}
            >
              <Check className="h-4 w-4" /> ვეთანხმები და ვაგრძელებ
            </button>
            <Link href="/privacy" className="text-[12px] text-cyan hover:underline">
              სრული კონფიდენციალობის პოლიტიკა
            </Link>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
            თანხმობის გაცემა ნებაყოფლობითია. უარის შემთხვევაში სერვისის დანარჩენი ნაწილი — კალკულატორები,
            წამლების შემოწმება, მტკიცებულების ძიება — სრულად ხელმისაწვდომი რჩება. საჩივრის შეტანა
            შეგიძლიათ {SUPERVISORY_AUTHORITY.nameKa}ში.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-clinical-low/30 bg-clinical-low/5 px-3.5 py-2.5">
        <span className="flex items-center gap-2 text-[12px] text-clinical-low">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          თანხმობა გაცემულია{' '}
          {consent ? new Date(consent.grantedAtIso).toLocaleDateString('ka-GE') : ''}
        </span>
        <div className="flex items-center gap-3">
          <Link href="/privacy" className="text-[11px] text-slate-400 transition hover:text-slate-200">
            რა მუშავდება
          </Link>
          <button
            type="button"
            onClick={withdraw}
            className="flex items-center gap-1.5 text-[11px] text-slate-400 transition hover:text-clinical-critical"
          >
            <Trash2 className="h-3 w-3" /> თანხმობის გამოხმობა
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Styling hook kept separate so the gate stays presentation-light. */
export const consentPanelClass = cn('mx-auto max-w-3xl');
