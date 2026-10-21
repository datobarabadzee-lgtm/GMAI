import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ClinicalTopic } from '@/features/clinical-v2/topic-view';
import catalog from '../../../../../public/clinical-v2/catalog.json';

const TOPICS = (catalog as { topics: { id: string; title: string }[] }).topics;

export function generateStaticParams() {
  return TOPICS.map((t) => ({ topic: t.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  const t = TOPICS.find((x) => x.id === topic);
  return { title: t ? `${t.title} — კლინიკური ცოდნა` : 'კლინიკური ცოდნა' };
}

export default async function ClinicalTopicPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  if (!TOPICS.some((t) => t.id === topic)) notFound();
  return (
    <Suspense fallback={null}>
      <ClinicalTopic topicId={topic} />
    </Suspense>
  );
}
