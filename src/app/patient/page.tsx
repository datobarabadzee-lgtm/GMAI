import { PatientWorkspace } from '@/features/clinical/patient-workspace';
import { ConsentGate } from '@/features/settings/consent-gate';

export const metadata = { title: 'AI-ს კითხვა' };

export default function PatientPage() {
  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold tracking-tight text-fg">AI-ს კითხვა</h1>
        <p className="mt-1 text-sm text-slate-400">დაწერეთ თქვენი სიტყვებით — პასუხი ქართულად, გასაგებ ენაზე. სერვისი არ სვამს დიაგნოზს და არ ნიშნავს წამალს.</p>
      </header>
      <ConsentGate>
        <PatientWorkspace />
      </ConsentGate>
    </div>
  );
}
