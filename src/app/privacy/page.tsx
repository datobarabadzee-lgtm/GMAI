import Link from 'next/link';
import { CONSENT_POINTS, CONSENT_VERSION, CONTROLLER, DISCLOSURE, PROCESSOR, SUPERVISORY_AUTHORITY } from '@/knowledge/controller';

export const metadata = { title: 'კონფიდენციალობის პოლიტიკა' };

/**
 * The public disclosure required by Article 24(1). It restates exactly what the
 * consent screen says, from the same source, so the two can never diverge.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-fg">კონფიდენციალობის პოლიტიკა</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-400">
          მომზადებულია „პერსონალურ მონაცემთა დაცვის შესახებ“ საქართველოს კანონის 24-ე მუხლის პირველი პუნქტის
          მოთხოვნების შესაბამისად. ვერსია {CONSENT_VERSION}.
        </p>
      </header>

      <section className="rounded-lg border border-clinical-low/30 bg-clinical-low/5 p-4">
        <h2 className="text-[15px] font-semibold text-clinical-low">მოკლედ</h2>
        <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-slate-300">
          <li>— ანგარიში არ იქმნება. რეგისტრაცია, პაროლი და ელფოსტა არ ითხოვება.</li>
          <li>— სერვერზე მონაცემთა ბაზა არ არსებობს. თქვენი ტექსტი არსად არ ინახება.</li>
          <li>— ქეისის მონაცემი რჩება თქვენივე ბრაუზერში და იშლება ჩანართის დახურვისას.</li>
          <li>— სერვერის ჟურნალში არცერთი კლინიკური სიტყვა არ ფიქსირდება.</li>
          <li>— პასუხის მისაღებად ტექსტი გადაეცემა {PROCESSOR.nameEn}-ს ({PROCESSOR.countryKa}).</li>
        </ul>
      </section>

      <section className="space-y-4">
        {DISCLOSURE.map((d, i) => (
          <article key={d.labelKa} className="rounded-lg border border-line bg-ink-850/40 p-4">
            <h2 className="text-[15px] font-semibold text-fg">
              <span className="mr-2 font-mono text-[12px] text-cyan">{i + 1}</span>
              {d.labelKa}
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-300">{d.bodyKa}</p>
          </article>
        ))}
      </section>

      <section className="rounded-lg border border-line bg-ink-850/40 p-4">
        <h2 className="text-[15px] font-semibold text-fg">რას ადასტურებს მომხმარებელი</h2>
        <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-slate-300">
          {CONSENT_POINTS.map((p) => (
            <li key={p}>— {p}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-line bg-ink-850/40 p-4">
        <h2 className="text-[15px] font-semibold text-fg">თანხმობის გამოხმობა</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-300">
          თანხმობის გამოხმობა შეგიძლიათ ნებისმიერ დროს, განმარტების გარეშე, იმავე ელექტრონული ფორმით,
          რომლითაც გასცეთ — პაციენტის მოდულში ღილაკით „თანხმობის გამოხმობა“. გამოხმობისთანავე იშლება
          ბრაუზერში შენახული ქეისის მონაცემი. გამოხმობა არ ახდენს გავლენას მანამდე განხორციელებული
          დამუშავების კანონიერებაზე.
        </p>
      </section>

      <section className="rounded-lg border border-line bg-ink-850/40 p-4">
        <h2 className="text-[15px] font-semibold text-fg">საჩივარი</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-300">
          {SUPERVISORY_AUTHORITY.nameKa} — {SUPERVISORY_AUTHORITY.noteKa}. ასევე შეგიძლიათ მიმართოთ
          სასამართლოს. ჩვენთან დასაკავშირებლად: {CONTROLLER.dpoEmail}, {CONTROLLER.phone}.
        </p>
      </section>

      <p className="text-[11px] leading-relaxed text-slate-500">
        <Link href="/about" className="text-cyan hover:underline">
          მეთოდოლოგია და შეზღუდვები
        </Link>{' '}
        — როგორ მუშაობს სისტემა, რა არ შეუძლია და რა წყაროებს ეყრდნობა.
      </p>
    </div>
  );
}
