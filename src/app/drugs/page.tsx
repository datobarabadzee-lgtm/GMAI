import Link from 'next/link';
import { DrugWorkspace } from '@/features/drugs/drug-workspace';
import { EMA_INDEX_COUNTS as E, MEDICATION_INDEX_COUNTS as C } from '@/server/medications/counts';

export const metadata = { title: 'კურირებული მონოგრაფიები' };

export default function DrugsPage() {
  return (
    <div className="space-y-4">
      <header className="mx-auto max-w-6xl space-y-3">
        <Link href="/medications" className="block rounded-2xl border border-cyan/50 bg-cyan/10 p-4 transition hover:border-cyan">
          <p className="text-[15px] font-semibold text-fg">მედიკამენტების სრული ბაზა — ძიება →</p>
          <p className="mt-1 text-[13px] text-slate-300">
            {C.fda.toLocaleString('en-US')} FDA ჩანაწერი ({C.label.toLocaleString('en-US')} ინსტრუქცია, {C.ndc.toLocaleString('en-US')} პროდუქტი) · {E.authorisedWithPi.toLocaleString('en-US')} ევროპული ინსტრუქცია (EMA) · {C.mis.toLocaleString('en-US')} ქართული დასახელება (MIS კატალოგი)
          </p>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">კურირებული მონოგრაფიები</h1>
          <p className="mt-1 text-sm text-slate-400">ხელით შედგენილი, წყაროებით დასაბუთებული მონოგრაფიები დოზის კალკულაციით (თირკმელი, ასაკი, DOAC კრიტერიუმები) და ურთიერთქმედებებით. ეს ცალკე, მცირე ნაკრებია — სრული ბაზა ზემოთაა.</p>
        </div>
      </header>
      <DrugWorkspace />
    </div>
  );
}
