import { UsageDashboard } from '@/features/admin/usage-dashboard';
import { ErrorState } from '@/components/ui/primitives';

// The dev-tools flag is an environment decision, read per request rather than at build time.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'AI გამოყენება და ხარჯები', robots: { index: false, follow: false } };

export default function UsagePage() {
  if (process.env.ENABLE_DEV_TOOLS !== '1') {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorState title="შიდა გვერდი გამორთულია" detail="ეს გვერდი ხელმისაწვდომია მხოლოდ ENABLE_DEV_TOOLS=1 რეჟიმში." />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-fg">AI გამოყენება და ხარჯები</h1>
        <p className="mt-1 text-sm text-slate-400">ყველა ციფრი მოდის რეალური გაშვებების ჟურნალიდან. სადემონსტრაციო მონაცემები არ გამოიყენება.</p>
      </header>
      <UsageDashboard />
    </div>
  );
}
