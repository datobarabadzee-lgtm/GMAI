import { ok, skipped, type AgentContext, type AgentImpl } from './context';
import type { AgentResult } from '@/schemas/agent';
import { analyzeImagingReport, looksLikeImagingReport, type ImagingFinding } from '@/lib/imaging-report';
import { DOC_TEMPLATES, type DocTemplate } from '@/knowledge/document-templates';
import { extractLabsFromProse, findRef, interpretLabs, type LabInterpretation } from '@/lib/labs';
import { withoutNegatedRequests } from '@/services/intent-text';
import { GEORGIAN_TERMS } from '@/knowledge/georgian-context';
import { matchRules, matchAuditQuestions } from '@/knowledge/quality-corpus';
import { ruleLine } from './quality-profile';
import { GENERIC_PATIENT_RED_FLAGS, PATIENT_RED_FLAGS, glossaryFor } from '@/knowledge/patient-glossary';
import { CONDITION_CARDS, cardsFor, livesWith } from '@/knowledge/condition-cards';
import { GRADE_KA, screenMedicationList } from '@/knowledge/low-value-meds';
import { LEVEL_KA, TOPICS, type Topic } from '@/knowledge/academy';
import { suggestCalculators } from '@/lib/calculators';
import { findComparisonTopics } from '@/knowledge/guidelines';
import { EVIDENCE_TIER_KA, citationText, searchLiterature } from '@/services/literature';
import { englishSearchTerms, withCeiling } from '@/services/search-terms';
import { retrieveRules } from '@/kb/retrieval-service';
import { SETTING_KA } from '@/knowledge/clinical-v2';

/**
 * PHASE 2 AGENTS — documentation, patient education, academy, imaging.
 *
 * Each of these was a stub that returned a heading and a promise. Each now
 * produces its output from a real engine: the document templates and the
 * author's documentation rules, a plain-language glossary, the curated
 * teaching units plus live guideline and review search, and a deterministic
 * radiology-report parser with published follow-up rules.
 *
 * None of them calls a model. The one model call per question remains the
 * synthesis step, which only phrases what these agents already established.
 */

const fullText = (c: AgentContext) =>
  withoutNegatedRequests([c.question, c.plan, c.patient.narrative, c.patient.problems.join(' '), c.patient.medications.map((m) => m.drug).join(' ')].join(' '));

const sexKa = (s: string) => (s === 'male' ? 'მამრობითი' : s === 'female' ? 'მდედრობითი' : '');

const LAB_STATUS_KA: Record<LabInterpretation['status'], string> = {
  critical_low: 'კრიტიკულად დაბალი',
  low: 'დაბალი',
  normal: 'ნორმა',
  high: 'მაღალი',
  critical_high: 'კრიტიკულად მაღალი',
  unknown: 'რეფერენსი უცნობია',
};

/** Labs from the structured context plus any written into the question itself. */
function labsFor(c: AgentContext) {
  const fromText = extractLabsFromProse([c.question, c.patient.narrative].join('\n'));
  const known = c.patient.labs.map((l) => (findRef(l.analyte)?.labelKa ?? l.analyte).toLowerCase());
  return interpretLabs([...c.patient.labs, ...fromText.filter((l) => !known.includes(l.analyte.toLowerCase()))], c.patient);
}

/* ───────────────────────────── A11 — Imaging ───────────────────────────── */

const findingLine = (f: ImagingFinding) =>
  [
    f.labelKa ? `${f.labelKa}${f.laterality ? ` (${f.laterality})` : ''}${f.largestMm !== null ? `, ${f.largestMm} მმ` : ''} — ` : '',
    `„${f.text.slice(0, 220)}${f.text.length > 220 ? '…' : ''}“`,
  ].join('');

/**
 * The impression usually repeats a finding from the body ("ფილტვის კვანძი 7 მმ").
 * One finding is listed once — the mention carrying the most detail is kept.
 */
function dedupe(list: ImagingFinding[]): ImagingFinding[] {
  const detail = (f: ImagingFinding) => (f.largestMm !== null ? 2 : 0) + (f.laterality ? 1 : 0);
  const groups = new Map<string, ImagingFinding[]>();
  for (const f of list) groups.set(f.labelKa ?? f.text, [...(groups.get(f.labelKa ?? f.text) ?? []), f]);
  const out: ImagingFinding[] = [];
  for (const g of groups.values()) {
    // Different sides are different findings; a side-less repeat is the same one.
    const sided = g.filter((f) => f.laterality);
    const pool = sided.length ? sided : g;
    const bySide = new Map<string, ImagingFinding>();
    for (const f of pool) {
      const k = f.laterality ?? '-';
      const prev = bySide.get(k);
      if (!prev || detail(f) > detail(prev)) bySide.set(k, f);
    }
    out.push(...bySide.values());
  }
  return out;
}

export const imagingAgent: AgentImpl = (c) => {
  const supplied = ((c.extras.reportText as string) ?? '').trim();
  const report = supplied || (looksLikeImagingReport(c.question) ? c.question : '');
  if (!report) return skipped('A11', 'ვიზუალიზაციის დასკვნის ტექსტი არ არის მოწოდებული — ჩასვით რადიოლოგის დასკვნა სრულად.');

  const a = analyzeImagingReport(report, { age: c.patient.age, sex: c.patient.sex, egfr: c.patient.egfr });
  const significant = dedupe(a.findings.filter((f) => f.kind === 'significant'));
  const incidental = dedupe(a.incidental);
  const confirmed = dedupe(a.critical.filter((f) => !f.hedged));
  const suspected = dedupe(a.critical.filter((f) => f.hedged));

  const summary = confirmed.length
    ? `კრიტიკული მიგნება: ${confirmed.map((f) => f.labelKa).join(', ')} — საჭიროებს დაუყოვნებელ კომუნიკაციას მკურნალ ექიმთან და დოკუმენტირებას.`
    : suspected.length
    ? `კრიტიკული მიგნების ეჭვი (არ გამოირიცხება): ${suspected.map((f) => f.labelKa).join(', ')} — საჭიროებს სასწრაფო დაზუსტებას რადიოლოგთან, არა დაკვირვებას.`
    : incidental.length
      ? `შემთხვევითი მიგნება, რომელიც დაკვირვების წესს საჭიროებს: ${incidental.map((f) => f.labelKa).join(', ')}.`
      : significant.length
        ? `მნიშვნელოვანი მიგნება: ${significant.map((f) => f.labelKa).join(', ')} — საჭიროებს კლინიკურ კორელაციას.`
        : `${a.modality ?? 'ვიზუალიზაციის'} დასკვნაში კრიტიკული ან შემთხვევითი მიგნება არ იკითხება; ${a.negatives.length} პუნქტი ცალსახად უარყოფითია.`;

  const sections: AgentResult['sections'] = [
    {
      titleKa: 'დასკვნის სტრუქტურა',
      titleEn: 'Report structure',
      body: '',
      bullets: [
        `მოდალობა: ${a.modality ?? 'ტექსტიდან ვერ დადგინდა'}`,
        `დასკვნის (Impression) ბლოკი: ${a.hasImpression ? 'არის' : 'არ არის — რეკომენდებულია რადიოლოგისგან ცალკე დასკვნითი ბლოკის მოთხოვნა'}`,
        `წაკითხული პუნქტები: ${a.findings.length} · უარყოფითი: ${a.negatives.length} · გაურკვეველი ფორმულირებით: ${a.hedged.length}`,
      ],
    },
  ];

  if (confirmed.length || suspected.length)
    sections.push({
      titleKa: 'კრიტიკული მიგნებები — დაუყოვნებელი კომუნიკაცია',
      titleEn: 'Critical findings',
      body: 'ACR-ის პრაქტიკის პარამეტრით კრიტიკული შედეგი უნდა გადაეცეს მკურნალ ექიმს პირდაპირ, ხოლო გადაცემის დრო და ადრესატი — დოკუმენტირდეს. „არ გამოირიცხება“ კრიტიკულ დიაგნოზზე იგივე სიჩქარით საჭიროებს დაზუსტებას.',
      bullets: [...confirmed.map(findingLine), ...suspected.map((f) => `ეჭვი: ${findingLine(f)}`)],
    });
  if (significant.length)
    sections.push({ titleKa: 'მნიშვნელოვანი მიგნებები', titleEn: 'Significant findings', body: '', bullets: significant.map(findingLine) });
  if (incidental.length)
    sections.push({ titleKa: 'შემთხვევითი მიგნებები და დაკვირვების წესი', titleEn: 'Incidental findings and follow-up', body: '', bullets: incidental.flatMap((f) => [findingLine(f), `→ ${f.followUpKa}`]) });
  if (a.hedged.length)
    sections.push({ titleKa: 'გაურკვეველი ფორმულირება — დასაზუსტებელია რადიოლოგთან', titleEn: 'Hedged language', body: '„არ გამოირიცხება“ და „სავარაუდოდ“ გადაწყვეტილებას ექიმზე გადაიტანს. ჰკითხეთ რადიოლოგს: რა ალბათობით, და რა კვლევა გადაწყვეტს საკითხს.', bullets: a.hedged.map((f) => `„${f.text.slice(0, 200)}“`) });
  if (a.recommendations.length || a.contrastWarnings.length)
    sections.push({ titleKa: 'რადიოლოგის რეკომენდაციები', titleEn: 'Radiologist recommendations', body: '', bullets: [...a.recommendations.map((r) => `„${r.slice(0, 220)}“`), ...a.contrastWarnings.map((w) => `⚠ ${w}`)] });
  if (a.negatives.length)
    sections.push({ titleKa: 'ცალსახად უარყოფითი', titleEn: 'Pertinent negatives', body: '', bullets: a.negatives.slice(0, 8).map((f) => f.text.slice(0, 160)) });

  sections.push({
    titleKa: 'კლინიკური კორელაცია და შეზღუდვა',
    titleEn: 'Correlation and limitation',
    body: `პაციენტის კონტექსტი: ${[c.patient.age !== null ? `${c.patient.age} წ.` : '', sexKa(c.patient.sex), c.patient.egfr ? `eGFR ${c.patient.egfr}` : '', c.patient.problems.slice(0, 3).join(', ')].filter(Boolean).join(' · ') || 'არ არის მოწოდებული'}.\nანალიზი ეყრდნობა მხოლოდ დასკვნის ტექსტს — გამოსახულება არ არის ნანახი. დაკვირვების წესები გამოიყენება მხოლოდ მათ საზღვრებში (მაგ. Fleischner არ ვრცელდება ონკოლოგიურ პაციენტზე).`,
    bullets: [],
  });

  return ok('A11', {
    summary,
    sections,
    data: { modality: a.modality, critical: confirmed, suspectedCritical: suspected, incidental, hedged: a.hedged, recommendations: a.recommendations, findingCount: a.findings.length },
    humanReviewRequired: true,
  });
};

/* ─────────────────────────── A12 — Documentation ─────────────────────────── */

const TEMPLATE_HINTS: { re: RegExp; id: string }[] = [
  { re: /ფორმა\s*(n\s*)?(iv-)?100|form\s*100/i, id: 'form100' },
  { re: /ეპიკრიზ|გაწერ|discharge/i, id: 'discharge' },
  { re: /მიმართვ|referral/i, id: 'referral' },
  { re: /კონსულტაც/i, id: 'consultation' },
  { re: /დანიშნულებ|რეცეპტ|prescription/i, id: 'prescription' },
  { re: /სადაზღვევ|დაზღვევ|insurance/i, id: 'insurance' },
  { re: /მეორე აზრ|second opinion/i, id: 'second-opinion' },
  { re: /ოპერაც.{0,10}(ოქმ|ჩანაწერ)|operative/i, id: 'operative' },
  { re: /პროცედურ.{0,10}(ოქმ|ჩანაწერ)|procedure note/i, id: 'procedure' },
  { re: /ინსტრუქც|პაციენტისთვის.{0,20}(ფურცელ|ტექსტ)/i, id: 'patient-instructions' },
  { re: /\bsop\b|სოპ|სტანდარტული ოპერაციული/i, id: 'sop' },
  { re: /ალგორითმ/i, id: 'algorithm' },
  { re: /გაიდლაინის მონახაზ/i, id: 'guideline-draft' },
  { re: /პროტოკოლ/i, id: 'protocol' },
  { re: /ცნობა|certificate/i, id: 'certificate' },
];

export function resolveTemplate(type: string, question: string): DocTemplate | undefined {
  const t = type.trim();
  if (t) {
    const exact = DOC_TEMPLATES.find((d) => d.id === t || d.nameKa === t || d.nameEn.toLowerCase() === t.toLowerCase());
    if (exact) return exact;
  }
  const text = `${t} ${question}`;
  const hint = TEMPLATE_HINTS.find((h) => h.re.test(text));
  return hint ? DOC_TEMPLATES.find((d) => d.id === hint.id) : undefined;
}

const ICD10 = /\b[A-TV-Z]\d{2}(\.\d{1,2})?\b/;

function icdFor(problem: string): string | null {
  const p = problem.toLowerCase();
  const term = GEORGIAN_TERMS.find(
    (t) => t.icd10 && [t.preferred_ka, ...t.synonyms_ka, t.english].some((n) => p.includes(n.toLowerCase())),
  );
  return term?.icd10 ?? null;
}

type Filled = { section: string; content: string | null; note?: string };

export const documentationAgent: AgentImpl = (c) => {
  const template = resolveTemplate((c.extras.documentType as string) ?? '', c.question);
  if (!template) {
    return skipped('A12', `დოკუმენტის ტიპი ვერ განისაზღვრა. ხელმისაწვდომია: ${DOC_TEMPLATES.map((d) => d.nameKa).join('; ')}.`);
  }

  const p = c.patient;
  const labs = labsFor(c);
  const activeMeds = p.medications.filter((m) => m.status === 'active');
  const narrative = [(c.extras.clinicalData as string) ?? '', p.narrative].map((s) => s.trim()).filter(Boolean).join('\n');
  const plan = c.plan.trim();
  const problems = p.problems.map((x) => {
    const code = ICD10.exec(x)?.[0] ?? icdFor(x);
    return code && !ICD10.test(x) ? `${x} (ICD-10: ${code} — შემოთავაზებული, გადაამოწმეთ)` : x;
  });

  const patientLine = [p.age !== null ? `${p.age} წ.` : '', sexKa(p.sex), p.pregnant === 'yes' ? 'ორსული' : '', p.weightKg ? `${p.weightKg} კგ` : ''].filter(Boolean).join(', ');
  const medsLine = activeMeds.map((m) => [m.drug, m.dose, m.frequency, m.route].filter(Boolean).join(' ')).join('; ');
  const labLine = labs.results.map((l) => `${l.labelKa} ${l.value} ${l.unit}${l.status !== 'normal' && l.status !== 'unknown' ? ` (${LAB_STATUS_KA[l.status]})` : ''}`).join('; ');
  const timelineInv = p.timeline.filter((e) => e.category === 'investigation' || e.category === 'procedure').map((e) => `${e.date ? `${e.date} — ` : ''}${e.title}${e.detail ? `: ${e.detail}` : ''}`).join('; ');

  const fill = (section: string): Filled => {
    const s = section.toLowerCase();
    if (/პაციენტის მონაცემები|პაციენტი და პოლისი/.test(s)) return { section, content: patientLine || null, note: s.includes('პოლის') ? 'პოლისის ნომერი შესავსებია' : undefined };
    if (/ალერგი/.test(s)) return { section, content: p.allergies.length ? `ალერგია: ${p.allergies.join(', ')}` : null, note: 'ალერგიის სტატუსი (მათ შორის „არ აქვს“) უნდა ჩაიწეროს ცალსახად' };
    if (/მედიკამენტ|დანიშნულებ|პრეპარატ|ჩატარებული მკურნალობა|გაწერის დანიშნულებ/.test(s)) return { section, content: medsLine || null };
    if (/კვლევ|პროცედურ.*ჩატარ/.test(s) && !/რეკომენდ|დამატებით/.test(s)) return { section, content: [labLine, timelineInv].filter(Boolean).join('\n') || null };
    if (/დიაგნოზ/.test(s) && !/დიფერენციულ/.test(s)) return { section, content: problems.length ? problems.join('; ') : null };
    if (/ჩივილ|მიმართვის მიზეზი|ჰოსპიტალიზაციის მიზეზი|ჩვენება|ანამნეზ|რეზიუმე|მიმდინარეობა|დადგენილი ფაქტები|მოწოდებული დოკუმენტაცია|კლინიკური აუცილებლობ|რა დაგიდგინდათ/.test(s))
      return { section, content: narrative || null };
    if (/რეკომენდაც|გეგმ|დაკვირვებ|რა უნდა გააკეთოთ|შემდეგი ვიზიტ/.test(s)) return { section, content: plan || null };
    if (/დაბრუნების კრიტერიუმ|სასწრაფოდ|განმეორებითი ვიზიტის კრიტერიუმ/.test(s)) {
      const text = fullText(c);
      const flags = PATIENT_RED_FLAGS.filter((f) => f.re.test(text)).map((f) => f.ka);
      return { section, content: null, note: `შემოთავაზებული კონკრეტული კრიტერიუმები (დაადასტურეთ): ${(flags.length ? flags : GENERIC_PATIENT_RED_FLAGS).slice(0, 3).join('; ')}` };
    }
    if (/თანხმობ/.test(s)) return { section, content: null, note: 'ინფორმირებული თანხმობა — სავალდებულო ელემენტი (კანონი „პაციენტის უფლებების შესახებ“); ჩაწერეთ: ვინ, როდის, რა რისკები და ალტერნატივები განიმარტა' };
    return { section, content: null };
  };

  const filled = template.sections.map(fill);
  const done = filled.filter((f) => f.content);
  const missing = filled.filter((f) => !f.content);
  const completeness = Math.round((done.length / filled.length) * 100);

  // Deterministic documentation checks — each one is a defect a reviewer would raise.
  const checks: string[] = [];
  const all = [narrative, plan, problems.join(' ')].join(' ');
  if (template.sections.some((s) => /ICD-10/.test(s)) && problems.length && !problems.some((x) => ICD10.test(x)))
    checks.push('დიაგნოზს ICD-10 კოდი არ ახლავს — ფორმა 100-ისთვის სავალდებულოა.');
  if (!p.allergies.length) checks.push('ალერგიის სტატუსი არ არის დოკუმენტირებული — „ალერგია არ აღენიშნება“ ცალკე ჩანაწერია, მისი არარსებობა კი ხარვეზი.');
  const incompleteMeds = activeMeds.filter((m) => !m.dose || !m.frequency);
  if (incompleteMeds.length) checks.push(`დოზა ან სიხშირე აკლია: ${incompleteMeds.map((m) => m.drug).join(', ')}.`);
  if (/გაუარესებისას|საჭიროების შემთხვევაში|prn/i.test(all) && /discharge|patient-instructions/.test(template.id))
    checks.push('„გაუარესებისას“ დაბრუნების კრიტერიუმად საკმარისი არ არის — საჭიროა კონკრეტული ნიშნები.');
  const unaddressed = labs.abnormal.filter((l) => !plan.toLowerCase().includes(l.labelKa.toLowerCase().slice(0, 5)) && !plan.toLowerCase().includes(l.analyte.toLowerCase()));
  if (unaddressed.length && plan) checks.push(`პათოლოგიურ შედეგზე რეაგირება გეგმაში არ ჩანს: ${unaddressed.map((l) => `${l.labelKa} ${l.value}`).join(', ')}.`);
  if (template.id === 'referral' && !/\d{1,2}[:.]\d{2}|\d{2}[./-]\d{2}[./-]\d{2,4}/.test(all)) checks.push('მიმართვის თარიღი და დრო არ არის მითითებული — ხარისხის აუდიტის კრიტიკული ელემენტი.');
  if (/procedure|operative/.test(template.id) && !/თანხმობ/.test(all)) checks.push('ინფორმირებული თანხმობის ჩანაწერი არ ჩანს.');
  if (template.id === 'insurance' && !/გაიდლაინ|სტანდარტ|პროტოკოლ|guideline/i.test(all)) checks.push('სადაზღვევო დასაბუთებას მოქმედი სტანდარტის მითითება აკლია — Documents მოდული მოიძიებს გაიდლაინს ავტომატურად.');

  // Case vignettes ("ქეისი: …") illustrate a defect; they are not criteria and
  // are not cited against a document under preparation.
  const rules = matchRules(`${template.nameKa} ${template.sections.join(' ')} ${template.noteKa}`, { families: ['documentation', 'consent', 'communication'], limit: 12, minScore: 0.1 })
    .filter((m) => !/^ქეისი:/.test(m.rule.criterionKa ?? m.rule.triggerKa ?? ''))
    .slice(0, 4);

  const draftMarkdown = [
    `# ${template.nameKa}`,
    ...filled.map((f) => `\n## ${f.section}\n${f.content ?? `_შესავსებია${f.note ? ` — ${f.note}` : ''}_`}`),
    template.requiresSignature ? '\n---\nექიმი: ________________   ხელმოწერა: ________________   თარიღი: ________' : '',
  ].join('\n');

  return ok('A12', {
    summary: `${template.nameKa}: შევსებულია ${done.length}/${filled.length} სექცია (${completeness}%) ქეისის მონაცემებით; ${checks.length} დოკუმენტაციის ხარვეზი.`,
    sections: [
      { titleKa: 'შევსებული სექციები', titleEn: 'Pre-filled sections', body: '', bullets: done.map((f) => `${f.section}: ${(f.content ?? '').replace(/\n/g, ' · ').slice(0, 300)}`) },
      { titleKa: 'შესავსები სექციები', titleEn: 'Missing sections', body: '', bullets: missing.map((f) => `${f.section}${f.note ? ` — ${f.note}` : ''}`) },
      ...(checks.length ? [{ titleKa: 'დოკუმენტაციის შემოწმება', titleEn: 'Documentation checks', body: '', bullets: checks }] : []),
      ...(rules.length ? [{ titleKa: 'სახელმძღვანელოს კრიტერიუმები (დოკუმენტაცია)', titleEn: 'Manual criteria', body: '', bullets: rules.map((m) => ruleLine(m.rule)) }] : []),
      { titleKa: 'შემდეგი ნაბიჯი', titleEn: 'Next step', body: `${template.noteKa}\nსრული Word დოკუმენტი ბლანკით: „დოკუმენტები“ მოდული (ნაკარნახევი ტექსტი სექციებად + სადაზღვევო დასაბუთების გაიდლაინის ავტომატური მოძიება).`, bullets: [] },
    ],
    data: { templateId: template.id, completeness, filled: done.map((f) => f.section), missing: missing.map((f) => f.section), checks, draftMarkdown },
    humanReviewRequired: true,
  });
};

/* ─────────────────────────── A16 — Patient education ─────────────────────────── */

type Urgency = 'emergency' | 'today' | 'soon' | 'routine';

const URGENCY_KA: Record<Urgency, { titleKa: string; bodyKa: string }> = {
  emergency: { titleKa: 'ახლავე დარეკეთ 112-ზე', bodyKa: 'თქვენ მიერ აღწერილი ნიშანი შეიძლება საფრთხის შემცველი იყოს. დარეკეთ 112-ზე ან მიდით უახლოეს გადაუდებელ განყოფილებაში — არ დაელოდოთ, გაივლის თუ არა.' },
  today: { titleKa: 'მიმართეთ ექიმს დღესვე ან ხვალ', bodyKa: 'ეს არ ჰგავს გადაუდებელ მდგომარეობას, მაგრამ საჭიროებს ექიმის გასინჯვას უახლოეს 24 საათში.' },
  soon: { titleKa: 'დაუკავშირდით თქვენს ექიმს 1–2 დღეში', bodyKa: 'აღწერილი ცვლილება შეიძლება მკურნალობის გადახედვას საჭიროებდეს. თუ რომელიმე საგანგაშო ნიშანი დაემატა — დარეკეთ 112-ზე.' },
  routine: { titleKa: 'განიხილეთ დაგეგმილ ვიზიტზე', bodyKa: 'საგანგაშო ნიშანი არ ჩანს. ქვემოთ — ახსნა და კითხვები, რომლებიც ექიმს დაუსვათ.' },
};

type IntakeIn = { answers?: Record<string, string | string[] | undefined> };

/** The highest blood pressure written in the text („160/100", „წნევა 185 110"). */
export function bloodPressureOf(text: string): { sys: number; dia: number } | null {
  let best: { sys: number; dia: number } | null = null;
  for (const m of text.matchAll(/(?<!\d)(\d{2,3})\s*[\/\\]\s*(\d{2,3})(?!\d)/g)) {
    const sys = Number(m[1]);
    const dia = Number(m[2]);
    if (sys < 70 || sys > 300 || dia < 40 || dia > 200 || dia >= sys) continue;
    if (!best || sys > best.sys) best = { sys, dia };
  }
  return best;
}

function urgencyOf(text: string, intake: IntakeIn, cardSoon: boolean): Urgency {
  const a = intake.answers ?? {};
  const rf = Array.isArray(a.redflags) ? a.redflags : a.redflags ? [a.redflags] : [];
  if (rf.some((v) => v && v !== 'none')) return 'emergency';
  const neuroCardio = /გაორებ|მხედველობ|სისუსტ|დაბუჟ|მეტყველებ|გულმკერდ|ქოშინ|სუნთქვ|თავის\s+ტკივ|გონება/i.test(text);
  // Blood pressure by its own thresholds (ESC 2024): ≥180/110 with symptoms is
  // an emergency, without them the same day; grade 2 (≥160/100) within days.
  const bp = bloodPressureOf(text);
  if (bp && (bp.sys >= 180 || bp.dia >= 110)) return neuroCardio ? 'emergency' : 'today';
  if (bp && (bp.sys >= 160 || bp.dia >= 100)) return 'soon';
  if (a.onset === 'minutes' && neuroCardio) return 'emergency';
  if (cardSoon && a.diagnosed === 'yes' && (a.onset === 'days' || a.onset === 'minutes')) return 'soon';
  if (neuroCardio && (a.onset === 'days' || a.onset === 'minutes' || !a.onset)) return 'today';
  return 'routine';
}

export const patientAgent: AgentImpl = (c) => {
  const text = fullText(c);
  const intake = ((c.extras.intake as IntakeIn) ?? {}) as IntakeIn;
  const answers = intake.answers ?? {};
  const labsEarly = labsFor(c);
  const cards = cardsFor(text, 2);
  // A low haemoglobin with no condition named: iron deficiency is its most
  // common cause, so its card gives the reader something to act on.
  if (!cards.length && labsEarly.abnormal.some((l) => /ჰემოგლობ|hemoglobin|haemoglobin/i.test(`${l.labelKa} ${l.analyte ?? ''}`) && /low/.test(l.status))) {
    const ida = CONDITION_CARDS.find((x) => x.id === 'ida');
    if (ida) cards.push(ida);
  }
  const card = cards[0];
  const glossary = glossaryFor(text).filter((g) => !card || !card.re.test(g.termKa));
  const labs = labsEarly;
  const lowValue = screenMedicationList([text, c.patient.medications.map((m) => m.drug).join(' ')].join(' '));
  const flags = PATIENT_RED_FLAGS.filter((f) => f.re.test(text)).map((f) => f.ka);
  const medCount = c.patient.medications.filter((m) => m.status === 'active').length;

  // Symptom rules of the condition: which applies depends on whether the
  // diagnosis is established. Unknown → both readings, short.
  const diagnosed = typeof answers.diagnosed === 'string' ? answers.diagnosed : card ? (livesWith(text, card) ? 'yes' : undefined) : undefined;
  const rules = card?.symptomRules?.filter((r) => r.re.test(text)) ?? [];
  const symptomBullets = rules.flatMap((r) =>
    diagnosed === 'yes' ? [r.ifKnownKa] : diagnosed === 'no' || diagnosed === 'suspected' ? [r.ifUnknownKa] : [r.ifKnownKa, r.ifUnknownKa],
  );
  const urgency = urgencyOf(text, intake, Boolean(rules.length));

  const labLines = labs.abnormal.map((l) => {
    const dir = /low/.test(l.status) ? 'ნორმაზე დაბალია' : 'ნორმაზე მაღალია';
    const urgent = l.status.startsWith('critical') ? ' — ეს მნიშვნელოვანი გადახრაა, დაუკავშირდით ექიმს დღესვე' : '';
    return `${l.labelKa}: ${l.value} ${l.unit} — ${dir}${l.refText ? ` (ნორმა: ${l.refText})` : ''}${urgent}.`;
  });
  const medLines = lowValue.map(({ entry }) =>
    `${entry.nameKa}: ${GRADE_KA[entry.grade]}${!entry.approval.fda && !entry.approval.ema ? '; აშშ-სა და ევროკავშირში ამ ჩვენებით რეგისტრირებული არ არის' : ''}. ნუ შეწყვეტთ თვითნებურად — ჰკითხეთ ექიმს, საჭიროა თუ არა.`,
  );

  const questions = [
    ...(card?.questionsKa ?? []),
    ...labs.abnormal.slice(0, 2).map((l) => `${l.labelKa} ნორმიდან გადახრილია — რას ნიშნავს ეს ჩემთვის და საჭიროა თუ არა განმეორება?`),
    ...lowValue.slice(0, 2).map(({ entry }) => `${entry.nameKa} — რა სარგებელს მოველი ამ წამლისგან და შეიძლება თუ არა მისი შეწყვეტა?`),
    ...(medCount >= 5 ? ['ვიღებ 5 ან მეტ წამალს — შეიძლება თუ არა რომელიმეს მოხსნა ან დოზის შემცირება?'] : []),
    ...(card ? [] : ['რა არის ჩემი დიაგნოზი და რაზე დაყრდნობით დადგინდა?', 'რა ალტერნატივები არსებობს და რატომ აირჩიეთ ეს?', 'რა გვერდითი ეფექტები უნდა ველოდო და როდის დაგიკავშირდეთ?']),
  ].slice(0, 7);

  const u = URGENCY_KA[urgency];
  const sections: AgentResult['sections'] = [
    { titleKa: u.titleKa, titleEn: `Action:${urgency}`, body: u.bodyKa, bullets: urgency === 'soon' || urgency === 'today' ? (card?.soonKa ?? []).slice(0, 2) : [] },
  ];
  if (symptomBullets.length) sections.push({ titleKa: 'თქვენი სიმპტომები', titleEn: 'Your symptoms', body: '', bullets: symptomBullets });
  if (card) {
    const symptomCard = card.kind === 'symptom';
    sections.push({ titleKa: card.whatTitleKa ?? `რა არის ${card.nameKa}`, titleEn: 'What it is', body: [card.whatKa, card.whoKa].filter(Boolean).join('\n'), bullets: card.typesKa ?? [] });
    sections.push({ titleKa: symptomCard ? 'რა უნდა შეამჩნიოთ და უთხრათ ექიმს' : 'როგორ ვლინდება', titleEn: 'How it shows', body: '', bullets: card.symptomsKa });
    sections.push({ titleKa: symptomCard ? 'რას გააკეთებს ექიმი' : 'როგორ დგინდება', titleEn: 'How it is confirmed', body: '', bullets: card.diagnosisKa });
    sections.push({ titleKa: 'როგორ მკურნალობენ', titleEn: 'Treatment', body: 'კონკრეტულ მკურნალობას და დოზას მხოლოდ თქვენი ექიმი შეარჩევს.', bullets: card.treatmentKa });
    sections.push({ titleKa: 'რა შეგიძლიათ თავად', titleEn: 'What you can do', body: '', bullets: card.selfCareKa });
    sections.push({ titleKa: 'როგორ მიმდინარეობს', titleEn: 'Course', body: card.courseKa, bullets: [] });
  }
  if (glossary.length) sections.push({ titleKa: 'ტერმინები მარტივად', titleEn: 'What this means', body: '', bullets: glossary.map((g) => `${g.termKa} — ${g.plainKa}`) });
  if (labLines.length) sections.push({ titleKa: 'თქვენი ანალიზები მარტივად', titleEn: 'Your results', body: 'ერთი გადახრილი მაჩვენებელი თავისთავად დიაგნოზი არ არის — ექიმი მას სხვა მონაცემებთან ერთად აფასებს.', bullets: labLines });
  if (medLines.length) sections.push({ titleKa: 'წამლები, რომელთა სარგებელი დადასტურებული არ არის', titleEn: 'Medicines with unproven benefit', body: '', bullets: medLines });
  const urgentList = [...(card?.urgentKa ?? []), ...(card ? [] : flags), ...(card || flags.length ? [] : GENERIC_PATIENT_RED_FLAGS)];
  sections.push({ titleKa: 'როდის დარეკოთ 112-ზე', titleEn: 'Red flags', body: '', bullets: [...new Set(urgentList)].slice(0, 6) });
  sections.push({ titleKa: 'რა ვკითხოთ ექიმს', titleEn: 'Questions for your doctor', body: '', bullets: questions });
  if (card) sections.push({ titleKa: 'რას ეყრდნობა ეს ახსნა', titleEn: 'Basis', body: 'ზოგადი ინფორმაცია, მომზადებული საერთაშორისო გაიდლაინების მიხედვით; არ ცვლის ექიმის შეფასებას.', bullets: card.sourcesKa });

  const summary =
    urgency === 'emergency'
      ? 'ახლავე დარეკეთ 112-ზე ან მიდით გადაუდებელ განყოფილებაში.'
      : labs.abnormal.some((l) => l.status.startsWith('critical'))
        ? 'ერთ-ერთი მაჩვენებელი მნიშვნელოვნად გადახრილია — დაუკავშირდით ექიმს დღესვე.'
        : card
          ? `${card.nameKa}: ახსნა მარტივ ენაზე და რა გააკეთოთ ახლა.`
          : glossary.length
            ? `ახსნა მარტივ ენაზე: ${glossary.map((g) => g.termKa).join(', ')}.`
            : 'ახსნა პაციენტისთვის მარტივ ენაზე.';

  return ok('A16', {
    summary,
    sections,
    // Without a condition card the retrieval hits are matched on words alone
    // (a drug question once surfaced a liver-surgery paper) — a patient is
    // shown no source rather than an unrelated one.
    sourceIds: card ? c.hits.slice(0, 2).map((h) => h.source.source_id) : [],
    data: { urgency, cardId: card?.id ?? null, diagnosed: diagnosed ?? null, glossary: glossary.map((g) => g.id), abnormalLabs: labs.abnormal.length, lowValue: lowValue.map((l) => l.entry.id), redFlags: flags },
    humanReviewRequired: false,
    note: 'ეს არ ცვლის ექიმთან კონსულტაციას და არ არის დანიშნულება.',
  });
};

/* ─────────────────────────── A17 — Academy ─────────────────────────── */

const stemsOf = (s: string) =>
  s.toLowerCase().split(/[^a-zა-ჰ0-9]+/i).filter((w) => w.length >= 5).map((w) => w.slice(0, 6));

export function matchTopic(text: string): Topic | undefined {
  const qs = new Set(stemsOf(text));
  let best: { t: Topic; score: number } | undefined;
  for (const t of TOPICS) {
    const ts = stemsOf(`${t.nameKa} ${t.id.replace(/-/g, ' ')}`);
    const score = ts.filter((x) => qs.has(x)).length;
    if (score > 0 && (!best || score > best.score)) best = { t, score };
  }
  return best?.t;
}

const LEVEL_FOCUS: Record<AgentContext['academyLevel'], string> = {
  student: 'ბაზისური მექანიზმი, კლასიკური სურათი და ძირითადი კვლევები.',
  resident: 'დიფერენციული დიაგნოზი, გადაუდებელი მართვა და ტიპური ხაფანგები.',
  gp: 'ამბულატორიული ამოცნობა, გადამისამართების კრიტერიუმები და დაკვირვება.',
  specialist: 'მტკიცებულების ნიუანსები, საზღვრული შემთხვევები და გაიდლაინებს შორის განსხვავებები.',
};

export const academyAgent: AgentImpl = async (c) => {
  const topicText = ((c.extras.topic as string) ?? c.question ?? '').trim();
  if (!topicText) return skipped('A17', 'თემა არ არის მითითებული.');
  const level = c.academyLevel;

  const unit = matchTopic(topicText);
  // Teaching needs the reviews and guidelines ABOUT the topic, not every paper
  // that mentions it: terms are searched in the title first, and only widened
  // to title+abstract when the title search finds nothing.
  const terms = englishSearchTerms(topicText, 2);
  const search = (field: 'TITLE' | 'TITLE_ABS') =>
    withCeiling(
      searchLiterature({ text: terms.map((t) => `${field}:"${t}"`).join(' AND '), tiers: ['guideline', 'systematic_review'], limit: 5, openAccessOnly: false, fromYear: new Date().getFullYear() - 6 }),
      8000,
      null,
    );
  let live = terms.length ? await search('TITLE') : null;
  if (terms.length && !live?.citations.length) live = await search('TITLE_ABS');
  // A teaching pitfall must share most of its vocabulary with the topic;
  // a loose match cites an unrelated case at the learner.
  const pitfalls = matchRules(topicText, { limit: 8, minScore: 0.34 }).filter((m) => !/^ქეისი:/.test(m.rule.criterionKa ?? m.rule.triggerKa ?? '')).slice(0, 3);
  const selfAudit = unit ? [] : matchAuditQuestions(topicText, { limit: 3 });
  const calcs = suggestCalculators(topicText).slice(0, 3);
  const comparisons = findComparisonTopics(topicText).slice(0, 2);
  // Emergency / intensive-care reference collection (gmai_clinical_v2): the
  // learner gets the matching units with direct links to the student page.
  const v2 = await retrieveRules(topicText, { kinds: ['clinical_unit'], limit: 5 }).catch(() => null);
  const v2Units = (v2?.hits ?? []).flatMap((h) => (h.kind === 'clinical_unit' ? [h] : []));

  const sections: AgentResult['sections'] = [
    { titleKa: `ფოკუსი — ${LEVEL_KA[level]}`, titleEn: 'Level-aware focus', body: unit ? unit.explain[level] : LEVEL_FOCUS[level], bullets: [] },
  ];
  if (unit) {
    sections.push({ titleKa: 'ნაბიჯ-ნაბიჯ', titleEn: 'Stepwise', body: '', bullets: unit.steps.map((s, i) => `${i + 1}. ${s}`) });
    sections.push({ titleKa: 'სოკრატული კითხვები', titleEn: 'Socratic questions', body: '', bullets: unit.socratic.slice(0, 3) });
    if (unit.quiz.length) {
      const q = unit.quiz[0];
      sections.push({ titleKa: 'თვითშემოწმება', titleEn: 'Self-check', body: q.q, bullets: [...q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`), `პასუხი: ${String.fromCharCode(65 + q.correct)} — ${q.explanation}`] });
    }
    if (unit.flashcards.length) sections.push({ titleKa: 'ფლეშქარდები', titleEn: 'Flashcards', body: '', bullets: unit.flashcards.map((f) => `${f.front} → ${f.back}`) });
  }
  if (v2Units.length)
    sections.push({
      titleKa: 'სასწავლო მასალა — გადაუდებელი მედიცინა და ინტენსიური თერაპია',
      titleEn: 'Clinical reference (gmai_clinical_v2)',
      body: 'სრული ერთეულები სტუდენტის გვერდზეა (ბმულები „საცნობარო მასალაში“). კლინიკური ვალიდაცია არ ჩატარებულა.',
      bullets: v2Units.map((h) => `${h.topic_title} — ${h.unit_title} (${SETTING_KA[h.setting]})`),
    });
  if (live?.citations.length)
    sections.push({ titleKa: 'უახლესი გაიდლაინები და სისტემური მიმოხილვები', titleEn: 'Current guidelines and reviews', body: `Europe PMC: ${live.query}`, bullets: live.citations.map((x) => `[${EVIDENCE_TIER_KA[x.evidenceTier]}] ${citationText(x)}`) });
  if (comparisons.length)
    sections.push({ titleKa: 'სადაც გაიდლაინები ერთმანეთს არ ეთანხმება', titleEn: 'Guideline disagreements', body: '', bullets: comparisons.flatMap((t) => [t.questionKa, ...t.differences.slice(0, 2).map((d) => `— ${d}`)]) });
  if (calcs.length) sections.push({ titleKa: 'გამოსაყენებელი კალკულატორები', titleEn: 'Calculators', body: '', bullets: calcs.map((k) => `${k.nameKa} — ${k.purposeKa}`) });
  if (pitfalls.length)
    sections.push({ titleKa: 'ტიპური ხარვეზები ექსპერტიზის თვალით', titleEn: 'Pitfalls (quality manual)', body: '', bullets: pitfalls.map((m) => ruleLine(m.rule)) });
  if (selfAudit.length) sections.push({ titleKa: 'აუდიტის კითხვები თვითშეფასებისთვის', titleEn: 'Self-audit questions', body: '', bullets: selfAudit.map((m) => m.question.questionKa) });

  const substantive = sections.length > 1;
  return ok('A17', {
    summary: unit
      ? `სასწავლო ერთეული: ${unit.nameKa} (${LEVEL_KA[level]}) · ${unit.steps.length} ნაბიჯი, ${unit.quiz.length} ქვიზი${live?.citations.length ? `, ${live.citations.length} აქტუალური წყარო` : ''}.`
      : substantive
        ? `სასწავლო მასალა თემაზე: ${topicText.slice(0, 80)} (${LEVEL_KA[level]})${live?.citations.length ? ` · ${live.citations.length} გაიდლაინი/მიმოხილვა` : ''}.`
        : `თემისთვის „${topicText.slice(0, 60)}“ კურირებული ერთეული და წყარო ვერ მოიძებნა — დააზუსტეთ ტერმინი.`,
    sections,
    sourceIds: unit?.sourceIds ?? c.hits.slice(0, 4).map((h) => h.source.source_id),
    data: { topic: topicText, level, unitId: unit?.id ?? null, citations: live?.citations ?? [], query: live?.query ?? null, clinicalUnits: v2Units.map((h) => ({ id: h.rule_id, href: h.href, title: h.unit_title, topic: h.topic_title, setting: h.setting })) },
  });
};
