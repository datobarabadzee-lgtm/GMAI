import { Suspense } from 'react';
import { shareMeta } from '@/lib/site';
import { PreventionApp } from '@/features/prevention/prevention-app';

export const metadata = {
  ...shareMeta('ჩემი პრევენციის გეგმა — ლიდერმედი', 'პირადი პრევენციის გეგმა 2 წუთში: რა კვლევა და ვაქცინა გჭირდებათ, როდის და რატომ. 7 რისკის სიმულატორი და კალენდარი შეხსენებებით.', '/og/og-prevention.png'),
  title: 'ჩემი პრევენცია',
  description: 'პირადი პრევენციის გეგმა 2 წუთში: რა კვლევა და ვაქცინა გჭირდებათ, როდის და რატომ — და რაზე არ ღირს ფულის დახარჯვა.',
};

export default function PreventionPage() {
  return (
    <Suspense fallback={null}>
      <PreventionApp />
    </Suspense>
  );
}
