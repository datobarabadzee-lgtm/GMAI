import { WifiOff } from 'lucide-react';

export const metadata = { title: 'კავშირი არ არის' };

export default function OfflinePage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-16 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-xl border border-line bg-ink-900">
        <WifiOff className="h-5 w-5 text-slate-400" />
      </span>
      <h1 className="text-lg font-semibold text-fg">ინტერნეტთან კავშირი არ არის</h1>
      <p className="text-sm leading-relaxed text-slate-400">
        კალკულატორები და ცოდნის ბიბლიოთეკა ხელმისაწვდომია ოფლაინაც, თუ ერთხელ მაინც გახსენით. AI-პასუხები საჭიროებს კავშირს.
      </p>
    </div>
  );
}
