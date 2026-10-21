'use client';

import { cn } from '@/lib/utils';

import Link from 'next/link';
import { AlertTriangle, BadgeCheck, BookOpen, CircleAlert, FileSearch, Link2 } from 'lucide-react';
import type { ClinicalAnswer, RiskClass } from '@/schemas/clinical';
import { RISK_LABELS } from '@/schemas/clinical';
import type { Claim, Source } from '@/schemas/evidence';
import type { OrchestrationPlan, AgentResult } from '@/schemas/agent';
import { Badge, Bullets, Collapsible, ExportBar, Panel } from '@/components/ui/primitives';
import { AgeWarningBox, DrugSummaryCard, IdentityRequired, type AgeWarning, type IdentityMention } from '@/features/meds/drug-summary-card';
import { AGENT_PANEL_KA, statusKa, toMarkdown } from './answer-export';
export { toMarkdown } from './answer-export';

export type ProvenanceEntry = {
  rule_id: string;
  kind: string;
  source_id: string;
  topic: string | null;
  source_section: string | null;
  source_pages: (number | string)[];
  source_vintage: string | null;
  maturity: string;
  validation_status: string;
  refresh_required: boolean;
  rights_status: string;
  href?: string;
  setting?: string;
};

export type ClinicalKnowledgeRef = {
  collection: string;
  package: string;
  noteKa: string;
  contextSectionIds: string[];
  partialSectionIds: string[];
  omittedSectionIds: string[];
  units: { id: string; href: string; topicTitle: string; sectionTitle: string; unitTitle: string; setting: string; settingKa: string; typesKa: string[]; snippet: string; hasMedia: boolean; linked?: boolean }[];
};

export type OrchestrateResult = {
  runId?: string;
  plan: OrchestrationPlan;
  answer: ClinicalAnswer;
  claims: Claim[];
  agentResults: AgentResult[];
  safety: { warnings: string[]; humanReviewRequired: boolean };
  routing: { tier: string; rationale: string };
  sources: Source[];
  kb?: { coverage: string; messageKa: string; ruleIds: string[]; hitCount: number };
  provenance?: ProvenanceEntry[];
  clinicalKnowledge?: ClinicalKnowledgeRef | null;
  verification?: {
    numerics: { text: string; kind: string; status: string; supportingRuleIds: string[]; noteKa: string }[];
    citations: { checks: { ruleId: string; status: string; reasonKa: string }[]; fabricated: string[] };
    freshness: { status: string; refreshRuleIds: string[]; oldestVintage: string | null; messageKa: string };
    contradictions: { a: { ruleId: string; position: string }; b: { ruleId: string; position: string }; newer: string | null }[];
  };
  release?: { status: string; reasonsKa: string[]; humanReviewRequired: boolean };
  publication?: { state: string; labelKa: string; noteKa: string };
};

const COVERAGE_KA: Record<string, string> = {
  COVERED: 'დაფარულია',
  PARTIAL: 'ნაწილობრივ დაფარულია',
  NOT_COVERED: 'არ არის დაფარული',
  KB_UNAVAILABLE: 'ცოდნის ბაზა მიუწვდომელია',
};

const RELEASE_KA: Record<string, string> = {
  PASS: 'გამოშვებულია',
  PASS_WITH_WARNING: 'გამოშვებულია გაფრთხილებით',
  HUMAN_REVIEW: 'საჭიროებს ადამიანურ მიმოხილვას',
  BLOCK: 'შეჩერებულია',
};

const FRESHNESS_KA: Record<string, string> = {
  CURRENT: 'აქტუალური',
  REFRESH_REQUIRED: 'საჭიროებს განახლებას',
  OUTDATED: 'მოძველებული',
  UNCERTAIN: 'გაურკვეველი',
};

type Tone = 'critical' | 'high' | 'moderate' | 'info' | 'neutral';
const riskTone = (r: RiskClass): Tone => (r === 'R5' ? 'critical' : r === 'R4' ? 'high' : r === 'R3' ? 'moderate' : r === 'R2' ? 'info' : 'neutral');


const INTENT_LEAD: Record<string, string> = {
  drug: 'A07', imaging: 'A11', documentation: 'A12', quality: 'A13', defect: 'A14', patient_education: 'A16', academy: 'A17', research: 'A18',
};

const PRIMARY_SECTIONS = ['assessment', 'ddx', 'next-steps', 'safety'];

export function AnswerView({ result, onClear }: { result: OrchestrateResult; onClear?: () => void }) {
  const { answer, plan, claims, sources, safety, routing, agentResults } = result;
  const renderPanels = (list: AgentResult[], open: boolean) => (
    <>
      {/*
        Specialist agents (imaging, documentation, academy, research, drug
        criteria, quality) return structured sections that the canonical
        summary sections above do not carry. Without this block their work was
        computed and then never shown on the main answer screen.
      */}
      {list.length > 0 && (
        <div className="space-y-2">
          {list.map((a, i) => (
            <Collapsible key={a.agentId} title={`${AGENT_PANEL_KA[a.agentId] ?? a.agentId} — ${a.summary.slice(0, 90)}${a.summary.length > 90 ? '…' : ''}`} defaultOpen={open && i === 0}>
              {a.agentId === 'A07' && ((a.data as { confirmedProduct?: unknown }).confirmedProduct || (a.data as { identityRequired?: unknown }).identityRequired) ? (
                <div className="space-y-3">
                  <AgeWarningBox warnings={((a.data as { ageWarnings?: AgeWarning[] }).ageWarnings) ?? []} />
                  <IdentityRequired mentions={((a.data as { identityRequired?: IdentityMention[] }).identityRequired) ?? []} />
                  {confirmedOf(a.data).map((p, k) => (
                    <div key={p.recordId} className="space-y-1">
                      {confirmedOf(a.data).length > 1 && <p className="label">{p.region === 'EU' ? 'ევროპა (EMA)' : 'აშშ (FDA)'}</p>}
                      <DrugSummaryCard
                        product={p}
                        autoLoad={open && i === 0}
                        original={k === 0 ? a.sections.filter((s) => s.titleEn !== 'Age restriction').map((s) => ({ key: s.titleEn, labelKa: s.titleKa, text: s.body || s.bullets.join(' · ') })) : undefined}
                      />
                    </div>
                  ))}
                  {a.note && <p className="text-xs text-slate-400">{a.note}</p>}
                </div>
              ) : (
              <div className="space-y-3">
                {a.sections.filter((s) => s.body || s.bullets.length).map((s, j) => (
                  <div key={j}>
                    <p className="label">{s.titleKa}</p>
                    {s.body && <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-300">{s.body}</p>}
                    {s.bullets.length > 0 && <Bullets items={s.bullets} className="mt-1" />}
                  </div>
                ))}
                {a.note && <p className="text-xs text-slate-400">{a.note}</p>}
              </div>
              )}
            </Collapsible>
          ))}
        </div>
      )}

    </>
  );
  // The agent driving this intent opens first; the others follow collapsed.
  // Task-specific agents run only when the request asked for their task, so
  // when the intent names no lead, the first of them present leads instead.
  const TASK = ['A11', 'A12', 'A18', 'A17', 'A13', 'A14'];
  const lead = INTENT_LEAD[plan.intent] && agentResults.some((a) => a.agentId === INTENT_LEAD[plan.intent] && a.status === 'ok')
    ? INTENT_LEAD[plan.intent]
    : TASK.find((id) => agentResults.some((a) => a.agentId === id && a.status === 'ok'));
  const specialist = agentResults
    .filter((a) => a.status === 'ok' && a.agentId in AGENT_PANEL_KA && a.sections.some((s) => s.body || s.bullets.length))
    .sort((x, y) => (x.agentId === lead ? -1 : y.agentId === lead ? 1 : 0));

  return (
    <div className="space-y-3 animate-fade-up">
      <Panel
        className={answer.emergency ? 'border-clinical-critical/50' : undefined}
        title="მოკლე პასუხი"
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {(answer.risk === 'R4' || answer.risk === 'R5') && <Badge tone={riskTone(answer.risk)}>{RISK_LABELS[answer.risk].ka}</Badge>}
            {answer.humanReviewRequired && (
              <Badge tone="moderate">
                <CircleAlert className="h-3 w-3" /> გადაამოწმეთ
              </Badge>
            )}
          </div>
        }
      >
        {answer.emergency && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-clinical-critical/45 bg-clinical-critical/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-clinical-critical" />
            <div>
              <p className="text-sm font-semibold text-clinical-critical">გადაუდებელი ნიშნები</p>
              <Bullets items={plan.redFlags} className="mt-1" />
            </div>
          </div>
        )}
        {result.publication && result.publication.state !== 'published' && (
          <div
            role="status"
            className={cn(
              'mb-3 rounded-lg border p-3 text-[13px] leading-relaxed',
              result.publication.state === 'withheld' ? 'border-clinical-critical/50 bg-clinical-critical/10' : result.publication.state === 'pending_human_review' ? 'border-clinical-high/50 bg-clinical-high/10' : 'border-clinical-moderate/45 bg-clinical-moderate/10',
            )}
          >
            <p className="font-semibold text-fg">{result.publication.labelKa}</p>
            {result.publication.noteKa && <p className="mt-0.5 text-slate-300">{result.publication.noteKa}</p>}
          </div>
        )}
        <p className="text-[15px] leading-relaxed text-slate-100">{answer.bottomLine}</p>
        <div className="mt-3">
          <ExportBar text={toMarkdown(result)} json={result} filename={`clinical-${answer.queryId.slice(0, 8)}`} onClear={onClear} clearLabelKa="პასუხის გასუფთავება" />
        </div>
      </Panel>

      {/* The specialist that drives this question comes straight after the bottom line. */}
      {specialist[0]?.agentId === lead && renderPanels(specialist.slice(0, 1), true)}

      {/* Reference units the answer drew on, linked to the student page. */}
      {result.clinicalKnowledge && result.clinicalKnowledge.units.length > 0 && <ClinicalReferencePanel ref_={result.clinicalKnowledge} />}

      {/* The four sections a clinician acts on stay visible; the rest of the
          analysis is one tap away instead of fourteen panels deep. */}
      <div className="space-y-2">
        {answer.sections.filter((s) => PRIMARY_SECTIONS.includes(s.id)).map((s) => (
          <Collapsible key={s.id} title={s.titleKa} tone={s.tone} defaultOpen>
            {s.body && <p className="mb-2 whitespace-pre-line text-sm leading-relaxed text-slate-300">{s.body}</p>}
            <Bullets items={s.bullets} />
          </Collapsible>
        ))}
        {answer.sections.some((s) => !PRIMARY_SECTIONS.includes(s.id)) && (
          <Collapsible title={`სრული ანალიზი (${answer.sections.filter((s) => !PRIMARY_SECTIONS.includes(s.id)).length} განყოფილება)`} defaultOpen={false}>
            <div className="space-y-4">
              {answer.sections.filter((s) => !PRIMARY_SECTIONS.includes(s.id)).map((s) => (
                <div key={s.id}>
                  <p className={cn('mb-1 text-[13px] font-semibold', s.tone === 'critical' ? 'text-clinical-critical' : 'text-fg')}>{s.titleKa}</p>
                  {s.body && <p className="mb-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-300">{s.body}</p>}
                  <Bullets items={s.bullets} />
                </div>
              ))}
            </div>
          </Collapsible>
        )}
      </div>

      {renderPanels(specialist[0]?.agentId === lead ? specialist.slice(1) : specialist, specialist[0]?.agentId !== lead)}

      {sources.length > 0 && (
        <Collapsible title={`წყაროები (${sources.length})`} defaultOpen={false}>
          <ul className="space-y-2">
            {sources.map((s) => (
              <li key={s.source_id} className="text-[13px] leading-relaxed text-slate-300">
                {s.citation_text}
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer noopener" className="ml-1.5 inline-flex items-center gap-1 text-[12px] text-cyan hover:underline">
                    <Link2 className="h-3 w-3" /> გახსნა
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Collapsible>
      )}

      <Collapsible title="როგორ შემოწმდა პასუხი" defaultOpen={false}>
        <div className="space-y-3">
      {claims.length > 0 && (
          <Panel title="მტკიცებების ვერიფიკაცია (A19)" subtitle="დაუდასტურებელი მნიშვნელოვანი მტკიცება არ ქვეყნდება როგორც დეფინიტიური რეკომენდაცია">
            <ul className="space-y-2">
              {claims.map((c) => (
                <li key={c.claim_id} className="rounded-lg border border-line bg-ink-850/40 p-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={c.verification_status === 'supported' ? 'low' : c.verification_status === 'unsupported' ? 'critical' : c.verification_status === 'conflicting' ? 'high' : 'moderate'}>
                      {c.verification_status === 'supported' ? <BadgeCheck className="h-3 w-3" /> : <FileSearch className="h-3 w-3" />}
                      {statusKa[c.verification_status]}
                    </Badge>
                    <Badge>{c.clinical_importance}</Badge>
                    <Badge>სიძლიერე: {c.support_strength}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-300">{c.claim_text}</p>
                  {c.source_ids.length > 0 && <p className="mt-1 font-mono text-[10px] text-slate-500">{c.source_ids.join(' · ')}</p>}
                  {c.note && <p className="mt-1 text-[11px] text-clinical-moderate">{c.note}</p>}
                </li>
              ))}
            </ul>
          </Panel>
        )}
  
        {result.provenance && result.provenance.length > 0 && (
          <Panel title="წყაროები და დასაბუთება" subtitle="თითოეული წესი, რომელზეც პასუხი დაეყრდნო — შიდა ცოდნის ბაზიდან">
            <Collapsible title="რატომ მივიღეთ ეს პასუხი?" defaultOpen={false}>
              <p className="mb-2 text-sm leading-relaxed text-slate-300">
                პასუხი აიგო მხოლოდ ქვემოთ ჩამოთვლილ, რეალურად მოძიებულ წესებზე დაყრდნობით. წესი, რომელიც ამ სიაში არ არის, პასუხში ციტირებული ვერ იქნება.
              </p>
              <Bullets
                items={[
                  `მოთხოვნა კლასიფიცირდა როგორც ${plan.intent}, რისკის კლასი ${answer.risk}.`,
                  `ჰიბრიდულმა მოძიებამ დააბრუნა ${result.kb?.hitCount ?? 0} წესი; დაფარვა — ${COVERAGE_KA[result.kb?.coverage ?? ''] ?? '—'}.`,
                  `ვერიფიკაცია: ${result.verification?.numerics.length ?? 0} რიცხვითი მტკიცება, ${result.verification?.citations.checks.length ?? 0} ციტირება, სიახლე — ${FRESHNESS_KA[result.verification?.freshness.status ?? ''] ?? '—'}.`,
                  `საბოლოო ბარიერის გადაწყვეტილება: ${RELEASE_KA[result.release?.status ?? ''] ?? '—'}.`,
                ]}
              />
            </Collapsible>
            <ul className="mt-2 space-y-2">
              {result.provenance.map((p) => (
                <li key={p.rule_id} className="rounded-lg border border-line bg-ink-850/40 p-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] text-cyan">{p.rule_id}</span>
                    <Badge>{p.kind === 'clinical_rule' ? 'კლინიკური წესი' : p.kind === 'quality_rule' ? 'ხარისხის წესი' : p.kind === 'clinical_unit' ? 'საცნობარო ერთეული' : 'აუდიტის კითხვა'}</Badge>
                    {p.href && (
                      <Link href={p.href} className="inline-flex items-center gap-1 text-[12px] text-cyan hover:underline">
                        <Link2 className="h-3 w-3" /> გახსნა
                      </Link>
                    )}
                    <Badge tone={p.maturity.includes('CANDIDATE') ? 'moderate' : 'low'}>{p.maturity}</Badge>
                    <Badge tone="moderate">{p.validation_status}</Badge>
                    {p.refresh_required && <Badge tone="high">საჭიროებს აქტუალურ გადამოწმებას</Badge>}
                  </div>
                  {p.topic && <p className="mt-1.5 text-[13px] leading-relaxed text-slate-300">{p.topic}</p>}
                  <p className="mt-1 text-[11px] text-slate-500">
                    წყარო: {p.source_id}
                    {p.source_section ? ` · სექცია: ${p.source_section}` : ''}
                    {p.source_pages.length ? ` · გვ. ${p.source_pages.join(', ')}` : ''}
                    {p.source_vintage ? ` · ვინტაჟი: ${p.source_vintage}` : ''}
                    {` · უფლებები: ${p.rights_status}`}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        )}
  
        {result.verification && (result.verification.numerics.length > 0 || result.verification.citations.checks.length > 0) && (
          <Panel title="ვერიფიკაცია" subtitle="რიცხვები, ციტირებები და წყაროს სიახლე მოწმდება ცალკე ეტაპებად">
            {result.verification.numerics.length > 0 && (
              <div className="mb-3">
                <p className="label mb-1">რიცხვითი მნიშვნელობები</p>
                <ul className="space-y-1.5">
                  {result.verification.numerics.map((n, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 rounded border border-line bg-ink-850/40 px-2.5 py-1.5 text-sm text-slate-300">
                      <Badge tone={n.status.startsWith('VERIFIED') ? 'low' : 'high'}>{n.status === 'VERIFIED_AGAINST_RULE' ? 'დადასტურებული წესით' : n.status === 'VERIFIED_AGAINST_ENGINE' ? 'აგენტის შედეგიდან' : 'დაუდასტურებელი'}</Badge>
                      <span className="font-mono text-xs">{n.text}</span>
                      <span className="text-[11px] text-slate-500">{n.noteKa}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.verification.citations.fabricated.length > 0 && (
              <div className="mb-3 rounded-lg border border-clinical-critical/45 bg-clinical-critical/10 p-2.5">
                <p className="text-sm font-semibold text-clinical-critical">უარყოფილი ციტირებები</p>
                <Bullets items={result.verification.citations.fabricated.map((f) => `${f} — ასეთი წესი ცოდნის ბაზაში არ არსებობს; მითითება პასუხიდან ამოღებულია.`)} />
              </div>
            )}
            <p className="label mb-1">წყაროს სიახლე</p>
            <p className="text-sm text-slate-300">
              {FRESHNESS_KA[result.verification.freshness.status] ?? result.verification.freshness.status}
              {result.verification.freshness.messageKa ? ` — ${result.verification.freshness.messageKa}` : ''}
            </p>
          </Panel>
        )}
  
  
      <Collapsible title="ორკესტრაციის ტრეისი" defaultOpen={false}>
        <div className="space-y-2 text-xs text-slate-400">
          <p>{plan.rationale}</p>
          <p>მოდელის მარშრუტიზაცია: {routing.rationale}</p>
          <div className="flex flex-wrap gap-1.5">
            {agentResults.map((a) => (
              <span key={a.agentId} className="chip font-mono text-[10px]">
                {a.agentId}: {a.status}
              </span>
            ))}
          </div>
          {safety.warnings.length > 0 && (
            <div>
              <p className="label mt-2">უსაფრთხოების ბარიერი</p>
              <Bullets items={safety.warnings} />
            </div>
          )}
        </div>
      </Collapsible>
        </div>
      </Collapsible>
    </div>
  );
}

/**
 * The units of the clinical reference collection this answer drew on, one
 * line each, linking straight to the unit on the student page. Setting is
 * written out (not colour-coded) because the two settings are never merged.
 */
function ClinicalReferencePanel({ ref_ }: { ref_: ClinicalKnowledgeRef }) {
  const seen = new Set<string>();
  const units = ref_.units.filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)));
  const settings = new Set(units.map((u) => u.setting));
  return (
    <Collapsible title={`საცნობარო მასალა (${units.length})`} defaultOpen>
      <p className="mb-2 text-[12px] leading-relaxed text-slate-400">{ref_.noteKa}</p>
      {settings.size > 1 && (
        <p className="mb-2 text-[12px] leading-relaxed text-clinical-moderate">
          მასალა ორი გარემოდანაა — გადაუდებელი მედიცინა და ინტენსიური თერაპია. ვერსიები ცალ-ცალკეა; შეადარეთ, სანამ გამოიყენებთ.
        </p>
      )}
      <ul className="space-y-1.5">
        {units.map((u) => (
          <li key={u.id}>
            <Link href={u.href} className="group block rounded-lg border border-line bg-ink-850/40 p-2.5 hover:border-cyan/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan">
              <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                <BookOpen className="h-3.5 w-3.5 text-cyan" aria-hidden />
                <span>{u.topicTitle}</span>
                <span aria-hidden>·</span>
                <span>{u.settingKa}</span>
                {u.typesKa.length > 0 && <span aria-hidden>·</span>}
                {u.typesKa.length > 0 && <span>{u.typesKa.join(', ')}</span>}
                <span aria-hidden>·</span>
                <span>{u.linked ? 'პასუხის დებულებას უკავშირდება' : 'თემით დაკავშირებული მასალა'}</span>
              </span>
              <span className="mt-1 block text-[13px] font-medium text-fg group-hover:text-cyan">{u.unitTitle}</span>
              {u.snippet && <span className="mt-0.5 block text-[12px] leading-relaxed text-slate-400">{u.snippet}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {(ref_.omittedSectionIds.length > 0 || ref_.partialSectionIds.length > 0) && (
        <p className="mt-2 text-[11px] text-slate-500">
          ზოგი სექცია მოცულობის გამო პასუხის მომზადებისას სრულად არ გამოიყენებოდა — სრული ტექსტი ბმულებზეა.
        </p>
      )}
    </Collapsible>
  );
}

type ProductRef = { query: string; recordId: number; token: string; region?: 'US' | 'EU' };
/** A07 data: one confirmed product, or a US and an EU product (shown apart). */
function confirmedOf(data: unknown): ProductRef[] {
  const d = (data ?? {}) as { confirmedProduct?: ProductRef; confirmedProducts?: ProductRef[] };
  return d.confirmedProducts?.length ? d.confirmedProducts : d.confirmedProduct ? [d.confirmedProduct] : [];
}
