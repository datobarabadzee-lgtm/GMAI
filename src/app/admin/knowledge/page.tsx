import { KnowledgeHealth } from '@/features/admin/knowledge-health';
import { ErrorState } from '@/components/ui/primitives';

// The dev-tools flag is an environment decision, read per request rather than at build time.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'ცოდნის ბაზის მდგომარეობა', robots: { index: false, follow: false } };

export default function KnowledgeHealthPage() {
  if (process.env.ENABLE_DEV_TOOLS !== '1') {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorState title="შიდა გვერდი გამორთულია" detail="ეს გვერდი ხელმისაწვდომია მხოლოდ ENABLE_DEV_TOOLS=1 რეჟიმში და საჯარო ნავიგაციაში არ ჩანს." />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-fg">ცოდნის ბაზის მდგომარეობა</h1>
        <p className="mt-1 text-sm text-slate-400">ყველა მაჩვენებელი იკითხება რეალური ბაზიდან. ეს გვერდი შიდაა და საჯარო ნავიგაციაში არ ჩანს.</p>
      </header>
      <KnowledgeHealth />
    </div>
  );
}
