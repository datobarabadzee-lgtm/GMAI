import { appTier } from '@/lib/tier';
import { checkOperator } from '@/server/operator-auth';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { RightsStatusSchema, SourceTypeSchema, EVIDENCE_RANK } from '@/schemas/evidence';
import { SOURCES } from '@/knowledge/sources';
import { tokenize } from '@/services/retrieval';

export const runtime = 'nodejs';

const devEnabled = () => process.env.ENABLE_DEV_TOOLS === '1' && appTier() === 'internal';

const IngestSchema = z.object({
  title: z.string().min(3),
  publisher: z.string().min(2),
  year: z.number().int().min(1800).max(2100),
  source_type: SourceTypeSchema,
  specialty: z.array(z.string()).default([]),
  jurisdiction: z.enum(['international', 'us', 'eu', 'uk', 'georgia', 'who', 'other']).default('international'),
  rights_status: RightsStatusSchema,
  version: z.string().default('1'),
  url: z.string().default(''),
  citation_text: z.string().min(5),
  key_finding: z.string().default(''),
  text: z.string().default(''),
});

/** Chunking strategy used by the ingestion pipeline (vector-index ready). */
function chunk(text: string, size = 900, overlap = 120): string[] {
  if (!text.trim()) return [];
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    out.push(text.slice(i, i + size));
    i += size - overlap;
  }
  return out;
}

export async function GET() {
  if (!devEnabled()) return NextResponse.json({ error: 'DISABLED', messageKa: 'დეველოპერული ინსტრუმენტები გამორთულია. ჩართეთ ENABLE_DEV_TOOLS=1.' }, { status: 404 });
  return NextResponse.json({ total: SOURCES.length, sources: SOURCES.map((s) => ({ source_id: s.source_id, title: s.title, rights_status: s.rights_status, freshness: s.freshness })) });
}

export async function POST(req: Request) {
  if (!devEnabled()) return NextResponse.json({ error: 'DISABLED', messageKa: 'დეველოპერული ინსტრუმენტები გამორთულია. ჩართეთ ENABLE_DEV_TOOLS=1.' }, { status: 404 });
  // An environment flag is not authorisation (audit F18).
  const auth = checkOperator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error, messageKa: auth.messageKa }, { status: auth.status });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }
  const parsed = IngestSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'VALIDATION_FAILED', issues: parsed.error.issues }, { status: 422 });

  const d = parsed.data;
  const chunks = chunk(d.text);
  const keywords = [...new Set(tokenize(`${d.title} ${d.key_finding}`))].slice(0, 20);
  const record = {
    source_id: `SRC-${d.publisher.replace(/\W+/g, '').slice(0, 8).toUpperCase()}-${d.year}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    ...d,
    publication_date: '',
    last_checked: new Date().toISOString().slice(0, 10),
    evidence_rank: EVIDENCE_RANK[d.source_type],
    freshness: 'review_due' as const,
    is_current: true,
    superseded_by: null,
    population: '',
    applicability: '',
    keywords,
    fulltext_public: d.rights_status === 'OPEN' || d.rights_status === 'PUBLIC_DOMAIN',
    excerpt: '',
  };

  return NextResponse.json({
    ok: true,
    record,
    chunks: chunks.length,
    chunkPreview: chunks.slice(0, 2),
    noteKa:
      'ჩანაწერი ვალიდირებულია და მომზადებულია ინდექსაციისთვის. ამ ვერსიაში corpus არის კოდის ნაწილი (src/knowledge/sources.ts) — ჩანაწერის დასამატებლად დააკოპირეთ დაბრუნებული ობიექტი რეესტრში ან ჩართეთ DATABASE_URL და გამოიყენეთ Drizzle სქემა.',
  });
}
