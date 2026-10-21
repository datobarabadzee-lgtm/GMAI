import Link from 'next/link';
import { Lock } from 'lucide-react';

export const metadata = { title: 'მოდული მიუწვდომელია' };

export default function UnavailablePage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-16 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-xl border border-line bg-ink-900">
        <Lock className="h-5 w-5 text-slate-400" />
      </span>
      <h1 className="text-lg font-semibold text-fg">ეს გვერდი საჯარო ვერსიაში არ არის</h1>
      <p className="text-sm leading-relaxed text-slate-400">
        საჯარო ვერსიაში დახურულია მხოლოდ ოპერატორის ხელსაწყოები (/admin, /dev): ისინი შიდა ცოდნის ბაზის, ხარჯის ჟურნალისა და
        კურაციის სამართავადაა და მუშაობს მხოლოდ დაწესებულების შიდა ვერსიაში, ოპერატორის ავთენტიფიკაციით. კლინიკური მსჯელობა,
        მედიკამენტები, ლაბორატორია, ხარისხისა და დეფექტების ანალიზი, აკადემია და კალკულატორები საჯარო ვერსიაშიც მუშაობს.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn btn-primary text-xs">მთავარზე დაბრუნება</Link>
        <Link href="/patient" className="btn text-xs">პაციენტის AI</Link>
        <Link href="/calculators" className="btn text-xs">კალკულატორები</Link>
      </div>
    </div>
  );
}
