import type { ClinicalRuleHit, QualityRuleHit, AuditQuestionHit, RetrievalHitKb } from '@/kb/retrieval-service';
import { DATA_STATUS_KA, type AgentEnvelope, type CoreAgentInput, type DataStatus } from './types';
import { reviewMedications } from '@/lib/medication-review';
import { DRUGS, findDrug } from '@/knowledge/drugs';
import { stem } from '@/kb/lexicon';
import { detectRedFlags } from '@/agents/implementations';

/**
 * CORE PRODUCTION AGENTS (A01–A04, A07).
 *
 * Every agent is grounded: it reasons only over the rules the retrieval layer
 * actually returned, and every statement it makes carries the rule ids it came
 * from. None of them invents patient data, rule ids, or numbers.
 */

const clinicalHits = (kb: CoreAgentInput['kb']) => kb.hits.filter((h): h is ClinicalRuleHit => h.kind === 'clinical_rule');
const qualityHits = (kb: CoreAgentInput['kb']) => kb.hits.filter((h): h is QualityRuleHit => h.kind === 'quality_rule');
const questionHits = (kb: CoreAgentInput['kb']) => kb.hits.filter((h): h is AuditQuestionHit => h.kind === 'audit_question');

const coverageNote = (kb: CoreAgentInput['kb']) => (kb.coverage === 'COVERED' ? [] : [kb.messageKa]);

/* ── A01 Clinical Reasoning ──────────────────────────────────────────────── */

export type ClinicalReasoningOutput = {
  case_summary: string;
  major_problems: string[];
  urgent_issues: string[];
  clinical_reasoning: string[];
  missing_information: string[];
  recommended_next_steps: { text: string; ruleIds: string[] }[];
  safety_concerns: { text: string; ruleIds: string[] }[];
  relevant_rule_ids: string[];
  uncertainty: { level: 'low' | 'moderate' | 'high'; driversKa: string[] };
  evidence_refresh_required: boolean;
};

export function clinicalReasoningAgent(input: CoreAgentInput): AgentEnvelope<ClinicalReasoningOutput> {
  const c = input.structured;
  const hits = clinicalHits(input.kb);
  const notes = coverageNote(input.kb);

  const identity = [c.age !== null ? `${c.age} წ.` : null, c.sex === 'male' ? 'მამრობითი' : c.sex === 'female' ? 'მდედრობითი' : null, c.pregnant === 'yes' ? 'ორსულობა' : null]
    .filter(Boolean)
    .join(', ');
  const case_summary = [identity || 'დემოგრაფიული მონაცემები არ არის მითითებული', c.problems.length ? `აქტიური პრობლემები: ${c.problems.join('; ')}` : null, c.narrative ? c.narrative.slice(0, 300) : null]
    .filter(Boolean)
    .join('. ');

  const urgent = detectRedFlags([input.question, c.narrative, c.problems.join(' ')].join(' '));

  const missing: string[] = [];
  if (c.age === null) missing.push('ასაკი');
  if (c.weightKg === null) missing.push('წონა');
  if (c.renal.egfr === null && c.renal.crcl === null) missing.push('თირკმლის ფუნქცია');
  if (!c.allergies.length) missing.push('ალერგიული ანამნეზი');
  if (!c.medications.length) missing.push('მიმდინარე მედიკამენტების სია');
  if (!c.labs.length) missing.push('ლაბორატორიული მონაცემები');
  if (!c.timeline.length) missing.push('მოვლენების ქრონოლოგია');

  const steps = hits
    .filter((h) => h.action)
    .slice(0, 8)
    .map((h) => ({ text: `${h.action}${h.normalized_condition_text ? ` — პირობა: ${h.normalized_condition_text}` : ''}`, ruleIds: [h.rule_id] }));

  const safety = hits
    .filter((h) => h.safety_flags.length || h.escalation.length || h.exceptions.length)
    .slice(0, 8)
    .map((h) => ({ text: [h.escalation.join('; '), h.exceptions.join('; '), h.safety_flags.join(', ')].filter(Boolean).join(' | '), ruleIds: [h.rule_id] }))
    .filter((s) => s.text);

  const reasoning: string[] = [];
  if (hits.length) reasoning.push(`მოძიებულია ${hits.length} შიდა კლინიკური წესი, რომელთაგან ${hits.filter((h) => h.maturity === 'L3_STRUCTURED_RULE').length} სტრუქტურირებულია.`);
  if (c.medications.length) reasoning.push(`მიმდინარე თერაპია მოიცავს ${c.medications.length} პრეპარატს — წამლისმიერი მიზეზები და ურთიერთქმედებები ცალკე ფასდება.`);
  if (c.renal.crcl !== null) reasoning.push(`გამოთვლილი კრეატინინის კლირენსი ${c.renal.crcl} მლ/წთ ზღუდავს თირკმლით გამოყოფადი პრეპარატების დოზირებას.`);
  if (!hits.length) reasoning.push('შიდა კორპუსში შესაბამისი წესი ვერ მოიძებნა — დასკვნა მოდელის მეხსიერებიდან არ ყალიბდება.');

  const drivers: string[] = [];
  if (missing.length) drivers.push(`გამოტოვებული მონაცემები: ${missing.join(', ')}`);
  if (input.kb.coverage !== 'COVERED') drivers.push('შიდა ცოდნის ბაზის დაფარვა არასრულია');
  if (hits.some((h) => h.current_evidence_refresh_required)) drivers.push('მოძიებული წესები საჭიროებს აქტუალურ მტკიცებულებებთან გადამოწმებას');

  return {
    agent: 'A01',
    ok: true,
    output: {
      case_summary,
      major_problems: c.problems,
      urgent_issues: urgent,
      clinical_reasoning: reasoning,
      missing_information: missing,
      recommended_next_steps: steps,
      safety_concerns: safety,
      relevant_rule_ids: hits.map((h) => h.rule_id),
      uncertainty: { level: drivers.length >= 3 ? 'high' : drivers.length ? 'moderate' : 'low', driversKa: drivers },
      evidence_refresh_required: hits.some((h) => h.current_evidence_refresh_required),
    },
    relevantRuleIds: hits.map((h) => h.rule_id),
    notesKa: notes,
    humanReviewRequired: true,
  };
}

/* ── A02 Differential Diagnosis ──────────────────────────────────────────── */

export type DifferentialOutput = {
  must_exclude_urgently: { label: string; ruleIds: string[]; discriminatingTest: string | null }[];
  most_likely: { label: string; ruleIds: string[]; supporting: string[] }[];
  alternatives: { label: string; ruleIds: string[] }[];
  supporting_findings: string[];
  opposing_findings: string[];
  data_to_clarify: string[];
  discriminating_investigations: { text: string; ruleIds: string[] }[];
  noteKa: string;
};

const DIAGNOSTIC_ACTION = /(diagnos|evaluat|assess|differential|exclude|rule out|suspect|consider)/i;
const TEST_ACTION = /(test|imaging|ct|mri|ultrasound|endoscopy|biopsy|culture|radiograph|screen|measure|obtain)/i;
const URGENT_ACTION = /(emergen|urgent|immediat|life-threatening|admit|resuscitat|unstable)/i;

export function differentialAgent(input: CoreAgentInput): AgentEnvelope<DifferentialOutput> {
  const hits = clinicalHits(input.kb);
  const label = (h: ClinicalRuleHit) => `${h.topic_title ?? 'უსათაურო თემა'} — ${h.action ?? ''}`.trim();

  const urgent = hits.filter((h) => URGENT_ACTION.test(`${h.action} ${h.escalation.join(' ')}`)).slice(0, 6);
  const likely = hits.filter((h) => DIAGNOSTIC_ACTION.test(String(h.action))).slice(0, 6);
  const tests = hits.filter((h) => TEST_ACTION.test(String(h.action))).slice(0, 8);
  const rest = hits.filter((h) => !urgent.includes(h) && !likely.includes(h)).slice(0, 6);

  const clarify = [...new Set(hits.flatMap((h) => h.required_data))].filter((f) => !input.structured.availableData.includes(f.toLowerCase())).slice(0, 12);

  return {
    agent: 'A02',
    ok: true,
    output: {
      must_exclude_urgently: urgent.map((h) => ({ label: label(h), ruleIds: [h.rule_id], discriminatingTest: h.action ?? null })),
      most_likely: likely.map((h) => ({ label: label(h), ruleIds: [h.rule_id], supporting: h.required_data.filter((f) => input.structured.availableData.includes(f.toLowerCase())) })),
      alternatives: rest.map((h) => ({ label: label(h), ruleIds: [h.rule_id] })),
      supporting_findings: input.structured.problems,
      opposing_findings: [],
      data_to_clarify: clarify,
      discriminating_investigations: tests.map((h) => ({ text: String(h.action), ruleIds: [h.rule_id] })),
      noteKa:
        hits.length === 0
          ? 'შიდა კორპუსში ამ სინდრომზე წესი ვერ მოიძებნა — დიფერენციული სია შიდა მტკიცებულებით არ დგება.'
          : 'ალბათობა გამოსახულია კატეგორიებით; გამოგონილი რიცხვითი ალბათობა არ გამოიყენება.',
    },
    relevantRuleIds: hits.map((h) => h.rule_id),
    notesKa: coverageNote(input.kb),
    humanReviewRequired: true,
  };
}

/* ── A03 What Am I Missing ───────────────────────────────────────────────── */

export type MissingDataRow = { field: string; status: DataStatus; statusKa: string; ruleIds: string[]; whyKa: string };

export type MissingDataOutput = {
  rows: MissingDataRow[];
  missingCount: number;
  knownCount: number;
  auditQuestions: { question: string; questionId: string }[];
  noteKa: string;
};

const NOT_APPLICABLE_RULES: { field: RegExp; when: (i: CoreAgentInput) => boolean }[] = [
  { field: /pregnan/i, when: (i) => i.structured.sex === 'male' || i.structured.pregnant === 'not-applicable' },
  { field: /lactation|breastfeed/i, when: (i) => i.structured.sex === 'male' },
];

export function whatAmIMissingAgent(input: CoreAgentInput): AgentEnvelope<MissingDataOutput> {
  const hits = clinicalHits(input.kb);
  const have = new Set(input.structured.availableData.map((a) => a.toLowerCase()));
  const byField = new Map<string, string[]>();
  hits.forEach((h) => h.required_data.forEach((f) => byField.set(f, [...(byField.get(f) ?? []), h.rule_id])));

  const rows: MissingDataRow[] = [...byField.entries()].map(([field, ruleIds]) => {
    const na = NOT_APPLICABLE_RULES.find((r) => r.field.test(field) && r.when(input));
    const status: DataStatus = na ? 'NOT_APPLICABLE' : have.has(field.toLowerCase()) ? 'KNOWN' : 'MISSING';
    return {
      field,
      status,
      statusKa: DATA_STATUS_KA[status],
      ruleIds,
      whyKa:
        status === 'MISSING'
          ? `ეს მონაცემი აუცილებელია ${ruleIds.length} მოძიებული წესის გამოსაყენებლად; მის გარეშე დასკვნა ვერ დადასტურდება.`
          : status === 'NOT_APPLICABLE'
            ? 'ამ პაციენტისთვის არ გამოიყენება.'
            : 'მონაცემი ქეისშია შეყვანილი.',
    };
  });

  // Case-level gaps that no rule asked for but every record needs.
  const baseline: { field: string; present: boolean }[] = [
    { field: 'allergies', present: input.structured.allergies.length > 0 },
    { field: 'medication_list', present: input.structured.medications.length > 0 },
    { field: 'timeline', present: input.structured.timeline.length > 0 },
  ];
  baseline.forEach((b) => {
    if (rows.some((r) => r.field === b.field)) return;
    rows.push({
      field: b.field,
      status: b.present ? 'KNOWN' : 'MISSING',
      statusKa: DATA_STATUS_KA[b.present ? 'KNOWN' : 'MISSING'],
      ruleIds: [],
      whyKa: b.present ? 'მონაცემი ქეისშია შეყვანილი.' : 'საბაზისო დოკუმენტაციური მოთხოვნა — არარსებობა თავისთავად დოკუმენტაციური ხარვეზია.',
    });
  });

  const order: DataStatus[] = ['MISSING', 'UNKNOWN', 'KNOWN', 'NOT_APPLICABLE'];
  rows.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));

  return {
    agent: 'A03',
    ok: true,
    output: {
      rows,
      missingCount: rows.filter((r) => r.status === 'MISSING').length,
      knownCount: rows.filter((r) => r.status === 'KNOWN').length,
      auditQuestions: questionHits(input.kb).slice(0, 6).map((q) => ({ question: q.question, questionId: q.rule_id })),
      noteKa: hits.length ? '' : 'შედარება ჩატარდა მხოლოდ საბაზისო მოთხოვნებთან — შიდა წესები ამ კითხვაზე არ მოიძებნა.',
    },
    relevantRuleIds: hits.map((h) => h.rule_id),
    notesKa: coverageNote(input.kb),
    humanReviewRequired: rows.some((r) => r.status === 'MISSING'),
  };
}

/* ── A04 Challenge My Plan ───────────────────────────────────────────────── */

export type ChallengeOutput = {
  contraindications: { text: string; ruleIds: string[] }[];
  missing_prerequisites: { text: string; ruleIds: string[] }[];
  missing_monitoring: { text: string; ruleIds: string[] }[];
  undertreatment: { text: string; ruleIds: string[] }[];
  overtreatment: { text: string; ruleIds: string[] }[];
  unsafe_discharge: { text: string; ruleIds: string[] }[];
  missing_escalation: { text: string; ruleIds: string[] }[];
  rule_conflicts: { text: string; ruleIds: string[] }[];
  alternative_plan: string[];
  agreementKa: string;
};

export function challengePlanAgent(input: CoreAgentInput): AgentEnvelope<ChallengeOutput> {
  if (!input.plan.trim()) {
    return { agent: 'A04', ok: false, output: null, relevantRuleIds: [], notesKa: ['შემოთავაზებული გეგმა არ არის შეყვანილი — კრიტიკული შემოწმება ვერ ჩატარდება.'], humanReviewRequired: false };
  }
  const plan = input.plan.toLowerCase();
  const hits = clinicalHits(input.kb);
  const med = reviewMedications(input.patient);

  // Drugs named in the PLAN are evaluated too, not just those already on the
  // medication list — otherwise a newly proposed contraindicated drug is missed.
  // Georgian drug names inflect (იბუპროფენი → იბუპროფენს), so match on the stem.
  const planLower = input.plan.toLowerCase();
  const namedInPlan = (name: string) => Boolean(name) && planLower.includes(stem(name));
  const plannedDrugs = DRUGS.filter((d) => namedInPlan(d.generic_name) || namedInPlan(d.generic_ka) || d.brand_names.some((b) => namedInPlan(b)));
  const renalValue = input.structured.renal.crcl ?? input.structured.renal.egfr;
  const problems = input.structured.problems.join(' ').toLowerCase();
  const plannedIssues: { text: string; ruleIds: string[] }[] = [];
  plannedDrugs.forEach((d) => {
    if (renalValue !== null && renalValue !== undefined) {
      d.renal_adjustment.forEach((ra) => {
        const nums = ra.threshold.match(/\d+/g)?.map(Number) ?? [];
        const hit = /</.test(ra.threshold) && nums.length === 1 ? renalValue < nums[0] : nums.length >= 2 ? renalValue >= Math.min(...nums) && renalValue <= Math.max(...nums) : false;
        if (hit) plannedIssues.push({ text: `გეგმაში დანიშნულია ${d.generic_ka || d.generic_name}, ხოლო თირკმლის ფუნქცია (${renalValue}) ხვდება ზღვარში „${ra.threshold}“ → ${ra.action}`, ruleIds: [] });
      });
    }
    d.contraindications.forEach((ci) => {
      const key = ci.toLowerCase().split(/[\s,]+/).find((w) => w.length > 5);
      if (key && problems.includes(key)) plannedIssues.push({ text: `გეგმაში დანიშნულია ${d.generic_ka || d.generic_name}, რომლის უკუჩვენებაა „${ci}“ — ეს ქეისის პრობლემების სიაშია.`, ruleIds: [] });
    });
    input.structured.allergies.forEach((a) => {
      if (d.generic_name.toLowerCase().includes(a.toLowerCase().split(' ')[0])) plannedIssues.push({ text: `გეგმაში დანიშნულია ${d.generic_name}, პაციენტს კი დოკუმენტირებული აქვს ალერგია „${a}“.`, ruleIds: [] });
    });
    if (input.structured.pregnant === 'yes' && d.pregnancy) plannedIssues.push({ text: `ორსულობა: ${d.generic_ka || d.generic_name} — ${d.pregnancy}`, ruleIds: [] });
  });

  const contraindications = [
    ...plannedIssues,
    ...med.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').map((f) => ({ text: `${f.titleKa}: ${f.detail} → ${f.action}`, ruleIds: [] as string[] })),
    ...hits.filter((h) => h.exceptions.length).slice(0, 5).map((h) => ({ text: `გამონაკლისი/უკუჩვენება მოძიებულ წესში: ${h.exceptions.join('; ')}`, ruleIds: [h.rule_id] })),
  ];

  const missing_prerequisites = hits
    .filter((h) => h.required_data.some((f) => !input.structured.availableData.includes(f.toLowerCase())))
    .slice(0, 6)
    .map((h) => ({ text: `წესი მოითხოვს მონაცემებს, რომლებიც ქეისში არ არის: ${h.required_data.filter((f) => !input.structured.availableData.includes(f.toLowerCase())).join(', ')}`, ruleIds: [h.rule_id] }));

  const monitoringRules = hits.filter((h) => h.monitoring.length);
  const missing_monitoring = /მონიტორინგ|კონტროლ|განმეორებ|follow/i.test(plan)
    ? []
    : monitoringRules.slice(0, 5).map((h) => ({ text: `მოძიებული წესი მოითხოვს მონიტორინგს, რაც გეგმაში არ ჩანს: ${h.monitoring.join('; ')}`, ruleIds: [h.rule_id] }));

  const escalationRules = hits.filter((h) => h.escalation.length);
  const missing_escalation = /ესკალაცი|გადაუდებელ|გადამისამართ|escalat/i.test(plan)
    ? []
    : escalationRules.slice(0, 5).map((h) => ({ text: `ესკალაციის კრიტერიუმი წესიდან არ არის ასახული გეგმაში: ${h.escalation.join('; ')}`, ruleIds: [h.rule_id] }));

  const undertreatment = hits
    .filter((h) => h.action && !plan.includes(String(h.action).toLowerCase().slice(0, 18)))
    .slice(0, 5)
    .map((h) => ({ text: `მოძიებული წესი ითვალისწინებს ქმედებას, რომელიც გეგმაში არ ჩანს: ${h.action}`, ruleIds: [h.rule_id] }));

  const overtreatment = /ანტიბიოტიკ|antibiotic/i.test(plan) && !/ინფექცი|infection|ცხელებ|fever|კულტურ|culture/i.test(`${plan} ${input.structured.problems.join(' ')}`)
    ? [{ text: 'გეგმაში ანტიმიკრობული თერაპიაა, მაგრამ ინფექციური ჩვენება ქეისში დოკუმენტირებული არ არის.', ruleIds: [] as string[] }]
    : [];

  const unsafe_discharge = /გა[ვიმსთ]?წერ|გაწერ|discharge/i.test(plan) && !/დაბრუნებ|red flag|წითელი ალამ|კრიტერიუმ/i.test(plan)
    ? [{ text: 'გეგმა ითვალისწინებს გაწერას დაბრუნების კონკრეტული კრიტერიუმების გარეშე.', ruleIds: [] as string[] }]
    : [];

  const alternative = [
    'დააფიქსირე, რომელი შედეგი შეცვლიდა მართვას — ეს ამცირებს anchoring bias-ს.',
    'განიხილე ეტაპობრივი სტრატეგია: ჯერ დიაგნოსტიკური გაურკვევლობის შემცირება, შემდეგ დეფინიტიური თერაპია.',
    ...(missing_prerequisites.length ? ['შეავსე წესების მიერ მოთხოვნილი მონაცემები გეგმის დაწყებამდე.'] : []),
  ];

  const anyIssue = contraindications.length + missing_prerequisites.length + missing_monitoring.length + missing_escalation.length + undertreatment.length + overtreatment.length + unsafe_discharge.length;

  return {
    agent: 'A04',
    ok: true,
    output: {
      contraindications,
      missing_prerequisites,
      missing_monitoring,
      undertreatment,
      overtreatment,
      unsafe_discharge,
      missing_escalation,
      rule_conflicts: [],
      alternative_plan: alternative,
      agreementKa: anyIssue ? `გამოვლინდა ${anyIssue} შესაძლო ხარვეზი გეგმაში.` : 'ავტომატურ შემოწმებაში გეგმასთან შეუსაბამობა არ გამოვლინდა; ეს არ არის გეგმის დადასტურება.',
    },
    relevantRuleIds: hits.map((h) => h.rule_id),
    notesKa: coverageNote(input.kb),
    humanReviewRequired: true,
  };
}

/* ── A07 Drug Safety ─────────────────────────────────────────────────────── */

export type DrugSafetyOutput = {
  resolved: { drug: string; known: boolean }[];
  drug_drug: { text: string; severity: string; drugs: string[] }[];
  drug_disease: { text: string; drugs: string[] }[];
  allergy: string[];
  age_related: string[];
  renal: { text: string; drugs: string[] }[];
  hepatic: { text: string; drugs: string[] }[];
  pregnancy: string[];
  monitoring: string[];
  duplication: { text: string; drugs: string[] }[];
  polypharmacy: string | null;
  deprescribing: { drug: string; taperNeeded: boolean; taperConcept: string }[];
  externalVerificationRequiredKa: string | null;
  ruleIds: string[];
};

export function drugSafetyAgent(input: CoreAgentInput): AgentEnvelope<DrugSafetyOutput> {
  const p = input.patient;
  const review = reviewMedications(p);
  const hits = clinicalHits(input.kb);
  const unresolved = review.unresolved;

  const byCat = (cat: string) => review.findings.filter((f) => f.category === cat);

  const ageRelated: string[] = [];
  if ((p.age ?? 0) >= 65 && review.burdens.anticholinergic + review.burdens.sedative > 0) {
    ageRelated.push(`65+ ასაკი: ანტიქოლინერგული ტვირთი ${review.burdens.anticholinergic}, სედაციური ${review.burdens.sedative} — დაცემისა და დელირიუმის რისკი.`);
  }

  const pregnancy: string[] = [];
  if (p.pregnant === 'yes') {
    review.resolved.forEach((r) => {
      if (r.drug?.pregnancy) pregnancy.push(`${r.drug.generic_name}: ${r.drug.pregnancy}`);
    });
  } else if (p.sex === 'female' && p.pregnant === 'unknown' && (p.age ?? 0) >= 12 && (p.age ?? 0) <= 55) {
    pregnancy.push('ორსულობის სტატუსი დაუზუსტებელია რეპროდუქციული ასაკის პაციენტში — ეს ცვლის რამდენიმე პრეპარატის დასაშვებობას.');
  }

  const externalVerification =
    unresolved.length || !review.resolved.length
      ? `${unresolved.length ? `შემდეგი პრეპარატები სტრუქტურირებულ ბაზაში ვერ მოიძებნა: ${unresolved.join(', ')}. ` : ''}ამ ნაწილზე დოზირება, ურთიერთქმედება და უკუჩვენება ავტომატურად არ შემოწმებულა — საჭიროა გარე, აქტუალურ წყაროსთან გადამოწმება.`
      : null;

  return {
    agent: 'A07',
    ok: true,
    output: {
      resolved: p.medications.map((m) => ({ drug: m.drug, known: Boolean(findDrug(m.drug)) })),
      drug_drug: byCat('interaction').map((f) => ({ text: `${f.titleKa}: ${f.detail} → ${f.action}`, severity: f.severity, drugs: f.drugs })),
      drug_disease: byCat('drug_disease').map((f) => ({ text: `${f.titleKa}: ${f.detail} → ${f.action}`, drugs: f.drugs })),
      allergy: p.allergies.length ? p.allergies.map((a) => `დოკუმენტირებული ალერგია: ${a} — ყოველი დანიშვნა უნდა შემოწმდეს ამის მიხედვით.`) : ['ალერგიული ანამნეზი დოკუმენტირებული არ არის.'],
      age_related: ageRelated,
      renal: byCat('renal').map((f) => ({ text: `${f.titleKa}: ${f.detail} → ${f.action}`, drugs: f.drugs })),
      hepatic: byCat('hepatic').map((f) => ({ text: `${f.titleKa}: ${f.detail} → ${f.action}`, drugs: f.drugs })),
      pregnancy,
      monitoring: review.resolved.flatMap((r) => (r.drug ? r.drug.monitoring.slice(0, 2).map((m) => `${r.drug!.generic_name}: ${m}`) : [])),
      duplication: byCat('duplicate').map((f) => ({ text: f.detail, drugs: f.drugs })),
      polypharmacy: p.medications.length >= 5 ? `პაციენტი იღებს ${p.medications.length} პრეპარატს — გამოიყენება პოლიფარმაციის შეფასების კრიტერიუმები.` : null,
      deprescribing: review.deprescribing.map((d) => ({ drug: d.drug, taperNeeded: d.taperNeeded, taperConcept: d.taperConcept })),
      externalVerificationRequiredKa: externalVerification,
      ruleIds: hits.map((h) => h.rule_id),
    },
    relevantRuleIds: hits.map((h) => h.rule_id),
    notesKa: coverageNote(input.kb),
    humanReviewRequired: true,
  };
}

/* ── quality/defect grounding helper (feeds A13/A14) ─────────────────────── */

export type QualityGrounding = {
  applicableRules: { ruleId: string; family: string | null; maturity: string; criterion: string | null; requiredEvidence: string[]; humanReviewRequired: boolean; autoFlagAllowed: boolean }[];
  auditQuestions: { questionId: string; question: string; defectClasses: string[] }[];
  hardRulesKa: string[];
};

export const QUALITY_HARD_RULES_KA = [
  'არასასურველი შედეგი ავტომატურად არ ნიშნავს დეფექტს.',
  'გაიდლაინიდან გადახვევა ავტომატურად არ ნიშნავს დაუდევრობას.',
  'ჩანაწერის არარსებობა არ არის იმის მტკიცებულება, რომ ქმედება არ განხორციელებულა.',
  'დროითი თანმიმდევრობა არ არის მიზეზობრიობა.',
  'შესაძლო დეფექტი არ არის სამართლებრივი პასუხისმგებლობა.',
];

export function qualityGrounding(input: CoreAgentInput): QualityGrounding {
  const q = qualityHits(input.kb);
  return {
    applicableRules: q.map((r) => ({
      ruleId: r.rule_id,
      family: r.rule_family,
      maturity: r.maturity,
      criterion: r.criterion_or_action ?? r.trigger_or_question,
      requiredEvidence: r.required_evidence,
      humanReviewRequired: r.human_review_required,
      autoFlagAllowed: r.eligible_for_automatic_flagging && r.maturity !== 'QUALITY_RULE_CANDIDATE',
    })),
    auditQuestions: questionHits(input.kb).map((a) => ({ questionId: a.rule_id, question: a.question, defectClasses: a.defect_classes })),
    hardRulesKa: QUALITY_HARD_RULES_KA,
  };
}

export type { RetrievalHitKb };
