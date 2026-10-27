import { addMonthsIso } from '@/prevention/engine';
import { STATUS_KA, VACCINE_STATUS_KA } from '@/prevention/labels';
import type { PreventionPlan } from '@/prevention/types';

type Plan = Extract<PreventionPlan, { kind: 'PLAN' }>;

const addDaysIso = (d: string, days: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
};

/** RFC 5545 text escaping and 75-octet line folding (folded on characters, which is safe for UTF-8 readers). */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 60) {
    out.push(rest.slice(0, 60));
    rest = ` ${rest.slice(60)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

/**
 * A calendar file with one all-day reminder per test that is due, overdue or
 * has a known next date. Nothing leaves the device: the file is built here.
 */
export function buildIcs(plan: Plan, today: string): { ics: string; count: number } {
  const stamp = `${today.replace(/-/g, '')}T000000Z`;
  const events: string[] = [];
  for (const s of plan.screening) {
    let date: string | null = null;
    if (s.status === 'overdue') date = addDaysIso(today, 7);
    else if (s.status === 'due') date = addDaysIso(today, 14);
    else if (s.status === 'up_to_date' && s.nextDue) date = s.nextDue;
    if (!date) continue;
    const d = date.replace(/-/g, '');
    const end = addDaysIso(date, 1).replace(/-/g, '');
    events.push(
      [
        'BEGIN:VEVENT',
        `UID:gmai-prev-${s.id}-${d}@leadermed`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${d}`,
        `DTEND;VALUE=DATE:${end}`,
        fold(`SUMMARY:${esc(`${s.shortKa} — პრევენციის გეგმა`)}`),
        fold(`DESCRIPTION:${esc(`${s.titleKa}. ${s.frequencyKa}. ${s.whyKa}`)}`),
        'BEGIN:VALARM',
        'TRIGGER:-P1D',
        'ACTION:DISPLAY',
        fold(`DESCRIPTION:${esc(s.shortKa)}`),
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n'),
    );
  }
  const flu = plan.vaccines.find((v) => v.id === 'influenza');
  if (flu) {
    const date = flu.nextDue ?? addDaysIso(today, 14);
    const d = date.replace(/-/g, '');
    events.push(
      ['BEGIN:VEVENT', `UID:gmai-prev-flu-${d}@leadermed`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${addDaysIso(date, 1).replace(/-/g, '')}`, fold(`SUMMARY:${esc('გრიპის ვაქცინა — პრევენციის გეგმა')}`), 'END:VEVENT'].join('\r\n'),
    );
  }
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LeaderMed//GMAI Prevention//KA', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n');
  return { ics, count: events.length };
}

export function downloadBlob(filename: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Plain-text plan for WhatsApp, copy and the Word export. */
export function planSections(plan: Plan): { heading: string; body: string }[] {
  const sections: { heading: string; body: string }[] = [];
  const active = plan.screening.filter((s) => s.status !== 'not_needed');
  sections.push({
    heading: 'სკრინინგ-კალენდარი',
    body: active.map((s) => `• ${s.titleKa} — ${STATUS_KA[s.status]}. ${s.frequencyKa}${s.nextDue ? `. შემდეგი: ${s.nextDue}` : ''}`).join('\n') || '—',
  });
  sections.push({
    heading: 'რისკის შეფასება',
    body: plan.risks.filter((r) => r.available).map((r) => `• ${r.titleKa}: ${r.summaryKa}${r.leverKa ? ` ${r.leverKa}` : ''}`).join('\n') || 'მონაცემები არ იყო საკმარისი.',
  });
  sections.push({
    heading: 'ვაქცინები',
    body: plan.vaccines.filter((v) => v.status !== 'not_needed').map((v) => `• ${v.titleKa} — ${VACCINE_STATUS_KA[v.status]}. ${v.frequencyKa}`).join('\n'),
  });
  if (plan.preconception) sections.push({ heading: 'ორსულობამდე მომზადება', body: plan.preconception.map((p) => `• ${p.titleKa}`).join('\n') });
  if (plan.goals.length) sections.push({ heading: 'ჩემი მიზნები', body: plan.goals.map((g) => `• ${g.titleKa}: ${g.targetKa}`).join('\n') });
  sections.push({ heading: 'რაზე არ ღირს ფულის დახარჯვა', body: plan.lowValue.map((l) => `• ${l.titleKa}`).join('\n') });
  return sections;
}

export function planText(plan: Plan): string {
  return [`ჩემი პრევენციის გეგმა (${plan.ageYears} წ., ${plan.sex === 'female' ? 'ქალი' : 'მამაკაცი'}) — ${plan.generatedFor}`, ...planSections(plan).map((s) => `\n${s.heading}\n${s.body}`)].join('\n');
}

export { addMonthsIso };
