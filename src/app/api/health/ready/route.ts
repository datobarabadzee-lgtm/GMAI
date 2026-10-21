import { NextResponse } from 'next/server';
import { readiness } from '@/server/readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Readiness: 200 when this release can serve, 503 with the failing checks otherwise. ?probe=1 adds cached reachability probes. */
export async function GET(req: Request) {
  const r = await readiness({ probe: new URL(req.url).searchParams.get('probe') === '1' });
  return NextResponse.json(r, { status: r.ready ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
