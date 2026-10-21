import { Suspense } from 'react';
import { CaseWorkspace } from '@/features/case/case-workspace';
import { Panel, Skeleton } from '@/components/ui/primitives';

export const metadata = { title: 'ქეისის სამუშაო სივრცე' };

export default function CasePage() {
  return (
    <Suspense
      fallback={
        <Panel title="ქეისის სამუშაო სივრცე">
          <Skeleton lines={6} />
        </Panel>
      }
    >
      <CaseWorkspace />
    </Suspense>
  );
}
