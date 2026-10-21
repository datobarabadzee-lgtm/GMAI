import { EvidenceWorkspace } from '@/features/evidence/evidence-workspace';

export const metadata = { title: 'მტკიცებულების ძრავა' };

export default function EvidencePage() {
  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-fg">მტკიცებულების ძრავა</h1>
        <p className="mt-1 text-sm text-slate-400">მტკიცებულების იერარქია, სიახლის სტატუსი და უფლებრივი მდგომარეობა ყოველ ჩანაწერზე.</p>
      </header>
      <EvidenceWorkspace />
    </div>
  );
}
