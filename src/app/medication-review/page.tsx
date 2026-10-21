import { MedicationReviewWorkspace } from '@/features/meds/medication-review';

export const metadata = { title: 'წამლების შემოწმება' };

export default function MedicationReviewPage() {
  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-fg">წამლების შემოწმება</h1>
      </header>
      <MedicationReviewWorkspace />
    </div>
  );
}
