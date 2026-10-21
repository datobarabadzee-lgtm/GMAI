import 'server-only';
import { CONSENT_VERSION, PROFESSIONAL_ATTESTATION_VERSION } from '@/knowledge/controller';

/**
 * PROCESSING POLICY (audit F07, 2026-10-21)
 *
 * Which requests may send health data to an external processor (the AI
 * provider) is decided by the DATA in the request, not by the screen it came
 * from. Every route that forwards case data calls `checkProcessingBasis`.
 *
 *   · The data subject (patient mode): the consent header, matching the
 *     version of the disclosure text they affirmed (CONSENT_VERSION).
 *   · A professional (every other mode, document generation) whose request
 *     carries patient-specific data: an attestation header, matching the
 *     current attestation text, that the data are de-identified, or that the
 *     patient's consent or another lawful basis exists under the institution's
 *     documented policy. The application does not decide that basis for the
 *     institution; it records which one was asserted.
 *   · A general question with no patient-specific data needs neither.
 *
 * PROCESSING_POLICY=institutional with PROCESSING_BASIS_REF=<document id> lets
 * an internal deployment name the institution's approved basis; the
 * attestation text then refers to it. Without it the attestation must state
 * de-identification or patient consent.
 */

export type BasisCheck =
  | { ok: true; basis: 'none_needed' | 'subject_consent' | 'professional_attestation' }
  | { ok: false; status: 451; error: 'CONSENT_REQUIRED' | 'PROCESSING_BASIS_REQUIRED'; requiredVersion: string; messageKa: string };

type Patientish = {
  age?: number | null;
  weightKg?: number | null;
  creatinineMgDl?: number | null;
  egfr?: number | null;
  narrative?: string;
  problems?: string[];
  medications?: unknown[];
  labs?: unknown[];
  allergies?: string[];
  timeline?: unknown[];
};

/** Patient-describing phrasing in free text: an age, „my patient", values with units. */
const PATIENT_TEXT = /(\d{1,3}\s*(წლის|თვის|year[- ]old|yo\b))|პაციენტ(ს|ი|მა|ის)\b|ჩემ(ი|ს)\s+(პაციენტ|შვილ|დედ|მამ|ანალიზ|კვლევ|შედეგ)|\b(my patient|my (son|daughter|mother|father))\b|\d+(?:[.,]\d+)?\s*(მგ\/დლ|მმოლ\/ლ|გ\/დლ|mg\/dl|mmol\/l|g\/dl)/i;

export function hasPatientData(input: { question?: string; patient?: Patientish | null; extras?: Record<string, unknown> | null; texts?: string[] }): boolean {
  const p = input.patient;
  if (p) {
    if ([p.age, p.weightKg, p.creatinineMgDl, p.egfr].some((v) => v !== null && v !== undefined)) return true;
    if ((p.narrative ?? '').trim()) return true;
    if ([p.problems, p.medications, p.labs, p.allergies, p.timeline].some((a) => Array.isArray(a) && a.length > 0)) return true;
  }
  const x = input.extras ?? {};
  for (const k of ['caseNarrative', 'reportText', 'intake', 'labs', 'claim']) {
    const v = x[k];
    if (typeof v === 'string' ? v.trim() : v && typeof v === 'object' && Object.keys(v as object).length) return true;
  }
  return [input.question ?? '', ...(input.texts ?? [])].some((t) => PATIENT_TEXT.test(t));
}

export function checkProcessingBasis(req: Request, opts: { mode: string; patientData: boolean }): BasisCheck {
  if (opts.mode === 'patient') {
    if (req.headers.get('x-consent-version') === CONSENT_VERSION) return { ok: true, basis: 'subject_consent' };
    return {
      ok: false,
      status: 451,
      error: 'CONSENT_REQUIRED',
      requiredVersion: CONSENT_VERSION,
      messageKa: 'ჯანმრთელობის მონაცემის დამუშავება შეუძლებელია ინფორმირებული თანხმობის გარეშე. გთხოვთ, გაეცნოთ ინფორმაციას და გასცეთ თანხმობა.',
    };
  }
  if (!opts.patientData) return { ok: true, basis: 'none_needed' };
  if (req.headers.get('x-processing-attestation') === PROFESSIONAL_ATTESTATION_VERSION) return { ok: true, basis: 'professional_attestation' };
  return {
    ok: false,
    status: 451,
    error: 'PROCESSING_BASIS_REQUIRED',
    requiredVersion: PROFESSIONAL_ATTESTATION_VERSION,
    messageKa:
      'მოთხოვნა შეიცავს პაციენტის მონაცემებს, რომლებიც AI-პროვაიდერს გადაეცემა. გაგზავნამდე დაადასტურეთ, რომ მონაცემები დეპერსონალიზებულია, ან რომ პაციენტის თანხმობა ან დაწესებულების დოკუმენტირებული სხვა სამართლებრივი საფუძველი არსებობს.',
  };
}

export function institutionalBasisRef(): string | null {
  return process.env.PROCESSING_POLICY === 'institutional' && process.env.PROCESSING_BASIS_REF ? process.env.PROCESSING_BASIS_REF : null;
}
