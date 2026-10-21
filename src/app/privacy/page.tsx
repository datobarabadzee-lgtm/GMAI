import Link from 'next/link';
import { ClearSessionButton } from '@/features/settings/clear-session-button';
import { CONSENT_POINTS, CONSENT_VERSION, DATA_FLOWS, CONTROLLER, DISCLOSURE, PROCESSOR, SUPERVISORY_AUTHORITY } from '@/knowledge/controller';

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
          <li>— სერვერზე მონაცემთა ბაზა არ არსებობს და აპლიკაცია ტექსტს დისკზე არ წერს. AI-პროვაიდერმა (OpenAI) შეიძლება ბოროტად გამოყენების კონტროლისთვის 30 დღემდე შეინახოს.</li>
          <li>— ქეისის მონაცემი რჩება თქვენივე ბრაუზერში და იშლება ჩანართის დახურვისას.</li>
          <li>— სერვერის ჟურნალში ფიქსირდება მხოლოდ ტექნიკური მაჩვენებლები, არა კლინიკური ტექსტი.</li>
          <li>— პასუხის მისაღებად ტექსტი გადაეცემა {PROCESSOR.nameEn}-ს ({PROCESSOR.countryKa}); ძიების ტერმინები — Europe PMC-ს, პრეპარატის სახელი — openFDA-ს და EMA-ს. ზუსტი ცხრილი ქვემოთაა.</li>
        </ul>
      </section>

      <ClearSessionButton />

      <section className="rounded-lg border border-line bg-ink-850/40 p-4">
        <h2 className="text-[15px] font-semibold text-fg">სად მიდის მონაცემი — ყოველი გზა</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[12.5px] leading-relaxed text-slate-300">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 pr-3 font-medium">მოდული</th>
                <th className="py-1 pr-3 font-medium">რა</th>
                <th className="py-1 pr-3 font-medium">ვის</th>
                <th className="py-1 font-medium">საფუძველი</th>
              </tr>
            </thead>
            <tbody>
              {DATA_FLOWS.map((f) => (
                <tr key={f.routeKa} className="border-t border-line align-top">
                  <td className="py-1.5 pr-3">{f.routeKa}</td>
                  <td className="py-1.5 pr-3">{f.whatKa}</td>
                  <td className="py-1.5 pr-3">{f.toKa}</td>
                  <td className="py-1.5">{f.basisKa}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
