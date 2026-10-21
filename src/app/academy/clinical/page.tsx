import { Suspense } from 'react';
import { ClinicalLibrary } from '@/features/clinical-v2/library';

export const metadata = { title: 'კლინიკური ცოდნა — აკადემია' };

export default function ClinicalKnowledgePage() {
  return (
    <Suspense fallback={null}>
      <ClinicalLibrary />
    </Suspense>
  );
}
