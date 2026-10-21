import { LibraryWorkspace } from '@/features/evidence/library-workspace';
import { SOURCES } from '@/knowledge/sources';

export const metadata = { title: 'ცოდნის ბიბლიოთეკა' };

export default function LibraryPage() {
  const items = SOURCES.map((s) => {
    const publicFullText = s.fulltext_public && (s.rights_status === 'OPEN' || s.rights_status === 'PUBLIC_DOMAIN');
    return {
      ...s,
      excerpt: publicFullText ? s.excerpt : '',
      restrictedNoteKa: publicFullText ? '' : 'ამ წყაროს სრული ტექსტი საჯაროდ არ ქვეყნდება უფლებრივი სტატუსის გამო; ხელმისაწვდომია მეტამონაცემები და ციტირება.',
    };
  });

  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-fg">ცოდნის ბიბლიოთეკა</h1>
        <p className="mt-1 text-sm text-slate-400">Source Registry-ის საჯარო ხედი უფლებრივი სტატუსით, სიახლის მდგომარეობითა და ციტირებით.</p>
      </header>
      <LibraryWorkspace items={items} />
    </div>
  );
}
