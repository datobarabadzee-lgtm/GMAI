import { Suspense } from 'react';
import { AcademyWorkspace } from '@/features/academy/academy-workspace';

export const metadata = { title: 'სამედიცინო აკადემია' };

export default function AcademyPage() {
  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-fg">სამედიცინო აკადემია</h1>
        <p className="mt-1 text-sm text-slate-400">დონეზე მორგებული სწავლება: ახსნა, ნაბიჯ-ნაბიჯ, სოკრატული რეჟიმი, ქეისები, ქვიზი, ფლეშქარდები, ზეპირი გამოცდა, OSCE და Journal Club.</p>
      </header>
      <Suspense fallback={null}>
        <AcademyWorkspace />
      </Suspense>
    </div>
  );
}
