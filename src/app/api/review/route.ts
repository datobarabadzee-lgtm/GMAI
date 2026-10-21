import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ReviewError, authenticateReviewer, listReviews, submitReview } from '@/server/review/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Submit = z.object({ kind: z.enum(['answer', 'document']), title: z.string().min(1).max(200), runId: z.string().max(80).nullish(), content: z.unknown() });

function fail(e: unknown) {
  if (e instanceof ReviewError) return NextResponse.json({ error: e.code, messageKa: e.messageKa }, { status: e.status });
  return NextResponse.json({ error: 'REVIEW_STORE_ERROR', messageKa: 'განხილვის საცავთან მუშაობა ვერ მოხერხდა.' }, { status: 500 });
}

/** List (reviewers only). ?status=pending|assigned|approved|rejected&mine=1 */
export async function GET(req: Request) {
  const auth = authenticateReviewer(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error, messageKa: auth.messageKa }, { status: auth.status });
  const u = new URL(req.url);
  const status = (['pending', 'assigned', 'approved', 'rejected'] as const).find((s) => s === u.searchParams.get('status'));
  try {
    return NextResponse.json({ reviewer: auth.reviewer, items: listReviews({ status, assignee: u.searchParams.get('mine') === '1' ? auth.reviewer.name : undefined }) });
  } catch (e) {
    return fail(e);
  }
}

/** Submit an answer or document draft for review. */
export async function POST(req: Request) {
  const auth = authenticateReviewer(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error, messageKa: auth.messageKa }, { status: auth.status });
  const b = Submit.safeParse(await req.json().catch(() => null));
  if (!b.success || b.data.content === undefined) return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  try {
    return NextResponse.json({ item: submitReview(auth.reviewer, { kind: b.data.kind, title: b.data.title, runId: b.data.runId ?? null, content: b.data.content }) }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
