import { CalculatorWorkspace } from '@/features/calc/calculator-workspace';

export const metadata = { title: 'კლინიკური კალკულატორები' };

export default function CalculatorsPage() {
  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-fg">კლინიკური კალკულატორები</h1>
        <p className="mt-1 text-sm text-slate-400">ყველა გამოთვლა სრულდება დეტერმინისტული კოდით. LLM არითმეტიკა არ გამოიყენება.</p>
      </header>
      <CalculatorWorkspace />
    </div>
  );
}
