'use client';

import { useEffect, useState } from 'react';
import { Database, RefreshCw } from 'lucide-react';
import { Badge, Bullets, EmptyState, ErrorState, Panel, Skeleton, Table } from '@/components/ui/primitives';

type Health = {
  available: boolean;
  messageKa?: string;
  stats?: Record<string, number>;
  embedding?: { provider: string; model: string; dim: number; semantic: boolean; labelKa: string };
  sources?: Record<string, string | number>[];
  versions?: Record<string, string | number>[];
  runs?: Record<string, string | number>[];
  errorsByCode?: { severity: string; code: string; n: number }[];
  maturityClinical?: { maturity: string; n: number }[];
  maturityQuality?: { maturity: string; n: number }[];
  families?: { rule_family: string; n: number }[];
  topics?: { title: string; clinical_rules: number }[];
  defectClasses?: { name: string; n: number }[];
};

const STAT_KA: Record<string, string> = {
  sources: 'წყაროები',
  versions: 'წყაროს ვერსიები',
  clinicalTopics: 'კლინიკური თემები',
  clinicalRules: 'კლინიკური წესები',
  qualityRules: 'ხარისხის წესები',
  taxonomyNodes: 'ტაქსონომიის კვანძები',
  auditQuestions: 'აუდიტის კითხვები',
  searchItems: 'საძიებო ერთეულები',
  vectors: 'ვექტორები',
  quarantined: 'კარანტინში მოთავსებული ჩანაწერები',
  warnings: 'გაფრთხილებები',
  refreshRequired: 'საჭიროებს მტკიცებულების განახლებას',
  numericSensitive: 'რიცხვითი ვერიფიკაციის საჭიროებით',
  humanReview: 'ადამიანური მიმოხილვის საჭიროებით',
  productionCds: 'production CDS-ად დაშვებული',
  autonomousLegal: 'ავტონომიური სამართლებრივი დასკვნით',
};

export function KnowledgeHealth() {
  const [data, setData] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/kb/health');
      setData((await res.json()) as Health);
    } catch {
      setError('ცოდნის ბაზის მდგომარეობა ვერ ჩაიტვირთა.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <Panel title="ცოდნის ბაზის მდგომარეობა"><Skeleton lines={6} /></Panel>;
  if (error) return <ErrorState title="ვერ ჩაიტვირთა" detail={error} />;
  if (!data?.available)
    return <EmptyState title="ცოდნის ბაზა არ არის იმპორტირებული" description={data?.messageKa ?? 'გაუშვით npm run kb:import.'} />;

  const s = data.stats ?? {};

  return (
    <div className="space-y-4">
      <Panel
        title="ცოდნის ბაზის მდგომარეობა"
        subtitle={`ემბედინგი: ${data.embedding?.model} · ${data.embedding?.dim}d`}
        actions={
          <button type="button" className="btn btn-ghost text-xs" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> განახლება
          </button>
        }
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Badge tone={data.embedding?.semantic ? 'low' : 'moderate'}>
            <Database className="h-3 w-3" /> {data.embedding?.labelKa}
          </Badge>
          <Badge tone={Number(s.autonomousLegal) === 0 ? 'low' : 'critical'}>ავტონომიური სამართლებრივი დასკვნა: {s.autonomousLegal}</Badge>
          <Badge tone={Number(s.productionCds) === 0 ? 'low' : 'moderate'}>production CDS: {s.productionCds}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(s).map(([k, v]) => (
            <div key={k} className="panel-tight px-3 py-2.5">
              <p className="text-lg font-semibold tabular-nums text-cyan">{v}</p>
              <p className="text-[11px] leading-tight text-slate-400">{STAT_KA[k] ?? k}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="წყაროები და უფლებრივი სტატუსი">
          <Table
            headers={['წყარო', 'ტიპი', 'უფლებები', 'ვინტაჟი']}
            rows={(data.sources ?? []).map((x) => [String(x.name), String(x.source_type), <Badge key="r" tone={String(x.rights_class).startsWith('RESTRICTED') ? 'critical' : 'moderate'}>{String(x.rights_class)}</Badge>, String(x.source_vintage ?? '—')])}
          />
        </Panel>
        <Panel title="ვერსიები">
          <Table
            headers={['ვერსია', 'ფაილი', 'ჩანაწერები', 'სტატუსი', 'აქტიური']}
            rows={(data.versions ?? []).map((x) => [String(x.version_id).slice(0, 28), String(x.file_name), String(x.record_count), String(x.validation_status), Number(x.active) ? 'დიახ' : 'არა'])}
          />
        </Panel>
      </div>

      <Panel title="იმპორტის გაშვებები">
        <Table
          headers={['გაშვება', 'დაწყება', 'სტატუსი', 'ფაილები', 'მიღებული', 'კარანტინში']}
          rows={(data.runs ?? []).map((r) => [String(r.run_id), String(r.started_at).slice(0, 19).replace('T', ' '), <Badge key="s" tone={r.status === 'SUCCESS' ? 'low' : r.status === 'PARTIAL' ? 'moderate' : 'critical'}>{String(r.status)}</Badge>, String(r.files_seen), String(r.records_accepted), String(r.records_quarantined)])}
        />
        {(data.errorsByCode ?? []).length > 0 && (
          <div className="mt-3">
            <p className="label mb-1">ვალიდაციის შედეგები</p>
            <Bullets items={(data.errorsByCode ?? []).map((e) => `${e.severity}: ${e.code} — ${e.n}`)} />
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="კლინიკური წესების სიმწიფე">
          <Table headers={['სტატუსი', 'რაოდენობა']} rows={(data.maturityClinical ?? []).map((m) => [m.maturity, String(m.n)])} />
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">არცერთი ეს სტატუსი არ ნიშნავს PRODUCTION_CDS-ს. კანდიდატი წესი არ გამოიყენება ავტონომიური გადაწყვეტილებისთვის.</p>
        </Panel>
        <Panel title="ხარისხის წესების სიმწიფე">
          <Table headers={['სტატუსი', 'რაოდენობა']} rows={(data.maturityQuality ?? []).map((m) => [m.maturity, String(m.n)])} />
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">HUMAN_JUDGMENT_RULE არასდროს განიხილება ავტონომიურ დეტერმინისტულ სამართლებრივ წესად; QUALITY_RULE_CANDIDATE დეფექტს ავტომატურად არ აცხადებს.</p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="დეფექტის კლასები">
          <Bullets items={(data.defectClasses ?? []).map((d) => d.name)} />
        </Panel>
        <Panel title="წესების ოჯახები">
          <Table headers={['ოჯახი', 'რაოდენობა']} rows={(data.families ?? []).slice(0, 12).map((f) => [String(f.rule_family ?? '—'), String(f.n)])} />
        </Panel>
      </div>

      <Panel title="კლინიკური თემების დაფარვა" subtitle="ყველაზე დიდი თემები წესების რაოდენობით">
        <Table headers={['თემა', 'წესები']} rows={(data.topics ?? []).map((t) => [t.title, String(t.clinical_rules)])} />
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          კორპუსი ფარავს კონკრეტულ თემებს. თუ კითხვა ამ თემებს გარეთაა, სისტემა ამას ცხადად აცხადებს და შიდა წესებზე დაფუძნებულ დასკვნას არ გასცემს.
        </p>
      </Panel>
    </div>
  );
}
