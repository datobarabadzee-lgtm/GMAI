import type { PatientContext } from '@/schemas/clinical';
import type { RetrievalResult } from '@/kb/retrieval-service';

/** Structured case representation handed to every core agent. */
export type StructuredCase = {
  label: string;
  age: number | null;
  sex: string;
  pregnant: string;
  weightKg: number | null;
  renal: { creatinine: number | null; egfr: number | null; crcl: number | null };
  hepatic: string;
  allergies: string[];
  problems: string[];
  medications: { drug: string; dose: string; frequency: string; indication: string; status: string }[];
  labs: { analyte: string; value: number; unit: string; date: string }[];
  timeline: { date: string; category: string; title: string; detail: string }[];
  narrative: string;
  documents: string[];
  /** Normalized data element keys the case actually provides (for required_data matching). */
  availableData: string[];
};

export type DataStatus = 'KNOWN' | 'MISSING' | 'UNKNOWN' | 'NOT_APPLICABLE';

export const DATA_STATUS_KA: Record<DataStatus, string> = {
  KNOWN: 'ცნობილია',
  MISSING: 'აკლია',
  UNKNOWN: 'უცნობია',
  NOT_APPLICABLE: 'არ გამოიყენება',
};

export type CoreAgentInput = {
  question: string;
  plan: string;
  patient: PatientContext;
  structured: StructuredCase;
  kb: RetrievalResult;
  riskLevel: string;
};

export type AgentEnvelope<T> = {
  agent: string;
  ok: boolean;
  output: T | null;
  relevantRuleIds: string[];
  notesKa: string[];
  humanReviewRequired: boolean;
};

/** Build the structured case from the session patient context. */
export function structureCase(p: PatientContext, crcl: number | null): StructuredCase {
  const available: string[] = [];
  const mark = (k: string, present: boolean) => {
    if (present) available.push(k);
  };
  mark('age', p.age !== null);
  mark('sex', p.sex !== 'unspecified');
  mark('weight', p.weightKg !== null);
  mark('height', p.heightCm !== null);
  mark('creatinine', p.creatinineMgDl !== null);
  mark('egfr', p.egfr !== null || crcl !== null);
  mark('renal_function', p.egfr !== null || crcl !== null);
  mark('pregnancy_status', p.pregnant !== 'unknown');
  mark('allergies', p.allergies.length > 0);
  mark('medication_list', p.medications.length > 0);
  mark('problem_list', p.problems.length > 0);
  mark('laboratory_results', p.labs.length > 0);
  mark('timeline', p.timeline.length > 0);
  p.labs.forEach((l) => available.push(l.analyte.toLowerCase().replace(/\s+/g, '_')));
  p.problems.forEach((pr) => available.push(pr.toLowerCase().replace(/\s+/g, '_')));

  return {
    label: p.label,
    age: p.age,
    sex: p.sex,
    pregnant: p.pregnant,
    weightKg: p.weightKg,
    renal: { creatinine: p.creatinineMgDl, egfr: p.egfr, crcl },
    hepatic: p.hepaticImpairment,
    allergies: p.allergies,
    problems: p.problems,
    medications: p.medications.filter((m) => m.status === 'active' || m.status === 'unknown').map((m) => ({ drug: m.drug, dose: m.dose, frequency: m.frequency, indication: m.indication, status: m.status })),
    labs: p.labs.map((l) => ({ analyte: l.analyte, value: l.value, unit: l.unit, date: l.date })),
    timeline: p.timeline.map((t) => ({ date: t.date, category: t.category, title: t.title, detail: t.detail })),
    narrative: p.narrative,
    documents: p.documents.map((d) => d.name),
    availableData: [...new Set(available)],
  };
}
