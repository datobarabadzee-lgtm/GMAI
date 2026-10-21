'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';

export function HeroCommand() {
  const [q, setQ] = useState('');
  const router = useRouter();

  const go = () => {
    const trimmed = q.trim();
    router.push(trimmed ? `/clinical?q=${encodeURIComponent(trimmed)}` : '/clinical');
  };

  return (
    <div className="panel p-4 sm:p-5">
      <label htmlFor="hero-q" className="label">
        კლინიკური ბრძანების ველი
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            id="hero-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') go();
            }}
            placeholder="დასვი კლინიკური კითხვა, აღწერე პაციენტი ან ატვირთე დოკუმენტი"
            className="field pl-9"
            autoComplete="off"
          />
        </div>
        <button type="button" onClick={go} className="btn btn-primary shrink-0">
          ანალიზის დაწყება <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        არ შეიყვანოთ პაციენტის პირდაპირი საიდენტიფიკაციო მონაცემები, თუ ეს აუცილებელი არ არის. ქეისი ინახება მხოლოდ ბრაუზერის სესიაში.
      </p>
    </div>
  );
}
