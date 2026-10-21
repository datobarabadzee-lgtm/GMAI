import { Suspense } from 'react';
import { ClinicalWorkspace } from '@/features/clinical/workspace';
import { Skeleton, Panel } from '@/components/ui/primitives';

export const metadata = { title: 'კლინიკური AI — Georgian Expert Medical AI' };

export default function ClinicalPage() {
  return (
    <Suspense
      fallback={
        <Panel title="კლინიკური AI">
          <Skeleton lines={6} />
        </Panel>
      }
    >
      <ClinicalWorkspace />
    </Suspense>
  );
}
