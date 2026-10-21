import type { Claim } from '@/schemas/evidence';
import { RISK_LABELS } from '@/schemas/clinical';
import type { OrchestrateResult } from './answer-view';

/**
 * Markdown export of a clinical answer. It is built only from the payload the
 * server published: a withheld answer (release BLOCK) no longer contains the
 * stopped text, and the publication state is the first line of every export
 * (audit F03).
 */

export const statusKa: Record<Claim['verification_status'], string> = {
  supported: 'დადასტურებული',
  partially_supported: 'ნაწილობრივ დადასტურებული',
  unsupported: 'დაუდასტურებელი',
  conflicting: 'წინააღმდეგობრივი',
  not_verified: 'არ შემოწმებულა',
};

export function toMarkdown(r: OrchestrateResult): string {
  const lines: string[] = [];
  lines.push(`# ${r.answer.mode.toUpperCase()} — კლინიკური პასუხი`);
  if (r.publication) lines.push(`**სტატუსი: ${r.publication.labelKa}**${r.publication.noteKa ? ` — ${r.publication.noteKa}` : ''}`);
  lines.push(`რისკის კლასი: ${r.answer.risk} (${RISK_LABELS[r.answer.risk].ka}) · განზრახვა: ${r.answer.intent} · რეჟიმი: ${r.answer.engine}`);
  lines.push('');
  lines.push(`## მოკლე პასუხი\n${r.answer.bottomLine}`);
  r.answer.sections.forEach((s) => {
    lines.push(`\n## ${s.titleKa} / ${s.titleEn}`);
    if (s.body) lines.push(s.body);
    s.bullets.forEach((b) => lines.push(`- ${b}`));
  });
  r.agentResults
    .filter((a) => a.status === 'ok' && a.agentId in AGENT_PANEL_KA)
    .forEach((a) => {
      lines.push(`\n## ${AGENT_PANEL_KA[a.agentId]}\n${a.summary}`);
      a.sections.forEach((s) => {
        if (!s.body && !s.bullets.length) return;
        lines.push(`\n### ${s.titleKa}`);
        if (s.body) lines.push(s.body);
        s.bullets.forEach((b) => lines.push(`- ${b}`));
      });
    });
  if (r.claims.length) {
    lines.push('\n## მტკიცებების ვერიფიკაცია');
    r.claims.forEach((c) => lines.push(`- [${statusKa[c.verification_status]}] ${c.claim_text} — წყაროები: ${c.source_ids.join(', ') || 'არ არის'}`));
  }
  if (r.sources.length) {
    lines.push('\n## წყაროები');
    r.sources.forEach((s) => lines.push(`- ${s.citation_text}${s.url ? ` — ${s.url}` : ''} [${s.rights_status} · ${s.freshness}]`));
  }
  if (r.clinicalKnowledge?.units.length) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    lines.push('\n## საცნობარო მასალა');
    r.clinicalKnowledge.units.forEach((u) => lines.push(`- ${u.topicTitle} — ${u.unitTitle} (${u.settingKa}) — ${origin}${u.href}`));
    lines.push(`_${r.clinicalKnowledge.noteKa}_`);
  }
  lines.push(`\n---\nგენერირებულია: ${r.answer.generatedAt}. ეს არის კლინიკური გადაწყვეტილების მხარდაჭერა და არა დანიშნულება.`);
  return lines.join('\n');
}


export const AGENT_PANEL_KA: Record<string, string> = {
  A07: 'წამალი (A07)',
  A11: 'ვიზუალიზაციის დასკვნა (A11)',
  A12: 'დოკუმენტაცია (A12)',
  A13: 'ხარისხის აუდიტი (A13)',
  A14: 'დეფექტის ანალიზი (A14)',
  A16: 'ახსნა პაციენტისთვის (A16)',
  A17: 'სასწავლო მასალა (A17)',
  A18: 'კვლევა და ლიტერატურა (A18)',
};
