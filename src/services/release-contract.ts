import type { ClinicalAnswer } from '@/schemas/clinical';
import type { AgentResult } from '@/schemas/agent';
import type { ReleaseDecision } from './verifiers';

/**
 * PUBLICATION CONTRACT (audit F03, 2026-10-21)
 *
 * The release gate's decision is enforced on the response itself, once, at the
 * API level — not by a red section next to the text it was meant to stop.
 *
 *   PASS / PASS_WITH_WARNING → published (warnings attached);
 *   HUMAN_REVIEW → published as a DRAFT that is explicitly not automatically
 *                  approved; every view and export carries that state;
 *   BLOCK → withheld: the bottom line, answer sections, claims, agent texts,
 *           structured outputs and sources are replaced by a holding message
 *           with the reasons and what is needed. Nothing withheld remains in
 *           the payload, so copy, print, Markdown/JSON/DOCX export and the
 *           saved conversation cannot show it either.
 */

export type PublicationState = 'published' | 'published_with_warning' | 'pending_human_review' | 'withheld';

export type Publication = {
  state: PublicationState;
  /** Shown above the answer and written into every export. */
  labelKa: string;
  noteKa: string;
};

export function publicationOf(release: ReleaseDecision): Publication {
  switch (release.status) {
    case 'BLOCK':
      return { state: 'withheld', labelKa: 'პასუხი შეკავებულია', noteKa: 'ავტომატურმა უსაფრთხოების შემოწმებამ (A20) პასუხი არ გამოაქვეყნა. მიზეზი და საჭირო ინფორმაცია მითითებულია ქვემოთ.' };
    case 'HUMAN_REVIEW':
      return { state: 'pending_human_review', labelKa: 'პროექტი — საჭიროებს ადამიანის განხილვას', noteKa: 'ეს პასუხი ავტომატურად დამტკიცებული არ არის. გამოიყენეთ მხოლოდ კვალიფიციური სპეციალისტის განხილვის შემდეგ.' };
    case 'PASS_WITH_WARNING':
      return { state: 'published_with_warning', labelKa: 'გამოქვეყნებულია გაფრთხილებით', noteKa: 'იხილეთ შეზღუდვები და წყაროების სტატუსი.' };
    default:
      return { state: 'published', labelKa: 'გამოქვეყნებულია', noteKa: '' };
  }
}

type Withholdable = {
  answer: ClinicalAnswer;
  claims: unknown[];
  agentResults: AgentResult[];
  sources: unknown[];
  release: ReleaseDecision;
  structured?: unknown;
  core?: unknown;
  provenance?: unknown[];
  clinicalKnowledge?: unknown;
  medication?: unknown;
  verification?: unknown;
  claimSupport?: unknown;
};

const HOLD_PATIENT = 'პასუხი ავტომატურ უსაფრთხოების შემოწმებას ვერ გაივლის და ამიტომ არ ნაჩვენებია. ამ კითხვაზე მიმართეთ ექიმს ან ფარმაცევტს. სასწრაფო მდგომარეობისას დარეკეთ 112-ზე.';
const HOLD_CLINICIAN = 'პასუხი შეკავებულია: საბოლოო უსაფრთხოების ბარიერმა (A20) აღმოაჩინა გადაუმოწმებელი შინაარსი, რომლის გამოქვეყნებაც დაუშვებელია. დაუდასტურებელი ტექსტი, რიცხვები და წყაროები პასუხიდან ამოღებულია.';

/**
 * Returns the response the client may receive. For BLOCK, everything that
 * carries generated or agent clinical content is replaced; only the holding
 * message, the reasons (clinician view) and what is missing remain.
 */
export function enforcePublication<T extends Withholdable>(out: T, mode: string): T & { publication: Publication } {
  const publication = publicationOf(out.release);
  if (publication.state !== 'withheld') return { ...out, publication };
  const patient = mode === 'patient';
  const answer: ClinicalAnswer = {
    ...out.answer,
    bottomLine: patient ? HOLD_PATIENT : HOLD_CLINICIAN,
    sections: [
      {
        id: 'withheld',
        titleKa: 'რატომ შეკავდა და რა არის საჭირო',
        titleEn: 'Withheld',
        // Internal diagnostics (rule IDs, model names) are not shown to a patient.
        body: patient ? 'საჭიროა კვალიფიციური სპეციალისტის კონსულტაცია.' : 'განმეორებითი მოთხოვნისას დააზუსტეთ პრეპარატის ზუსტი დასახელება, ერთეულები და კლინიკური მონაცემები, ან გადაეცით კითხვა კლინიცისტს განსახილველად.',
        bullets: patient ? [] : out.release.reasonsKa,
        tone: 'critical',
      },
    ],
    claims: [],
    humanReviewRequired: true,
  };
  const agentResults = out.agentResults.map((a) => ({ ...a, summary: a.status === 'ok' ? 'შედეგი შეკავებულია (A20)' : a.summary, sections: [], claims: [], data: {}, note: '' }));
  return {
    ...out,
    answer,
    claims: [],
    agentResults,
    sources: [],
    ...(out.structured !== undefined ? { structured: null } : {}),
    ...(out.core !== undefined ? { core: null } : {}),
    ...(out.provenance !== undefined ? { provenance: [] } : {}),
    ...(out.clinicalKnowledge !== undefined ? { clinicalKnowledge: null } : {}),
    ...(out.verification !== undefined ? { verification: null } : {}),
    ...(out.claimSupport !== undefined ? { claimSupport: null } : {}),
    release: { ...out.release, reasonsKa: patient ? [] : out.release.reasonsKa },
    publication,
  } as T & { publication: Publication };
}
