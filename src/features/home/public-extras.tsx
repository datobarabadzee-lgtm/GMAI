import Link from 'next/link';
import { ShieldAlert, Share, Quote, Languages, Lock, HeartPulse } from 'lucide-react';
import { Panel } from '@/components/ui/primitives';
import { WhatsAppIcon } from '@/components/layout/whatsapp-button';
import { CONTACT_INTRO_KA, WHATSAPP_DISPLAY, whatsappLink } from '@/lib/contact';

/**
 * Shown on the public deployment only. The internal deployment is used by
 * clinicians who do not need the patient-safety framing or install steps.
 */
export function SafetyBanner() {
  return (
    <div className="rounded-xl border border-clinical-high/35 bg-clinical-high/5 p-4">
      <div className="flex gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-clinical-high" />
        <div className="space-y-1.5">
          <p className="text-[13px] font-semibold text-slate-100">ეს სერვისი არ ცვლის ექიმს</p>
          <p className="text-xs leading-relaxed text-slate-400">
            სისტემა განმარტავს, ითვლის და მიუთითებს წყაროს, მაგრამ არ სვამს დიაგნოზს და არ ანიშნავს მკურნალობას.
            მკვეთრი ტკივილი გულმკერდში, სუნთქვის გაძნელება, მეტყველების ან სახის ასიმეტრია, ცნობიერების დაკარგვა,
            ძლიერი სისხლდენა ან ჩვილის მაღალი ცხელება — დაუყოვნებლივ დარეკეთ{' '}
            <span className="font-semibold text-slate-200">112</span>.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href="/patient" className="btn text-xs">
              <HeartPulse className="h-3.5 w-3.5" /> პაციენტის რეჟიმი
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

const PRINCIPLES = [
  { icon: Quote, titleKa: 'ყოველი მტკიცება წყაროთი', bodyKa: 'პასუხი მიუთითებს კონკრეტულ გაიდლაინს ან კვლევას. თუ წყარო არ არსებობს, სისტემა ამბობს რომ არ იცის — ციტატას არ იგონებს.' },
  { icon: Lock, titleKa: 'თქვენი მონაცემები არ ინახება', bodyKa: 'შეყვანილი ტექსტი და ატვირთული ფაილი რჩება ბრაუზერის სესიაში; სერვერზე არ იწერება.' },
  { icon: Languages, titleKa: 'ქართულად, უფასოდ', bodyKa: 'სამედიცინო ცოდნაზე წვდომა არ უნდა იყოს ფინანსური პრივილეგია. ეს ვერსია ყველასთვის ღიაა.' },
];

export function PublicExtras() {
  return (
    <>
      <Panel title="დაუსვით კითხვა ექიმს" subtitle="ცოცხალი ადამიანი, არა ავტომატური პასუხი">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#25D366]/15 text-[#25D366]">
            <WhatsAppIcon className="h-6 w-6" />
          </span>
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-400">
            თუ ავტომატური პასუხი არ კმარა, მოგვწერეთ WhatsApp-ით. გადაუდებელ შემთხვევაში ნუ დაელოდებით პასუხს —
            დარეკეთ <span className="font-semibold text-slate-200">112</span>.
          </p>
          <a
            href={whatsappLink(CONTACT_INTRO_KA)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn shrink-0 border-[#25D366]/45 bg-[#25D366]/10 text-fg hover:bg-[#25D366]/20"
          >
            <WhatsAppIcon className="h-4 w-4 text-[#25D366]" /> {WHATSAPP_DISPLAY}
          </a>
        </div>
      </Panel>

      <Panel title="როგორ მუშაობს" subtitle="სამი პრინციპი, რომელზეც სისტემა დგას">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PRINCIPLES.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.titleKa} className="space-y-1.5">
                <Icon className="h-4 w-4 text-cyan" />
                <p className="text-[13px] font-medium text-slate-100">{p.titleKa}</p>
                <p className="text-xs leading-relaxed text-slate-400">{p.bodyKa}</p>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="დააყენეთ ტელეფონში" subtitle="ცალკე აპლიკაციად, App Store-ის გარეშე">
        <ol className="space-y-2.5 text-xs leading-relaxed text-slate-400">
          <li className="flex gap-2.5">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line text-[10px] text-slate-300">1</span>
            <span>
              iPhone: გახსენით ეს გვერდი <span className="text-slate-200">Safari</span>-ში და დააჭირეთ გაზიარების ღილაკს{' '}
              <Share className="inline h-3.5 w-3.5 -translate-y-px text-cyan" /> ეკრანის ქვედა ზოლში.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line text-[10px] text-slate-300">2</span>
            <span>ჩამოსქროლეთ და აირჩიეთ <span className="text-slate-200">{'"Add to Home Screen"'}</span>, შემდეგ <span className="text-slate-200">{'"Add"'}</span>.</span>
          </li>
          <li className="flex gap-2.5">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line text-[10px] text-slate-300">3</span>
            <span>Android: Chrome-ის მენიუდან <span className="text-slate-200">{'"Install app"'}</span> ან დაელოდეთ ავტომატურ შეთავაზებას.</span>
          </li>
        </ol>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          კალკულატორები, მედიკამენტების შეჯერება, ლაბორატორია და ბიბლიოთეკა მუშაობს ინტერნეტის გარეშეც, თუ გვერდი
          ერთხელ მაინც გახსენით. AI-პასუხები საჭიროებს კავშირს.
        </p>
      </Panel>
    </>
  );
}
