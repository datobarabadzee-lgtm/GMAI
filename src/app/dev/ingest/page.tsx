import { IngestWorkspace } from '@/features/evidence/ingest-workspace';

// The dev-tools flag is an environment decision, read per request rather than at build time.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'წყაროების იმპორტი (შიდა)', robots: { index: false, follow: false } };

export default function IngestPage() {
  const enabled = process.env.ENABLE_DEV_TOOLS === '1';
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-fg">წყაროების იმპორტი — შიდა ინსტრუმენტი</h1>
        <p className="mt-1 text-sm text-slate-400">ეს გვერდი არ არის საჯარო ნავიგაციაში. იგი ემსახურება rights-aware ingestion pipeline-ს: მეტამონაცემები → ვალიდაცია → chunking → ინდექსაცია.</p>
      </header>
      <IngestWorkspace enabled={enabled} />
    </div>
  );
}
