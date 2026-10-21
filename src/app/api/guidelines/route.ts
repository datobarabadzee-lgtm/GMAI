import { NextResponse } from 'next/server';
import { COMPARISON_TOPICS, GUIDELINE_BODIES, findComparisonTopics } from '@/knowledge/guidelines';
import { sourcesByIds } from '@/knowledge/sources';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const topics = q ? findComparisonTopics(q) : COMPARISON_TOPICS;
  return NextResponse.json({
    bodies: GUIDELINE_BODIES,
    topics,
    sources: sourcesByIds(GUIDELINE_BODIES.map((b) => b.sourceId)),
    messageKa: topics.length ? '' : 'ამ კითხვაზე შედარებადი გაიდლაინების ნაკრები რეესტრში ჯერ არ არის. დაამატეთ წყაროები ingestion მოდულით.',
  });
}
