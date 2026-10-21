import { NextResponse } from 'next/server';
import { checkLimit } from '@/services/rate-limit';
import { EVIDENCE_TIER_KA, citationText, searchDrugEvidence } from '@/services/literature';
import { LOW_VALUE_BY_ID } from '@/knowledge/low-value-meds';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** Live evidence for one agent, on demand from the registry UI. */
export async function GET(req: Request) {
  // These call free upstream APIs, but an open endpoint is still ours to
  // protect: unthrottled use would get the platform blocked by the upstream.
  const limited = checkLimit(req);
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', messageKa: limited.messageKa },
      { status: 429, headers: { 'retry-after': String(limited.retryAfterSec) } },
    );
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const term = id ? LOW_VALUE_BY_ID.get(id)?.evidenceTerm : url.searchParams.get('term');

  if (!term || term.length < 3) {
    return NextResponse.json({ error: 'NEEDS_TERM', messageKa: 'მიუთითეთ პრეპარატის დასახელება.' }, { status: 422 });
  }

  try {
    const res = await searchDrugEvidence(term, 6);
    return NextResponse.json({
      term,
      hitCount: res.hitCount,
      tierLabelsKa: EVIDENCE_TIER_KA,
      citations: res.citations.map((c) => ({ ...c, citationText: citationText(c) })),
      providerKa: 'Europe PMC — ძიება შეზღუდულია სათაურითა და საკვანძო სიტყვებით, რომ შედეგი ეხებოდეს ამ პრეპარატს და არა მხოლოდ დაავადებას.',
      messageKa: res.citations.length ? '' : 'ამ პრეპარატზე სათაურში მოხსენიებული პუბლიკაცია ვერ მოიძებნა — ეს თავისთავად მნიშვნელოვანი დასკვნაა.',
    });
  } catch {
    return NextResponse.json({ error: 'UPSTREAM_UNAVAILABLE', messageKa: 'ლიტერატურის ბაზასთან კავშირი ვერ დამყარდა.' }, { status: 503 });
  }
}
