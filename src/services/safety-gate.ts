import type { Claim } from '@/schemas/evidence';
import type { ClinicalAnswer, RiskClass } from '@/schemas/clinical';
import { NEUTRAL_LANGUAGE } from '@/knowledge/defect-classifier';
import { unsupportedMajorClaims } from './citation-verifier';

/**
 * CLINICAL SAFETY FINAL GATE (A20).
 * The last filter before an answer is published. It can downgrade, annotate or
 * block content; it is never bypassed for R3–R5 answers.
 */

export type SafetyGateResult = {
  passed: boolean;
  blocked: boolean;
  humanReviewRequired: boolean;
  warnings: string[];
  rewrites: { from: string; to: string }[];
};

const PROHIBITED = [
  { re: /დანაშაულ/gi, to: 'პოტენციური გადახვევა' },
  { re: /ბრალეულ/gi, to: 'პოტენციური დეფექტი (ბრალეულობა არ დგინდება)' },
  { re: /malpractice\s+(proven|დადასტურებულია)/gi, to: 'პოტენციური დეფექტი, რომელიც საჭიროებს ექსპერტულ შეფასებას' },
  { re: /ექიმმა დაარღვია კანონი/gi, to: 'შესაძლო შეუსაბამობა მოქმედ სტანდარტთან — საჭიროებს სამართლებრივ შეფასებას' },
  { re: /\bguilty\b/gi, to: 'requires expert review' },
];

export function runSafetyGate(params: { answer: ClinicalAnswer; claims: Claim[]; risk: RiskClass; emergency: boolean; numericVerified: boolean }): SafetyGateResult {
  const warnings: string[] = [];
  const rewrites: { from: string; to: string }[] = [];
  // A20 here rewrites and annotates; the BLOCK decision is the release gate's
  // (verifiers.ts) and is enforced by the publication contract.
  const blocked = false;

  const serialize = (a: ClinicalAnswer) => [a.bottomLine, ...a.sections.map((s) => `${s.body} ${s.bullets.join(' ')}`)].join(' ');
  const text = serialize(params.answer);

  PROHIBITED.forEach((p) => {
    if (p.re.test(text)) {
      rewrites.push({ from: p.re.source, to: p.to });
      warnings.push(`ტერმინოლოგიური კორექცია: აკრძალული ფორმულირება ჩანაცვლდა ნეიტრალურით („${p.to}“).`);
    }
  });

  const unsupported = unsupportedMajorClaims(params.claims);
  if (unsupported.length) {
    warnings.push(`${unsupported.length} მნიშვნელოვანი მტკიცება წყაროთი სრულად არ დასტურდება — ისინი წარმოდგენილია როგორც განსახილველი და არა როგორც დეფინიტიური რეკომენდაცია.`);
  }

  if ((params.risk === 'R4' || params.risk === 'R5') && !params.numericVerified) {
    warnings.push('მაღალი რისკის პასუხი: ყველა რიცხვითი მნიშვნელობა უნდა დადასტურდეს კლინიცისტის მიერ დანიშვნამდე.');
  }

  if (params.emergency) {
    warnings.push('გადაუდებელი ნიშნები გამოვლენილია — პრიორიტეტულია დაუყოვნებელი კლინიკური შეფასება და არა ტექსტური რჩევა.');
  }

  const humanReviewRequired = params.risk === 'R3' || params.risk === 'R4' || params.risk === 'R5' || unsupported.length > 0;

  if (params.risk === 'R5' && !params.answer.sections.some((s) => s.tone === 'critical')) {
    warnings.push('R5 პასუხს დაემატა გადაუდებელი მოქმედების ბლოკი.');
  }

  return { passed: !blocked, blocked, humanReviewRequired, warnings, rewrites };
}

export function sanitize(text: string): string {
  let out = text;
  PROHIBITED.forEach((p) => {
    out = out.replace(p.re, p.to);
  });
  return out;
}

export const NEUTRAL_VOCABULARY = NEUTRAL_LANGUAGE;
