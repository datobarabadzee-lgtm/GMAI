'use client';

import { useEffect, useState } from 'react';
import { BookOpen, FileSearch, ShieldAlert } from 'lucide-react';
import { Badge, Bullets, Collapsible, EmptyState, ErrorState, ExportBar, Panel, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

type Finding = {
  ruleId: string;
  family: string;
  familyKa: string;
  maturity: string;
  relevance: number;
  triggerKa: string | null;
  criterionKa: string | null;
  defectClasses: { code: string | null; nameKa: string }[];
  requiredEvidence: string[];
  exceptions: string[];
  chapterPath: string[];
  gates: {
    causality: boolean;
    standardComparison: boolean;
    documentationReview: boolean;
    humanReviewRequired: boolean;
    automation: string;
  };
};

type AuditResponse = {
  findings: Finding[];
  candidateClasses?: { code: string | null; nameKa: string; support: number; ruleIds: string[] }[];
  questions: { id: string; questionKa: string; defectClasses: string[]; evidence: string[]; chapterPath: string[]; relevance: number }[];
  requiredEvidence: { dimension: string; labelKa: string; ruleCount: number }[];
  missingEvidence: { dimension: string; labelKa: string; ruleCount: number }[];
  gates: {
    causalityRequired: boolean;
    standardComparisonRequired: boolean;
    documentationReviewRequired: boolean;
  } | null;
  disclaimerKa?: string;
  messageKa?: string;
  corpus?: { rulesActive: number; rulesExtracted: number; auditQuestions: number; source: string };
};

type CorpusStats = {
  manifest: { rulesActive: number; rulesExtracted: number; auditQuestions: number; taxonomyNodes: number; families: number; source: string; author: string; ingestedAt: string };
  defectClasses: { code: string | null; nameKa: string; auditQuestions: number }[];
  families: { family: string; labelKa: string; rules: number }[];
};

const MATURITY_KA: Record<string, string> = {
  STRUCTURED_DECISION_RULE: 'სტრუქტურირებული წესი',
  COMPUTABLE_AUDIT_CHECK: 'გამოთვლადი შემოწმება',
  HIGH_COMPUTABILITY_RULE: 'მაღალი გამოთვლადობა',
  HUMAN_JUDGMENT_RULE: 'ადამიანური შეფასება',
};

export function CorpusAudit({ narrative }: { narrative: string }) {
  const [stats, setStats] = useState<CorpusStats | null>(null);
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [evidence, setEvidence] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/quality/audit')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setStats(j as CorpusStats))
      .catch(() => undefined);
  }, []);

  const run = async (withEvidence = evidence) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/quality/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ narrative, evidenceAvailable: withEvidence }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.messageKa ?? 'კორპუსის მოძიება ვერ შესრულდა.');
        setResult(null);
        return;
      }
      setResult(json as AuditResponse);
    } catch {
      setError('სერვერთან კავშირი ვერ დამყარდა.');
    } finally {
      setLoading(false);
    }
  };

  const toggleEvidence = (dim: string) => {
    const next = evidence.includes(dim) ? evidence.filter((d) => d !== dim) : [...evidence, dim];
    setEvidence(next);
    if (result) void run(next);
  };

  const md = result?.findings.length
    ? `# კორპუსიდან მოძიებული კრიტერიუმები\n\n${result.findings
        .map(
          (f) =>
            `## ${f.ruleId} — ${f.familyKa}\n**კრიტერიუმი:** ${f.criterionKa ?? '—'}\n${f.triggerKa ? `**ტრიგერი:** ${f.triggerKa}\n` : ''}**წყარო:** ${f.chapterPath.join(' > ') || '—'}\n**საჭირო მტკიცებულება:** ${f.requiredEvidence.join(', ') || '—'}`,
        )
        .join('\n\n')}\n\n---\n${result.disclaimerKa ?? ''}`
    : '';

  return (
    <div className="space-y-4">
      <Panel
        title="ხარისხის კორპუსი"
        subtitle={
          stats
            ? `${stats.manifest.rulesActive} აქტიური წესი ${stats.manifest.rulesExtracted}-დან · ${stats.manifest.auditQuestions} აუდიტის კითხვა · ${stats.manifest.taxonomyNodes} ტაქსონომიის კვანძი`
            : 'იტვირთება…'
        }
        actions={
          <button type="button" className="btn btn-primary text-xs" onClick={() => void run()} disabled={loading || narrative.trim().length < 40}>
            <FileSearch className="h-3.5 w-3.5" /> კორპუსში ძიება
          </button>
        }
      >
        {narrative.trim().length < 40 ? (
          <p className="text-sm leading-relaxed text-amber-300/90">
            ქეისის აღწერა უნდა იყოს სულ მცირე 40 სიმბოლო. მონაცემის გარეშე სისტემა დეფექტს არ აკვალიფიცირებს — ეს განზრახ შეზღუდვაა.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-slate-400">
            ძიება მიმდინარეობს ავტორის სახელმძღვანელოს კორპუსში. ყოველ ნაპოვნ კრიტერიუმს ახლავს წესის ID და თავის მისამართი — შედეგი გადამოწმებადია პირველწყაროში.
          </p>
        )}
        {stats && (
          <p className="mt-2 font-mono text-[10px] text-slate-500">
            წყარო: {stats.manifest.source} · {stats.manifest.author} · ჩატვირთულია {stats.manifest.ingestedAt}
          </p>
        )}
      </Panel>

      {loading && (
        <Panel>
          <Skeleton lines={6} />
        </Panel>
      )}
      {error && !loading && <ErrorState title="ძიება ვერ შესრულდა" detail={error} />}

      {!loading && result && !result.findings.length && (
        <EmptyState title="რელევანტური კრიტერიუმი ვერ მოიძებნა" description={result.messageKa ?? ''} />
      )}

      {!loading && result && result.findings.length > 0 && (
        <>
          {result.gates && (result.gates.causalityRequired || result.gates.standardComparisonRequired || result.gates.documentationReviewRequired) && (
            <Panel title="სავალდებულო შეფასების ეტაპები" subtitle="კორპუსის მიერ მოთხოვნილი — გამოტოვება დასკვნას აბათილებს">
              <Bullets
                items={[
                  result.gates.causalityRequired ? 'მიზეზობრიობის დამოუკიდებელი შეფასება' : '',
                  result.gates.standardComparisonRequired ? 'მოქმედ სტანდარტთან შედარება მოვლენის დროის მიხედვით' : '',
                  result.gates.documentationReviewRequired ? 'დოკუმენტაციის შეფასება კლინიკური შესრულებისგან ცალკე' : '',
                ].filter(Boolean)}
              />
            </Panel>
          )}

          {result.candidateClasses && result.candidateClasses.length > 0 && (
            <Panel title="სავარაუდო დეფექტის კლასები" subtitle="რანჟირებულია მხარდამჭერი წესების რიცხვით — არა ალბათობით">
              <div className="grid gap-2 sm:grid-cols-2">
                {result.candidateClasses.map((c) => (
                  <div key={c.nameKa} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-ink-850/40 p-3">
                    <p className="text-[13px] text-slate-100">
                      {c.code && <span className="mr-2 font-mono text-cyan">{c.code}</span>}
                      {c.nameKa}
                    </p>
                    <span className="shrink-0 font-mono text-[11px] text-slate-400">{c.support} წესი</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel
            title="საჭირო მტკიცებულება"
            subtitle="ეს არის დოკუმენტები, რომლებსაც მოძიებული კრიტერიუმები ითხოვს — არა ის, რაც კლინიკას აკლია"
          >
            <p className="mb-3 text-[12px] leading-relaxed text-slate-400">
              ქვემოთ ჩამოთვლილია მტკიცებულების ის განზომილებები, რომლებზეც ამ შემთხვევის კრიტერიუმები ეყრდნობა.
              <b className="text-slate-200"> მონიშნეთ ის, რაც ხელთ გაქვთ</b> — სისტემა გადათვლის, რისი შეფასებაც ჯერ შეუძლებელია.
              სანამ არაფერია მონიშნული, ყველა განზომილება ითვლება შეუმოწმებლად.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {result.requiredEvidence.map((e) => {
                const have = evidence.includes(e.dimension);
                return (
                  <button
                    key={e.dimension}
                    type="button"
                    onClick={() => toggleEvidence(e.dimension)}
                    aria-pressed={have}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs transition',
                      have
                        ? 'border-clinical-low/50 bg-clinical-low/15 text-clinical-low'
                        : 'border-line text-slate-400 hover:border-cyan/40 hover:text-slate-200',
                    )}
                  >
                    {have ? '✓ ' : '+ '}
                    {e.labelKa} <span className="font-mono text-[10px] opacity-70">×{e.ruleCount}</span>
                  </button>
                );
              })}
            </div>
            {result.missingEvidence.length > 0 ? (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-[13px] font-medium text-amber-300">
                  შეფასება ჯერ არასრულია — {result.missingEvidence.length} განზომილება შეუმოწმებელია
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-amber-200/70">
                  {result.missingEvidence.map((e) => e.labelKa).join(' · ')}
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  ეს არ ნიშნავს, რომ დოკუმენტი არ არსებობს — ნიშნავს, რომ სისტემას ის არ წარუდგინეს.
                  დასკვნა ამ მასალის ნახვამდე არ არის სრული.
                </p>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-clinical-low/30 bg-clinical-low/5 p-3">
                <p className="text-[13px] font-medium text-clinical-low">ყველა საჭირო განზომილება მონიშნულია</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  შეფასება შეიძლება ჩაითვალოს მასალით უზრუნველყოფილად. დასკვნას მაინც ადამიანი აკეთებს.
                </p>
              </div>
            )}
          </Panel>

          <Panel
            title="მოძიებული კრიტერიუმები"
            subtitle={`${result.findings.length} წესი · ყოველი ID-ით და თავის მისამართით`}
            actions={
            <ExportBar
              text={md}
              json={result}
              filename="quality-corpus-audit"
              onClear={() => {
                setResult(null);
                setEvidence([]);
                setError(null);
              }}
            />
          }
          >
            <div className="space-y-2">
              {result.findings.map((f) => (
                <Collapsible key={f.ruleId} title={`${f.ruleId} — ${f.familyKa}`}>
                  {f.triggerKa && (
                    <p className="mb-2 text-sm leading-relaxed text-slate-200">
                      <span className="label mr-1">ტრიგერი:</span>
                      {f.triggerKa}
                    </p>
                  )}
                  {f.criterionKa && <p className="mb-2 text-sm leading-relaxed text-slate-300">{f.criterionKa}</p>}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="info">{MATURITY_KA[f.maturity] ?? f.maturity}</Badge>
                    {f.gates.humanReviewRequired && <Badge tone="moderate">ადამიანური განხილვა</Badge>}
                    {f.defectClasses.map((c) => (
                      <Badge key={c.nameKa}>{c.nameKa}</Badge>
                    ))}
                  </div>
                  {f.requiredEvidence.length > 0 && (
                    <p className="mt-2 text-[11px] text-slate-500">
                      საჭირო მტკიცებულება: {f.requiredEvidence.join(' · ')}
                    </p>
                  )}
                  {f.exceptions.length > 0 && (
                    <div className="mt-2">
                      <p className="label mb-1">გამონაკლისები</p>
                      <Bullets items={f.exceptions} />
                    </div>
                  )}
                  <p className="mt-2 flex items-start gap-1.5 font-mono text-[10px] leading-relaxed text-slate-500">
                    <BookOpen className="mt-0.5 h-3 w-3 shrink-0" />
                    {f.chapterPath.join(' > ') || 'მისამართი არ არის'}
                  </p>
                </Collapsible>
              ))}
            </div>
          </Panel>

          {result.questions.length > 0 && (
            <Panel title="აუდიტის კითხვები" subtitle="სახელმძღვანელოს კითხვების ბანკიდან — უშუალოდ ამ შემთხვევისთვის">
              <ol className="space-y-2">
                {result.questions.map((q) => (
                  <li key={q.id} className="rounded-lg border border-line bg-ink-850/40 p-3">
                    <p className="text-sm leading-relaxed text-slate-200">{q.questionKa}</p>
                    <p className="mt-1.5 font-mono text-[10px] text-slate-500">
                      {q.id}
                      {q.defectClasses.length ? ` · ${q.defectClasses.join(', ')}` : ''}
                      {q.evidence.length ? ` · ${q.evidence.join(', ')}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          {result.disclaimerKa && (
            <div className="flex gap-2.5 rounded-lg border border-line bg-ink-950/60 p-3.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-[12px] leading-relaxed text-slate-400">{result.disclaimerKa}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
