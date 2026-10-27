import { Suspense } from 'react';
import { shareMeta } from '@/lib/site';
import { ReproductiveApp } from '@/features/reproductive/reproductive-app';

export const metadata = {
  ...shareMeta('ორსულობა და ნაყოფიერება — ლიდერმედი', 'მშობიარობის თარიღი, ორსულობის კალენდარი შეხსენებებით, ოვულაციის დღეები და ორსულობის შანსი — ოფიციალური გაიდლაინებით.', '/og/og-reproductive.png'),
  title: 'ორსულობა და ნაყოფიერება',
  description: 'მშობიარობის თარიღი, ორსულობის კალენდარი შეხსენებებით, ოვულაციის დღეები და ორსულობის შანსი — ოფიციალური გაიდლაინებით.',
};

export default function ReproductivePage() {
  return (
    <Suspense fallback={null}>
      <ReproductiveApp />
    </Suspense>
  );
}
