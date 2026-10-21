import { NextResponse } from 'next/server';
import { sessionFrom } from '@/server/medications/receipts';
import { callerKeyFrom, isPlausibleKey } from '@/services/ai-provider';
import { checkLimit, recordSpend } from '@/services/rate-limit';
import { checkProcessingBasis, hasPatientData } from '@/server/processing-policy';
import { substanceOf } from '@/lib/patient-intake';
import { z } from 'zod';
import { ClinicalModeSchema, PatientContextSchema } from '@/schemas/clinical';
import { DefectReviewModeSchema } from '@/schemas/quality';
import { orchestrate } from '@/services/orchestrator';
import { PUBLIC_MODES, appTier } from '@/lib/tier';
import { engineStatus } from '@/services/ai-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  question: z.string().max(20000).default(''),
  plan: z.string().max(20000).optional(),
  mode: ClinicalModeSchema.optional(),
  patient: PatientContextSchema.optional(),
  reviewMode: DefectReviewModeSchema.optional(),
  academyLevel: z.enum(['student', 'resident', 'gp', 'specialist']).optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON', messageKa: 'მოთხოვნის ფორმატი არასწორია.' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'VALIDATION_FAILED', messageKa: 'მოწოდებული მონაცემები არ შეესაბამება სქემას.', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 422 });
  }

  // Public tier: every mode is reachable, but without a configured model the
  // agents fall back to deterministic templates. That is useful in development
  // and misleading to a reader, so the public tier refuses rather than returning
  // filler, and the interface offers the direct channel instead.
  if (appTier() === 'public') {
    const mode = parsed.data.mode ?? 'quick';
    if (!(PUBLIC_MODES as readonly string[]).includes(mode)) {
      return NextResponse.json(
        { error: 'MODE_NOT_AVAILABLE_PUBLIC', messageKa: 'ეს რეჟიმი ხელმისაწვდომი არ არის.' },
        { status: 403 },
      );
    }
    parsed.data.mode = mode;

    // A visitor's own key (BYOK) is a working engine even when the operator has
    // none configured (audit F19): the platform check applies only without it.
    const byok = callerKeyFrom(req);
    if (engineStatus().engine !== 'live' && !(byok && isPlausibleKey(byok))) {
      return NextResponse.json(
        {
          error: 'AI_NOT_CONFIGURED',
          messageKa:
            'AI-პასუხი ამჟამად გამორთულია, ამიტომ ავტომატურ პასუხს არ გაძლევთ — ნახევრად მზა ტექსტი კითხვაზე პასუხი არ არის. დაუსვით კითხვა პირდაპირ ექიმს.',
        },
        { status: 503 },
      );
    }
  }

  /**
   * A patient asking "explain my test" with nothing attached must be asked for
   * the test, not given a paragraph about values nobody supplied. This guard
   * sits on the API so it holds even when the request does not come from our UI.
   */
  if (parsed.data.mode === 'patient') {
    const q = parsed.data.question;
    // A starter phrase with nothing after it („რას ნიშნავს დიაგნოზი:") names
    // nothing. Answering it produced an invented diagnosis; ask instead.
    const own = substanceOf(q);
    const hasContext = Boolean(parsed.data.patient && (parsed.data.patient.problems.length || parsed.data.patient.labs.length || parsed.data.patient.medications.length || parsed.data.patient.narrative.trim()));
    if (own.text.replace(/[^\p{L}\p{N}]/gu, '').length < 3 && !hasContext) {
      return NextResponse.json(
        { error: 'NEEDS_DETAIL', kind: own.kind, messageKa: 'კითხვაში არაფერია დასახელებული — დააზუსტეთ, რომელი დიაგნოზი, ანალიზი, წამალი ან სიმპტომი გაინტერესებთ.' },
        { status: 422 },
      );
    }
    // Only a request to interpret the patient's OWN results needs their values.
    // "What does multiple sclerosis mean?" is answerable from general knowledge;
    // refusing it sent a patient away with nothing.
    const needsOwnData = /(ჩემი|ჩემს)\s+(ანალიზ|კვლევ|შედეგ)|ანალიზ\S*\s+(პასუხ|შედეგ)|კვლევ\S*\s+პასუხ/.test(q);
    const p = parsed.data.patient;
    const suppliedInQuestion = /:\s*\S/.test(q.split('\n').slice(1).join('\n')) || /\d/.test(q.replace(/^[^:]*:/, ''));
    const suppliedInContext = Boolean(
      p && (p.problems.length || p.medications.length || p.labs.length || p.narrative.trim()),
    );
    if (needsOwnData && !suppliedInQuestion && !suppliedInContext) {
      return NextResponse.json(
        {
          error: 'NEEDS_PATIENT_DATA',
          messageKa:
            'ამ კითხვაზე პასუხისთვის თქვენი მონაცემები მჭირდება — ჩასვით კვლევის პასუხი, მედიკამენტების სია ან დიაგნოზი ისე, როგორც დასკვნაშია დაწერილი. გამოგონილ ციფრებს არ დაგიწერთ.',
        },
        { status: 422 },
      );
    }
  }

  if (!parsed.data.question.trim() && !parsed.data.patient?.narrative?.trim()) {
    return NextResponse.json({ error: 'INSUFFICIENT_INPUT', messageKa: 'კლინიკური კითხვა ან ქეისის აღწერა აუცილებელია ანალიზის დასაწყებად.' }, { status: 400 });
  }

  // The basis for sending health data to the AI provider is enforced here, by
  // the data in the request — not by the screen it came from (audit F07):
  // patient mode needs the subject's consent; any other mode carrying
  // patient-specific data needs the professional attestation.
  const basis = checkProcessingBasis(req, {
    mode: parsed.data.mode ?? 'quick',
    patientData: hasPatientData({ question: parsed.data.question, patient: parsed.data.patient, extras: parsed.data.extras, texts: [parsed.data.plan ?? ''] }),
  });
  if (!basis.ok) {
    return NextResponse.json({ error: basis.error, requiredVersion: basis.requiredVersion, messageKa: basis.messageKa }, { status: basis.status });
  }

  // The visitor may attach their own provider key, in which case the work is
  // billed to them and the operator's daily budget does not apply.
  const callerKey = callerKeyFrom(req);
  const ownKey = Boolean(callerKey && isPlausibleKey(callerKey));

  const verdict = checkLimit(req, { ownKey });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', reason: verdict.reason, messageKa: verdict.messageKa },
      { status: 429, headers: { 'retry-after': String(verdict.retryAfterSec) } },
    );
  }

  try {
    // The medication session comes only from the httpOnly cookie.
    const result = await orchestrate({ ...parsed.data, callerKey, medSession: sessionFrom(req) });
    // Only the operator's own spend counts against the operator's cap.
    if (!ownKey) recordSpend(Number(result?.usage?.estimatedCostUsd ?? 0));
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    const status = (e as { status?: number } | null)?.status;
    const code = (e as { code?: string } | null)?.code ?? '';

    // The operator's provider budget is a configured ceiling, not a fault: when
    // it trips the visitor must be told the service is paused for the month and
    // that their own key bypasses it — not shown a generic failure.
    const spendLimited =
      code.includes('spend_limit') ||
      /spend limit|quota|insufficient_quota|billing_hard_limit/i.test(message);
    const creditsOut = /credit_balance_exhausted|insufficient credit/i.test(message) || code === 'credit_balance_exhausted';

    if (spendLimited || creditsOut) {
      return NextResponse.json(
        {
          error: 'BUDGET_EXHAUSTED',
          messageKa:
            'სერვისის ყოველთვიური უფასო ბიუჯეტი ამოიწურა. დეტერმინისტული მოდულები — კალკულატორები, წამლების შემოწმება, ლაბორატორია, მტკიცებულების ძიება — კვლავ მუშაობს. AI პასუხებისთვის მიამაგრეთ თქვენი საკუთარი API გასაღები პარამეტრებში, ან დაელოდეთ ბიუჯეტის განახლებას.',
          detail: code || message,
        },
        { status: 503 },
      );
    }

    const aiDown =
      status === 429 ||
      status === 503 ||
      message.startsWith('AI_PROVIDER_HTTP') ||
      message.includes('fetch');

    return NextResponse.json(
      {
        error: aiDown ? 'AI_UNAVAILABLE' : 'ORCHESTRATION_FAILED',
        messageKa: aiDown
          ? 'AI პროვაიდერი ამჟამად მიუწვდომელია. დეტერმინისტული მოდულები (კალკულატორები, მედიკამენტების შეჯერება, ლაბორატორია, მტკიცებულების ძიება) კვლავ მუშაობს.'
          : 'ორკესტრაციის დროს მოხდა შეცდომა. კლინიკური დასკვნა არ არის გენერირებული — გთხოვთ, სცადოთ ხელახლა ან გამოიყენოთ ცალკეული მოდული.',
        detail: message,
      },
      { status: aiDown ? 503 : 500 },
    );
  }
}
