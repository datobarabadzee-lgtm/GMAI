import { LabWorkspace } from '@/features/labs/lab-workspace';

export const metadata = { title: 'ლაბორატორიული ინტელექტი' };

export default function LabsPage() {
  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-fg">ლაბორატორიული ინტელექტი</h1>
        <p className="mt-1 text-sm text-slate-400">პათოლოგიური მნიშვნელობები, პატერნები, დინამიკა, კრიტიკული შედეგები და წამლისმიერი ცვლილებები.</p>
      </header>
      <LabWorkspace />
    </div>
  );
}
