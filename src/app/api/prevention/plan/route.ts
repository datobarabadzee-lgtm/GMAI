import { NextResponse } from 'next/server';
import { buildPlan } from '@/prevention/engine';
import { PlanRequestSchema } from '@/prevention/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deterministic prevention plan. No model is called and nothing is stored:
 * the answer depends only on the body and the date.
 */
export async function POST(req: Request) {
  const body = PlanRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: 'VALIDATION_FAILED', messageKa: 'მონაცემები არასწორ ფორმატშია.' }, { status: 422 });
  }
  const today = body.data.today ?? new Date().toISOString().slice(0, 10);
  return NextResponse.json(buildPlan(body.data.input, today), { headers: { 'cache-control': 'no-store' } });
}
