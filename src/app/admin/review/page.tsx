import { appTier } from '@/lib/tier';
import { ReviewWorkspace } from '@/features/admin/review-workspace';
import { ErrorState } from '@/components/ui/primitives';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ადამიანური განხილვა', robots: { index: false, follow: false } };

export default function ReviewPage() {
  if (appTier() !== 'internal') {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorState title="განხილვის სამუშაო პროცესი შიდა ვერსიაშია" detail="საჯარო ვერსიაში „საჭიროებს ადამიანის განხილვას“ მხოლოდ გაფრთხილებაა: რეცენზენტი არ ინიშნება და დამტკიცება არ ხდება." />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-fg">ადამიანური განხილვა</h1>
        <p className="mt-1 text-sm text-slate-400">მინიჭება, დამტკიცება/უარყოფა (ოთხი თვალის პრინციპით), ვერსიები და შეუცვლელი ჟურნალი. მოქმედების ავტორი განისაზღვრება რეცენზენტის გასაღებით.</p>
      </header>
      <ReviewWorkspace />
    </div>
  );
}
