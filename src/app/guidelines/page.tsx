import { GuidelineComparator } from '@/features/evidence/guideline-comparator';
import { COMPARISON_TOPICS, GUIDELINE_BODIES } from '@/knowledge/guidelines';
import { sourcesByIds } from '@/knowledge/sources';

export const metadata = { title: 'გაიდლაინების შედარება' };

export default function GuidelinesPage() {
  const sources = sourcesByIds(GUIDELINE_BODIES.map((b) => b.sourceId));
  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-fg">გაიდლაინების შედარება</h1>
        <p className="mt-1 text-sm text-slate-400">როცა ავტორიტეტული ორგანიზაციები განსხვავებულ რეკომენდაციას იძლევიან, სისტემა არ ქმნის უხილავ „საშუალო პასუხს“ — იგი აჩვენებს კონსენსუსს, განსხვავებას და მის მიზეზს.</p>
      </header>
      <GuidelineComparator bodies={GUIDELINE_BODIES} topics={COMPARISON_TOPICS} sources={sources} />
    </div>
  );
}
