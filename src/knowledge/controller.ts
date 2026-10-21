/**
 * DATA CONTROLLER IDENTITY AND PROCESSING DISCLOSURE
 *
 * Article 24(1) of the Law of Georgia on Personal Data Protection requires the
 * controller to give the data subject a specific list of facts BEFORE
 * collection begins. Those facts are declared here, in one place, so the
 * consent screen, the privacy page and any future document all state the same
 * thing and cannot drift apart.
 *
 * Confirmed by the controller (medical director) on 2026-10-17. The address
 * and identification code are those printed on the clinic's official
 * letterhead (see services/document-builder.ts).
 */

export const CONTROLLER = {
  legalNameKa: 'შპს „ინ ვიტრო განაყოფიერების ცენტრი" — ლიდერმედი',
  brandKa: 'ლიდერმედი',
  idCodeKa: 'საიდენტიფიკაციო კოდი: 202462708',
  phone: '(+995 32) 215 77 77',
  addressKa: 'ნოდარ ბოხუას ქ. 21, თბილისი 0159, საქართველო',
  email: 'info@leadermed.ge',
  /** Article 33(1): a data protection officer is mandatory for a medical institution. */
  dpoKa: 'მონაცემთა დაცვის ოფიცერი — ლიდერმედი',
  dpoEmail: 'dpo@leadermed.ge',
} as const;

/** The processor the text is transmitted to in order to produce an answer. */
export const PROCESSOR = {
  nameEn: 'OpenAI, L.L.C.',
  countryKa: 'ამერიკის შეერთებული შტატები',
  roleKa: 'უფლებამოსილი პირი (პროცესორი) — ამუშავებს ტექსტს პასუხის გენერირებისთვის',
} as const;

export const SUPERVISORY_AUTHORITY = {
  nameKa: 'საქართველოს სახელმწიფო აუდიტის სამსახური',
  noteKa: 'პერსონალურ მონაცემთა დაცვის ზედამხედველი ორგანო 2026 წლის 2 მარტიდან',
} as const;

/**
 * Consent text version. Any change to what the subject is told invalidates
 * consent previously given against the old text, so the version is bumped and
 * the subject is asked again. Never edit the disclosure without bumping this.
 */
export const CONSENT_VERSION = '2026-10-21.1';

export type DisclosureItem = { labelKa: string; bodyKa: string };

/** The Article 24(1) list, in the order the law states it. */
export const DISCLOSURE: DisclosureItem[] = [
  {
    labelKa: 'ვინ ამუშავებს მონაცემს',
    bodyKa: `${CONTROLLER.legalNameKa}, ${CONTROLLER.idCodeKa}. კონტაქტი: ${CONTROLLER.phone}, ${CONTROLLER.email}, ${CONTROLLER.addressKa}.`,
  },
  {
    labelKa: 'მონაცემთა დაცვის ოფიცერი',
    bodyKa: `${CONTROLLER.dpoKa}. კონტაქტი: ${CONTROLLER.dpoEmail}.`,
  },
  {
    labelKa: 'რა მიზნით',
    bodyKa:
      'თქვენ მიერ შეყვანილი სამედიცინო ინფორმაციის ახსნა გასაგებ ენაზე, გადაუდებელი მიმართვის ნიშნების მითითება და ექიმისთვის დასასმელი კითხვების ჩამოყალიბება. სერვისი არ სვამს დიაგნოზს და არ ნიშნავს მკურნალობას.',
  },
  {
    labelKa: 'რა სამართლებრივი საფუძვლით',
    bodyKa:
      'თქვენი თანხმობა. ჯანმრთელობის მონაცემი განსაკუთრებული კატეგორიის მონაცემია და მუშავდება „პერსონალურ მონაცემთა დაცვის შესახებ" საქართველოს კანონის მე-6 მუხლის პირველი პუნქტის „ა" ქვეპუნქტის საფუძველზე, ხოლო სხვა ქვეყანაში გადაცემა — იმავე კანონის 37-ე მუხლის მე-2 პუნქტის „დ" ქვეპუნქტის საფუძველზე.',
  },
  {
    labelKa: 'სავალდებულოა თუ არა მონაცემის მოწოდება',
    bodyKa:
      'არა. მონაცემის მოწოდება სრულიად ნებაყოფლობითია. თანხმობაზე უარის შემთხვევაში თქვენ ვერ მიიღებთ ახსნას, მაგრამ სერვისის დანარჩენი ნაწილი — კალკულატორები, წამლების შემოწმება, ანალიზების ლოკალური ინტერპრეტაცია და მტკიცებულების ძიება — სრულად ხელმისაწვდომი რჩება. სერვისით სარგებლობა თანხმობაზე დამოკიდებული არ არის.',
  },
  {
    labelKa: 'ვის გადაეცემა',
    bodyKa: `${PROCESSOR.nameEn} — ${PROCESSOR.roleKa}: თქვენი კითხვა და შეყვანილი სამედიცინო ტექსტი. ამის გარდა, პასუხის მოსამზადებლად: ძიების ინგლისური ტერმინები (კითხვიდან მიღებული, სახელისა და საიდენტიფიკაციო მონაცემის გარეშე) — Europe PMC-ს (EMBL-EBI); პრეპარატის დასახელება — openFDA-ს (აშშ) და ევროპის წამლების სააგენტოს (EMA); მოთხოვნა გადის ჰოსტინგის პროვაიდერის, Vercel Inc.-ის (აშშ) სერვერებზე. მონაცემი არ გადაეცემა სადაზღვევო კომპანიას, დამსაქმებელს ან სხვა მესამე პირს.`,
  },
  {
    labelKa: 'გადაეცემა თუ არა სხვა ქვეყანაში',
    bodyKa: `დიახ. ტექსტი მუშავდება ${PROCESSOR.countryKa}-ში. საქართველოს კანონმდებლობით ამ სახელმწიფოსთვის მონაცემთა დაცვის ადეკვატურობის გადაწყვეტილება მიღებული არ არის. ეს ნიშნავს, რომ იქ მონაცემთა დაცვის სათანადო გარანტიები არ არის დადასტურებული და თეორიულად შესაძლებელია უცხო ქვეყნის კანონმდებლობით გათვალისწინებული წვდომა. თქვენ ეს ინფორმაცია მიიღეთ თანხმობის გაცემამდე.`,
  },
  {
    labelKa: 'რამდენ ხანს ინახება',
    bodyKa:
      'სერვერზე მონაცემთა ბაზა არ არსებობს და აპლიკაცია თქვენს ტექსტს დისკზე არ წერს. ქეისი და საუბარი ინახება თქვენივე ბრაუზერის სესიაში და იშლება ჩანართის დახურვისას ან თანხმობის გამოხმობისას. სერვერის ტექნიკურ ჟურნალში ფიქსირდება მხოლოდ მაჩვენებლები — მოდელი, ტოკენების რაოდენობა, ხარჯი, დრო, გამოშვების სტატუსი — და არა კლინიკური ტექსტი; ჟურნალს ინახავს ჰოსტინგის პროვაიდერი მისი პირობებით. OpenAI-სთვის ვითხოვთ, რომ პასუხი არ შეინახოს (store: false) — ეს არ ნიშნავს ნულოვან შენახვას: OpenAI-ს პირობებით, ბოროტად გამოყენების კონტროლისთვის ჩანაწერები შეიძლება ინახებოდეს მაქსიმუმ 30 დღე, თუ კანონი უფრო ხანგრძლივ ვადას არ მოითხოვს. გადაცემული ტექსტი მოდელის გასაწვრთნელად არ გამოიყენება.',
  },
  {
    labelKa: 'თქვენი უფლებები',
    bodyKa:
      'თქვენ გაქვთ უფლება: მიიღოთ ინფორმაცია დამუშავების შესახებ; მოითხოვოთ მონაცემის გასწორება, განახლება, დაბლოკვა, წაშლა ან განადგურება; ნებისმიერ დროს, განმარტების გარეშე გამოიხმოთ თანხმობა; და მიმართოთ საქართველოს სახელმწიფო აუდიტის სამსახურს ან სასამართლოს. თანხმობის გამოხმობა არ ახდენს გავლენას მის გამოხმობამდე განხორციელებული დამუშავების კანონიერებაზე.',
  },
];

/** The sentences the subject affirms. Each is a separate, specific statement. */
export const CONSENT_POINTS = [
  'ვეთანხმები, რომ ჩემ მიერ შეყვანილი ჯანმრთელობის მონაცემი დამუშავდეს ახსნის მიზნით.',
  'ინფორმირებული ვარ, რომ ტექსტი გადაეცემა ამერიკის შეერთებულ შტატებში და რომ ამ ქვეყნისთვის მონაცემთა დაცვის ადეკვატურობის გადაწყვეტილება მიღებული არ არის — ანუ სათანადო გარანტიები დადასტურებული არ არის.',
  'ვიცი, რომ სერვისი არ სვამს დიაგნოზს, არ ნიშნავს მკურნალობას და არ ცვლის ექიმთან კონსულტაციას.',
  'ვიცი, რომ თანხმობა ნებაყოფლობითია და მისი გამოხმობა ნებისმიერ დროს შემიძლია.',
] as const;

/**
 * PROFESSIONAL ATTESTATION (audit F07). A clinician who sends patient-specific
 * data to the AI provider affirms the basis for it; the server refuses such a
 * request without this header (src/server/processing-policy.ts). Bump the
 * version whenever the text changes.
 */
export const PROFESSIONAL_ATTESTATION_VERSION = '2026-10-21.1';
export const PROFESSIONAL_ATTESTATION_KA =
  'ვადასტურებ, რომ AI-ს გადაცემული პაციენტის მონაცემები დეპერსონალიზებულია (სახელი, პირადი ნომერი, მისამართი, ტელეფონი და სხვა იდენტიფიკატორი არ შეიცავს), ან რომ პაციენტის თანხმობა ან დაწესებულების დოკუმენტირებული სხვა სამართლებრივი საფუძველი არსებობს. ვიცი, რომ ტექსტი გადაეცემა OpenAI-ს (აშშ).';

/** Every route that sends data outside the application, for the privacy page and the operator docs. */
export const DATA_FLOWS: { routeKa: string; whatKa: string; toKa: string; basisKa: string }[] = [
  { routeKa: 'პაციენტის რეჟიმი (/patient)', whatKa: 'კითხვა, ინტერვიუს პასუხები, მითითებული მონაცემები', toKa: 'OpenAI (აშშ); ძიების ტერმინები — Europe PMC; პრეპარატის სახელი — openFDA/EMA', basisKa: 'მონაცემის სუბიექტის თანხმობა (სერვერზე მოწმდება)' },
  { routeKa: 'კლინიკური AI (/clinical, ყველა რეჟიმი), აკადემია', whatKa: 'კითხვა და პაციენტის კონტექსტი, თუ შეყვანილია', toKa: 'OpenAI (აშშ); ძიების ტერმინები — Europe PMC; პრეპარატის სახელი — openFDA/EMA', basisKa: 'პაციენტის მონაცემით: სპეციალისტის დადასტურება (სერვერზე მოწმდება); ზოგადი კითხვა — საფუძველი არ სჭირდება' },
  { routeKa: 'დოკუმენტის შედგენა (/documents)', whatKa: 'პაციენტის კონტექსტი, ექიმის ჩანაწერები', toKa: 'OpenAI (აშშ); სადაზღვევოში სტანდარტის ძიება — Europe PMC', basisKa: 'სპეციალისტის დადასტურება (სერვერზე მოწმდება)' },
  { routeKa: 'პრეპარატის ქართული შეჯამება', whatKa: 'მხოლოდ დადასტურებული პროდუქტის ინსტრუქციის ტექსტი (პაციენტის მონაცემი არა)', toKa: 'OpenAI (აშშ)', basisKa: 'პაციენტის მონაცემი არ გადაეცემა' },
  { routeKa: 'მედიკამენტის ძიება, პოლიპრაგმაზია', whatKa: 'პრეპარატის დასახელება', toKa: 'openFDA (აშშ), EMA (ევროკავშირი), Europe PMC', basisKa: 'პაციენტის მონაცემი არ გადაეცემა' },
  { routeKa: 'ლაბორატორია, კალკულატორები, ფაილის წაკითხვა', whatKa: 'მნიშვნელობები / ფაილი', toKa: 'არსად — მუშავდება ბრაუზერში ან სერვერის მეხსიერებაში, დისკზე არ იწერება', basisKa: '—' },
];
