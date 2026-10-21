import { ResearchWorkspace } from '@/features/research/research-workspace';

export const metadata = { title: 'კვლევის AI' };

export default function ResearchPage() {
  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-fg">კვლევის AI</h1>
        <p className="mt-1 text-sm text-slate-400">კვლევითი კითხვიდან ხელნაწერამდე — სტრუქტურირებული სამუშაო სივრცე გამოგონილი ციტირების გარეშე.</p>
      </header>
      <ResearchWorkspace />
    </div>
  );
}
