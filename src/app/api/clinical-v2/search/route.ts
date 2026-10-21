import { NextResponse } from 'next/server';
import { clinicalV2Search } from '@/kb/clinical-v2-search';
import { CLINICAL_V2_PACKAGE, type ClinicalSetting, type ClinicalType } from '@/knowledge/clinical-v2';
import catalog from '../../../../../public/clinical-v2/catalog.json';

/**
 * Search over collection gmai_clinical_v2 for the student page.
 * GET /api/clinical-v2/search?q=…&setting=emergency|intensive_care&type=dosing&topic=<id>&category=<id>&limit=30
 *
 * Lexical hybrid (BM25 over stems + Georgian/English lexicon + hash vectors).
 * Semantic embeddings are not enabled; the response says so.
 */
export const runtime = 'nodejs';

const SETTINGS = new Set(['emergency', 'intensive_care']);
const TYPES = new Set(['assessment', 'criteria', 'management', 'dosing', 'safety', 'clinical_context']);
const TOPIC_CATEGORY = new Map((catalog as { topics: { id: string; category: string }[] }).topics.map((t) => [t.id, t.category]));

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 300);
  const setting = url.searchParams.get('setting') ?? '';
  const type = url.searchParams.get('type') ?? '';
  const topic = url.searchParams.get('topic') ?? '';
  const category = url.searchParams.get('category') ?? '';
  const limit = Math.min(60, Math.max(1, Number(url.searchParams.get('limit')) || 30));

  if (q.length < 2) return NextResponse.json({ error: 'QUERY_TOO_SHORT', messageKa: 'ჩაწერეთ მინიმუმ 2 სიმბოლო.' }, { status: 400 });
  if (setting && !SETTINGS.has(setting)) return NextResponse.json({ error: 'BAD_SETTING' }, { status: 400 });
  if (type && !TYPES.has(type)) return NextResponse.json({ error: 'BAD_TYPE' }, { status: 400 });

  try {
    // Category is a catalog property of the topic; search wide, then filter.
    const { hits, trace } = await clinicalV2Search(q, {
      setting: (setting || undefined) as ClinicalSetting | undefined,
      clinicalType: (type || undefined) as ClinicalType | undefined,
      topicId: topic || undefined,
      limit: category ? 200 : limit,
    });
    const results = hits
      .filter((h) => !category || TOPIC_CATEGORY.get(h.topic_id) === category)
      .filter((h) => h.score.termCoverage > 0 || h.score.domainMatch > 0)
      .slice(0, limit)
      .map((h) => ({
        id: h.rule_id,
        href: h.href,
        topicId: h.topic_id,
        topicTitle: h.topic_title,
        sectionId: h.section_id,
        sectionTitle: h.section_title,
        unitTitle: h.unit_title,
        setting: h.setting,
        types: h.clinical_types,
        snippet: h.snippet,
        hasMedia: h.has_media,
        score: h.score.final,
      }));
    return NextResponse.json(
      {
        collection: 'gmai_clinical_v2',
        package: CLINICAL_V2_PACKAGE,
        query: q,
        count: results.length,
        results,
        search: { method: 'lexical_hybrid', semantic: false, labelKa: trace.embedding.labelKa, tookMs: trace.tookMs },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json({ error: 'SEARCH_FAILED', messageKa: 'ძიება ვერ შესრულდა.', detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
