import { DefectWorkspace } from '@/features/quality/defect-workspace';

export const metadata = { title: 'სამედიცინო დეფექტების ანალიზი' };

export default function DefectPage() {
  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-fg">სამედიცინო დეფექტების ანალიზი</h1>
        <p className="mt-1 text-sm text-slate-400">მოდული მუშაობს ნეიტრალურად ექიმის, პაციენტის, კლინიკისა და მარეგულირებლისთვის. სისტემა მხარეს არ ირჩევს და სამართლებრივ კვალიფიკაციას არ ადგენს.</p>
      </header>
      <DefectWorkspace />
    </div>
  );
}
