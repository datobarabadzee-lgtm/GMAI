import { DdxWorkspace } from '@/features/clinical/ddx-workspace';

export const metadata = { title: 'დიფერენციული დიაგნოზი' };

export default function DdxPage() {
  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-fg">დიფერენციული დიაგნოზი</h1>
        <p className="mt-1 text-sm text-slate-400">DDx არ არის დაავადებების სია: თითოეულ ვარიანტს ახლავს მხარდამჭერი და საწინააღმდეგო ნიშნები, დიფერენცირებადი კვლევა და გადაუდებლობა.</p>
      </header>
      <DdxWorkspace />
    </div>
  );
}
