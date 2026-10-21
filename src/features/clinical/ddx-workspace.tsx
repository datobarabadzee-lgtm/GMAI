'use client';

import { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { useCase } from '@/features/case/case-store';
import { useRole } from '@/features/settings/role-store';
import { Badge, EmptyState, ErrorState, ExportBar, Panel, Skeleton, Table } from '@/components/ui/primitives';
import type { OrchestrateResult } from './answer-view';
import { AttestationBox } from '@/features/settings/attestation-box';

type Row = { dx: string; tier: string; category: string; supporting: string; against: string; test: string; urgency: string };

const CATEGORY_KA: Record<string, string> = {
  most_likely: 'ყველაზე სავარაუდო',
  must_not_miss: 'არ უნდა გამოგვრჩეს',
  mimic: 'მიმიკები',
  less_likely: 'ნაკლებად სავარაუდო, მაგრამ მნიშვნელოვანი',
};

const TIER_TONE: Record<string, 'critical' | 'high' | 'moderate' | 'low' | 'neutral'> = {
  High: 'high',
  Moderate: 'moderate',
  Low: 'low',
  'Very Low': 'neutral',
};

export function DdxWorkspace() {
  const { patient } = useCase();
  const { authHeaders } = useRole();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrchestrateResult | null>(null);

  const run = async () => {
    const question = text.trim() || patient.narrative.trim();
    if (!question) {
      setError('შეიყვანეთ კლინიკური სურათი ან აირჩიეთ ქეისი Case Workspace-ში.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ question, mode: 'deep', patient }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.messageKa ?? 'ანალიზი ვერ დასრულდა.');
        setResult(null);
        return;
      }
      setResult(json as OrchestrateResult);
    } catch {
      setError('სერვერთან კავშირი ვერ დამყარდა.');
    } finally {
      setLoading(false);
    }
  };

  const a02 = result?.agentResults.find((a) => a.agentId === 'A02');
  const rows = ((a02?.data?.rows as Row[] | undefined) ?? []).slice();
  const grouped = ['most_likely', 'must_not_miss', 'mimic', 'less_likely'].map((cat) => ({ cat, rows: rows.filter((r) => r.category === cat) })).filter((g) => g.rows.length);

  const md = rows.length
    ? `# დიფერენციული დიაგნოზი\n\n${grouped
        .map((g) => `## ${CATEGORY_KA[g.cat]}\n${g.rows.map((r) => `- **${r.dx}** (${r.tier})\n  - მხარდამჭერი: ${r.supporting}\n  - საწინააღმდეგო: ${r.against}\n  - დიფერენცირებადი კვლევა: ${r.test}\n  - გადაუდებლობა: ${r.urgency}`).join('\n')}`)
        .join('\n\n')}\n\nალბათობა გამოსახულია კატეგორიებით (High/Moderate/Low/Very Low) — გამოგონილი რიცხვითი ალბათობები არ გამოიყენება.`
    : '';

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Panel title="კლინიკური სურათი" subtitle="თავისუფალი ტექსტი ან Case Workspace-ის პაციენტი">
        <textarea className="field min-h-[110px] resize-y" value={text} onChange={(e) => setText(e.target.value)} placeholder={patient.narrative ? `ქეისი ჩატვირთულია: ${patient.label}. სურვილისამებრ დააზუსტეთ კითხვა…` : 'აღწერეთ პაციენტი: ასაკი, ჩივილები, ხანგრძლივობა, რისკ-ფაქტორები, ობიექტური სტატუსი…'} />
        <div className="mt-3">
          <AttestationBox needed={Boolean(text.trim() || patient.narrative)} />
        </div>
        <button type="button" className="btn btn-primary mt-3" onClick={() => void run()} disabled={loading}>
          <GitBranch className="h-4 w-4" /> {loading ? 'მიმდინარეობს…' : 'DDx გენერაცია'}
        </button>
      </Panel>

      {loading && (
        <Panel>
          <Skeleton lines={6} />
        </Panel>
      )}

      {error && !loading && <ErrorState title="ვერ დასრულდა" detail={error} />}

      {!loading && !error && result && rows.length === 0 && (
        <Panel title="DDx ჩარჩო">
          <p className="text-sm text-slate-300">{a02?.note || 'ამ სინდრომისთვის წინასწარ დამუშავებული DDx ნაკრები რეესტრში ვერ მოიძებნა.'}</p>
          <p className="mt-2 text-sm text-slate-400">გამოიყენეთ სისტემური ჩარჩო: ვასკულური · ინფექციური · ნეოპლაზიური · დეგენერაციული · იატროგენული/წამლისმიერი · მეტაბოლური · აუტოიმუნური · ტრავმული · თანდაყოლილი.</p>
        </Panel>
      )}

      {!loading && rows.length > 0 && (
        <>
          <Panel title="დიფერენციული დიაგნოზი" subtitle="ალბათობა კატეგორიებით — გამოგონილი რიცხვითი ალბათობა არ გამოიყენება" actions={<ExportBar text={md} json={rows} filename="ddx" onClear={() => { setResult(null); setError(null); }} />}>
            <Table
              headers={['დიაგნოზი', 'ალბათობა', 'მხარდამჭერი ნიშნები', 'საწინააღმდეგო ნიშნები', 'დიფერენცირებადი კვლევა', 'გადაუდებლობა', 'Must not miss']}
              rows={rows.map((r) => [
                r.dx,
                <Badge key="t" tone={TIER_TONE[r.tier] ?? 'neutral'}>
                  {r.tier}
                </Badge>,
                r.supporting,
                r.against,
                r.test,
                r.urgency,
                r.category === 'must_not_miss' ? <Badge key="m" tone="critical">კი</Badge> : '—',
              ])}
            />
          </Panel>

          {grouped.map((g) => (
            <Panel key={g.cat} title={CATEGORY_KA[g.cat]}>
              <ul className="space-y-2">
                {g.rows.map((r) => (
                  <li key={r.dx} className="rounded-lg border border-line bg-ink-850/40 p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-slate-100">{r.dx}</span>
                      <Badge tone={TIER_TONE[r.tier] ?? 'neutral'}>{r.tier}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">დიფერენცირება: {r.test}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </>
      )}

      {!loading && !error && !result && <EmptyState title="დიფერენციული დიაგნოზი" description="აღწერეთ კლინიკური სურათი — სისტემა დააბრუნებს სტრუქტურირებულ DDx-ს მხარდამჭერი და საწინააღმდეგო ნიშნებით, დიფერენცირებადი კვლევითა და გადაუდებლობით." />}
    </div>
  );
}
