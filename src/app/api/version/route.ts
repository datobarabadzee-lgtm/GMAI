import { NextResponse } from 'next/server';
import { releaseSummary } from '@/server/release';
import { appTier } from '@/lib/tier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Which release is serving (non-secret). Compare with RELEASE_MANIFEST.json of a release folder. */
export async function GET() {
  return NextResponse.json({ ...releaseSummary(), tier: appTier(), node: process.version }, { headers: { 'cache-control': 'no-store' } });
}
