import { appTier } from '@/lib/tier';
import { RetrievalDebugger } from '@/features/admin/retrieval-debugger';
import { ErrorState } from '@/components/ui/primitives';

// The dev-tools flag is an environment decision, read per request rather than at build time.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'ძიების დიაგნოსტიკა', robots: { index: false, follow: false } };

export default function RetrievalDebugPage() {
  if (process.env.ENABLE_DEV_TOOLS !== '1' || appTier() !== 'internal') {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorState title="შიდა გვერდი გამორთულია" detail="ეს გვერდი ხელმისაწვდომია მხოლოდ ENABLE_DEV_TOOLS=1 რეჟიმში და საჯაროდ არ ქვეყნდება." />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-fg">ძიების დიაგნოსტიკა</h1>
        <p className="mt-1 text-sm text-slate-400">ჰიბრიდული მოძიების სრული კვალი: ნორმალიზაცია, ლექსიკური და ვექტორული კანდიდატები (ვექტორი სემანტიკურია მხოლოდ ნასწავლი ემბედინგ-პროვაიდერით; hash = ლექსიკური n-gram), გაერთიანება, რერანკინგი და საბოლოო შერჩევა.</p>
      </header>
      <RetrievalDebugger />
    </div>
  );
}
