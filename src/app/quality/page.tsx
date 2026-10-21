import { QualityWorkspace } from '@/features/quality/quality-workspace';

export const metadata = { title: 'ხარისხი და პაციენტის უსაფრთხოება' };

export default function QualityPage() {
  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-fg">ხარისხი და პაციენტის უსაფრთხოება</h1>
        <p className="mt-1 text-sm text-slate-400">ეს მოდული ეყრდნობა ავტორის სახელმძღვანელოს „სამედიცინო დახმარების ხარისხის კრიტერიუმები და დეფექტების კლასიფიკაცია“. სისტემა ბრალეულობას არ ადგენს — იგი აფიქსირებს პოტენციურ გადახვევას და მის მტკიცებულებით საფუძველს.</p>
      </header>
      <QualityWorkspace />
    </div>
  );
}
