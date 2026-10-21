import { DocumentWorkspace } from '@/features/docs/document-workspace';

export const metadata = { title: 'სამედიცინო დოკუმენტები' };

export default function DocumentsPage() {
  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-fg">სამედიცინო დოკუმენტები</h1>
        <p className="mt-1 text-sm text-slate-400">დოკუმენტის გენერაცია და ატვირთული ფაილების ანალიზი. ყოველი დოკუმენტი ძალაშია მხოლოდ პასუხისმგებელი ექიმის დადასტურებით.</p>
      </header>
      <DocumentWorkspace />
    </div>
  );
}
