import { AGENTS } from '@/agents/registry';
import { SOURCES } from '@/knowledge/sources';
import { DEFECT_CLASSES } from '@/knowledge/defect-classifier';
import { Badge, Bullets, Collapsible, Panel, Table } from '@/components/ui/primitives';

export const metadata = { title: 'შესახებ და მეთოდოლოგია' };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-fg">შესახებ და მეთოდოლოგია</h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-400">
          Georgian Expert Medical AI + AI Hospital არის ქართულენოვანი მრავალაგენტიანი კლინიკური ინტელექტის პლატფორმა. სისტემა არ არის ჩატბოტი: იგი ერთ გარემოში აერთიანებს კლინიკურ მსჯელობას, მტკიცებულების მოძიებას, წამლის უსაფრთხოებას, ხარისხისა და დეფექტების ანალიზს და ქართულ სამედიცინო კონტექსტს.
        </p>
      </header>

      <div id="methodology" />
      <Panel title="როგორ მუშაობს" subtitle="ერთი კითხვა → ორკესტრატორი → აგენტები → ვერიფიკაცია → უსაფრთხოების ბარიერი → წყაროზე მიბმული პასუხი">
        <ol className="space-y-2">
          {[
            'რეჟიმის, განზრახვისა და რისკის კლასის (R0–R5) განსაზღვრა.',
            'გადაუდებელი ნიშნებისა და გამოტოვებული ინფორმაციის იდენტიფიკაცია.',
            'აგენტების შერჩევა და პარალელური/თანმიმდევრული შესრულების დაგეგმვა.',
            'მოძიება Source Registry-სა და ღია კორპუსში: ლექსიკური/მორფოლოგიური დამთხვევა + ქართულ-ინგლისური ცნებების ლექსიკონი + ავტორიტეტი + სიახლე. ნასწავლი (embedding) სემანტიკური ძიება საჯარო ვერსიაში ჩართული არ არის.',
            'დეტერმინისტული გამოთვლები: ქულები, კრეატინინის კლირენსი, ურთიერთქმედებები, ლაბორატორიული ინტერპრეტაცია.',
            'შედეგების გაერთიანება და კონფლიქტების გადაწყვეტა.',
            'მტკიცებების ვერიფიკაცია წყაროებთან (A19).',
            'უსაფრთხოების საბოლოო ბარიერი მაღალი რისკის პასუხებზე (A20).',
            'სტრუქტურირებული პასუხის აწყობა და ექსპორტი.',
          ].map((s, i) => (
            <li key={i} className="flex gap-3 rounded-lg border border-line bg-ink-850/40 p-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-cyan/40 text-xs text-cyan">{i + 1}</span>
              <span className="text-sm leading-relaxed text-slate-300">{s}</span>
            </li>
          ))}
        </ol>
      </Panel>

      <div id="agents" />
      <Panel title="აგენტების კატალოგი" subtitle={`${AGENTS.length} აგენტი დეკლარირებული კონტრაქტით`}>
        <div className="space-y-2">
          {AGENTS.map((a) => (
            <Collapsible key={a.id} title={`${a.id} · ${a.nameKa}`} badge={a.riskClass} defaultOpen={false}>
              <p className="text-sm leading-relaxed text-slate-300">{a.description}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="label mb-1">სავალდებულო შესავალი</p>
                  <Bullets items={a.requiredInputs} />
                  <p className="label mb-1 mt-2">არასავალდებულო</p>
                  <Bullets items={a.optionalInputs.length ? a.optionalInputs : ['—']} />
                </div>
                <div>
                  <p className="label mb-1">გამომავალი სქემა</p>
                  <p className="font-mono text-xs text-slate-400">{a.outputSchema}</p>
                  <p className="label mb-1 mt-2">ვერიფიკაცია</p>
                  <div className="flex flex-wrap gap-1">
                    {a.verification.length ? a.verification.map((v) => <Badge key={v}>{v}</Badge>) : <span className="text-xs text-slate-500">—</span>}
                  </div>
                  <p className="label mb-1 mt-2">დამოკიდებულებები</p>
                  <p className="font-mono text-xs text-slate-400">{a.dependencies.join(', ') || '—'}</p>
                </div>
              </div>
              <div className="mt-2 rounded-md border border-clinical-moderate/35 bg-clinical-moderate/5 p-2.5">
                <p className="label mb-1">დამცავი წესი</p>
                <p className="text-xs leading-relaxed text-slate-300">{a.guardrail}</p>
              </div>
            </Collapsible>
          ))}
        </div>
      </Panel>

      <div id="evidence-policy" />
      <Panel title="მტკიცებულების პოლიტიკა" subtitle="მტკიცებულების იერარქია და სიახლე">
        <Table
          headers={['დონე', 'წყაროს ტიპი']}
          rows={[
            ['1', 'ოფიციალური კლინიკური გაიდლაინები და მარეგულირებელი ინფორმაცია'],
            ['2', 'სისტემური მიმოხილვები და მაღალი ხარისხის მეტაანალიზები'],
            ['3', 'რანდომიზებული კონტროლირებადი კვლევები'],
            ['4', 'მაღალი ხარისხის ობსერვაციული კვლევები'],
            ['5', 'ექსპერტული კონსენსუსი, როცა უფრო ძლიერი მტკიცებულება არ არსებობს'],
            ['6', 'ლოკალური პროტოკოლები და ინსტიტუციური სტანდარტები (იურისდიქციის მითითებით)'],
            ['—', 'AI სინთეზი — მხოლოდ მოძიების შემდეგ და არასდროს როგორც წყარო'],
          ]}
        />
        <div className="mt-4">
          <p className="label mb-1">სიახლის სტატუსები</p>
          <Table
            headers={['სტატუსი', 'განმარტება', 'ინტერფეისის ქცევა']}
            rows={[
              ['current', 'აქტუალური გაიდლაინი ან მტკიცებულება', 'ჩვეულებრივი პასუხი'],
              ['review_due', 'მიმოხილვის ვადის ზღვარზე', 'გაფრთხილება'],
              ['superseded', 'ჩანაცვლებულია ახალი ვერსიით', 'არ ირანჟირება როგორც პირველადი'],
              ['historical', 'მხოლოდ ისტორიული ან სამართლებრივი ანალიზისთვის', 'ცხადი ნიშნული'],
            ]}
          />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          ამჟამად რეესტრში {SOURCES.length} წყაროა. ყოველი კლინიკურად მნიშვნელოვანი მტკიცება — განსაკუთრებით დოზა, ხანგრძლივობა, ზღვარი და უკუჩვენება — გადის claim-to-source ვერიფიკაციას. დაუდასტურებელი მნიშვნელოვანი მტკიცება არ ქვეყნდება როგორც დეფინიტიური რეკომენდაცია.
        </p>
      </Panel>

      <Panel title="ხარისხისა და დეფექტების მოდელი" subtitle="ავტორის კლასიფიკატორი">
        <p className="text-sm leading-relaxed text-slate-400">
          Quality &amp; Safety და Medico-Legal მოდულები აგებულია სახელმძღვანელოზე „სამედიცინო დახმარების ხარისხის კრიტერიუმები და დეფექტების კლასიფიკაცია“ (ავტორი: Davit Barabadze). სისტემაში ჩაშენებულია {DEFECT_CLASSES.length} დეფექტის კლასი შეფასების კრიტერიუმებით, კონტროლის მექანიზმებითა და პასუხისმგებელი რგოლებით, ასევე მიზეზების ტიპოლოგია RCA-სთვის.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {DEFECT_CLASSES.map((c) => (
            <Badge key={c.code}>
              {c.roman}. {c.nameKa}
            </Badge>
          ))}
        </div>
      </Panel>

      <div id="privacy" />
      <Panel title="კონფიდენციალობა">
        <Bullets
          items={[
            'აპლიკაციას არ აქვს ავტორიზაცია და არ ქმნის პერსონალურ სამედიცინო ჩანაწერს ნაგულისხმევად.',
            'ქეისის მონაცემები ინახება მხოლოდ ბრაუზერის სესიაში (sessionStorage) და იშლება ჩანართის დახურვისას.',
            'ატვირთული ფაილები მუშავდება სერვერის მეხსიერებაში და დისკზე არ ინახება.',
            'API გასაღებები ინახება მხოლოდ სერვერის გარემოს ცვლადებში და კლიენტს არასდროს უბრუნდება.',
            'ჯანმრთელობის მონაცემი საქართველოს კანონმდებლობით განსაკუთრებული კატეგორიის მონაცემია — მინიმიზაცია სავალდებულოა.',
            'არქიტექტურა მომზადებულია RBAC/authentication-ის მომავალი დამატებისთვის რეფაქტორის გარეშე.',
          ]}
        />
      </Panel>

      <div id="limitations" />
      <Panel title="შეზღუდვები">
        <Bullets
          items={[
            'სისტემა არის კლინიკური გადაწყვეტილების მხარდაჭერა და არა დანიშნულება; პასუხისმგებლობა რჩება კლინიცისტთან.',
            'Source Registry სადემონსტრაციო მოცულობისაა — რეალური კლინიკური გამოყენებისთვის საჭიროა სრული, ლიცენზირებული კორპუსი.',
            'ქართული რეგულაციური ჩანაწერები მონიშნულია როგორც review_due და საჭიროებს ოფიციალური რედაქციის დადასტურებას.',
            'პირდაპირი გამოსახულების (DICOM) ანალიზი ამ ვერსიაში არ ხდება.',
            'დეფექტების ანალიზი არ არის სამართლებრივი კვალიფიკაცია და არ ადგენს ბრალეულობას.',
            'დროით კრიტიკული ავტონომიური გადაწყვეტილება სისტემის ფარგლებს გარეთაა.',
            'API გასაღების გარეშე სისტემა მუშაობს დეტერმინისტულ რეჟიმში: ყველა გამოთვლა და მოძიება რეალურია, ხოლო ტექსტური სინთეზი — შაბლონური.',
            'ძიება ლექსიკურია (ტერმინების, ფუძეებისა და ლექსიკონის ცნებების დამთხვევა). პერიფრაზი, რომელიც ცნობილ ტერმინს არ შეიცავს, შეიძლება ვერ მოიძებნოს.',
            'მედიკამენტის ქართული სახელის ამოცნობა ≠ ქართული ინსტრუქცია: ინსტრუქცია ჩანს მხოლოდ მაშინ, როცა პროდუქტი დადასტურებულია და მას ოფიციალური (FDA/EMA) ინსტრუქცია აქვს.',
            '„საჭიროებს ადამიანის განხილვას“ საჯარო ვერსიაში გაფრთხილებაა და არა განხილვის სამუშაო პროცესი: რეცენზენტი არ ინიშნება. ინსტიტუციური განხილვა მუშაობს მხოლოდ შიდა ვერსიაში.',
          ]}
        />
      </Panel>

      <Panel title="ავტორი">
        <p className="text-sm leading-relaxed text-slate-400">
          პროექტის დამფუძნებელი და კლინიკური არქიტექტორი — Dr. Davit Barabadze, ნევროლოგი, სამედიცინო დირექტორი. მთავარი პრინციპი: სამედიცინო ცოდნაზე წვდომა არ უნდა იყოს ფინანსური პრივილეგია.
        </p>
      </Panel>
    </div>
  );
}
