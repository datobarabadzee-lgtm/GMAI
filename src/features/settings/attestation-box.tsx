'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { PROFESSIONAL_ATTESTATION_KA } from '@/knowledge/controller';
import { useRole } from './role-store';

/**
 * The professional's affirmation before patient-specific data go to the AI
 * provider (audit F07). The server refuses such requests without it; this is
 * where it is given, once per browser session, and where it can be withdrawn.
 */
export function AttestationBox({ needed }: { needed: boolean }) {
  const { attested, attest, revokeAttestation } = useRole();
  const [checked, setChecked] = useState(false);
  if (attested) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5 text-clinical-low" aria-hidden /> პაციენტის მონაცემების გადაცემის საფუძველი დადასტურებულია ამ სესიაში.
        <button type="button" className="text-cyan hover:underline" onClick={revokeAttestation}>
          გაუქმება
        </button>
      </p>
    );
  }
  if (!needed) return null;
  return (
    <div role="note" className="space-y-2 rounded-xl border border-clinical-moderate/45 bg-clinical-moderate/10 p-3 text-[12.5px] leading-relaxed text-slate-200">
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>{PROFESSIONAL_ATTESTATION_KA}</span>
      </label>
      <button type="button" className="btn btn-primary !min-h-0 !py-1 text-[12px]" disabled={!checked} onClick={attest}>
        ვადასტურებ
      </button>
    </div>
  );
}
