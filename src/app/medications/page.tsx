import { Suspense } from 'react';
import { MedicationSearch } from '@/features/meds/medication-search';
import { EMA_INDEX_COUNTS, MEDICATION_INDEX_COUNTS } from '@/server/medications/counts';

export const metadata = { title: 'მედიკამენტის ძიება' };

export default function MedicationsPage() {
  return (
    <Suspense fallback={null}>
      <MedicationSearch counts={MEDICATION_INDEX_COUNTS} ema={EMA_INDEX_COUNTS} />
    </Suspense>
  );
}
