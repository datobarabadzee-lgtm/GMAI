import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ReviewError, act, authenticateReviewer, getReview } from '@/server/review/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Act = z.object({
  action: z.enum(['assign', 'approve', 'reject', 'revise', 'comment']),
  note: z.string().max(2000).optional(),
  assignee: z.string().max(120).optional(),
  content: z.unknown().optional(),
  expectedVersion: z.number().int().positive().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const auth = authenticateReviewer(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error, messageKa: auth.messageKa }, { status: auth.status });
  const r = getReview((await params).id);
  return r ? NextResponse.json(r) : NextResponse.json({ error: 'NOT_FOUND', messageKa: 'ჩანაწერი ვერ მოიძებნა.' }, { status: 404 });
}

export async function POST(req: Request, { params }: Ctx) {
  const auth = authenticateReviewer(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error, messageKa: auth.messageKa }, { status: auth.status });
  const b = Act.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  try {
    return NextResponse.json(act(auth.reviewer, (await params).id, b.data.action, b.data));
  } catch (e) {
    if (e instanceof ReviewError) return NextResponse.json({ error: e.code, messageKa: e.messageKa }, { status: e.status });
    return NextResponse.json({ error: 'REVIEW_STORE_ERROR', messageKa: 'განხილვის საცავთან მუშაობა ვერ მოხერხდა.' }, { status: 500 });
  }
}
