import { NextResponse } from 'next/server';
import { checkLimit } from '@/services/rate-limit';
import { z } from 'zod';
import { EVIDENCE_TIER_KA, LiteratureError, citationText, searchLiterature } from '@/services/literature';

export const runtime = 'nodejs';
export const maxDuration = 30;

const Body = z.object({
  text: z.string().trim().default(''),
  pico: z
    .object({ p: z.string().optional(), i: z.string().optional(), c: z.string().optional(), o: z.string().optional() })
    .optional(),
  limit: z.number().int().min(1).max(50).optional(),
  fromYear: z.number().int().min(1990).max(2100).optional(),
  tiers: z.array(z.enum(['guideline', 'systematic_review', 'rct', 'cohort_or_other', 'preprint'])).optional(),
  openAccessOnly: z.boolean().optional(),
});

export async function POST(req: Request) {
  // These call free upstream APIs, but an open endpoint is still ours to
  // protect: unthrottled use would get the platform blocked by the upstream.
  const limited = await checkLimit(req);
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', messageKa: limited.messageKa },
      { status: 429, headers: { 'retry-after': String(limited.retryAfterSec) } },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'BAD_REQUEST', messageKa: 'ძიების პარამეტრები არასწორია.' }, { status: 400 });
  }

  const hasTerms =
    parsed.data.text.trim().length > 2 ||
    Object.values(parsed.data.pico ?? {}).some((v) => (v ?? '').trim().length > 2);

  if (!hasTerms) {
    return NextResponse.json(
      { error: 'NEEDS_QUERY', messageKa: 'ძიებისთვის მიუთითეთ კითხვა ან შეავსეთ PICO-ს სულ მცირე ერთი ელემენტი.' },
      { status: 422 },
    );
  }

  try {
    const result = await searchLiterature(parsed.data);
    return NextResponse.json({
      query: result.query,
      hitCount: result.hitCount,
      tierCounts: result.tierCounts,
      tierLabelsKa: EVIDENCE_TIER_KA,
      citations: result.citations.map((c) => ({ ...c, citationText: citationText(c) })),
      providerKa: 'Europe PMC — ღია წვდომის სამედიცინო ლიტერატურა (PubMed/MEDLINE, PMC, პრეპრინტები)',
      messageKa: result.citations.length
        ? ''
        : 'ამ ფორმულირებით ღია წვდომის პუბლიკაცია ვერ მოიძებნა. სცადეთ უფრო ზოგადი ტერმინები ან მოხსენით ღია წვდომის ფილტრი.',
    });
  } catch (err) {
    const detail = err instanceof LiteratureError ? err.message : 'upstream unavailable';
    return NextResponse.json(
      { error: 'UPSTREAM_UNAVAILABLE', detail, messageKa: 'ლიტერატურის ბაზასთან კავშირი ვერ დამყარდა. სცადეთ ხელახლა.' },
      { status: 503 },
    );
  }
}
