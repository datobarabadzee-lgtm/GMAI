# გარემოს ცვლადების სქემა (ENVIRONMENT_SCHEMA)

წყარო: `src/config/env-schema.json` · გენერირებულია `npm run docs:gen`-ით. შემოწმება (მხოლოდ present/missing, მნიშვნელობა არასოდეს იბეჭდება):

```
npm run env:check -- --hosting self_hosted --env-file .env.production
npm run env:check -- --hosting vercel
```

იგივე შემოწმება შედის `/api/health/ready`-ში (check `environment`). საიდუმლო (secret) ცვლადი მხოლოდ ჰოსტის secret store-ში; `.env.example`-ში ცარიელია.

| ცვლადი | ჯგუფი | როდის სავალდებულო | secret | ნაგულისხმევი | აღწერა |
|---|---|---|---|---|---|
| `APP_TIER` | deployment | ყოველთვის (ცხადად) | — | `public` | განთავსების დონე. აუცილებლად მიუთითეთ ცხადად. დაუყენებელი ან უცნობი მნიშვნელობა = public (უსაფრთხო ნაგულისხმევი). internal მხოლოდ კლინიკის კონტროლირებად ინფრასტრუქტურაზე. (public / internal) |
| `NEXT_PUBLIC_SITE_URL` | deployment | არასავალდებულო | — | `https://gmai-29267867738.europe-west1.run.app` | საიტის საჯარო მისამართი (მაგ. საკუთარი დომენი). გამოიყენება Facebook-ისა და სხვა სოციალური ქსელების გაზიარების ბარათის სრული ბმულისთვის. ბილდის დროს იკითხება. |
| `PUBLIC_ORIGIN` | security | საკუთარ ჰოსტზე | — | — | საჯარო მისამართი (მაგ. https://gmai.example.ge). ოპერატორის mutation-ების Origin/CSRF შემოწმება ამას ადარებს. reverse proxy-ის უკან აუცილებელია. |
| `OPERATOR_TOKEN` | security | internal + ადმინისტრაციული ჩაწერა | კი | — | ოპერატორის ავთენტიფიკაცია ადმინისტრაციულ ჩაწერებზე (კურაცია, წყაროების რეესტრი). ≥32 სიმბოლო. გარეშე ყველა ადმინისტრაციული ჩაწერა დახურულია. |
| `ENABLE_DEV_TOOLS` | security | არასავალდებულო | — | `0` | 1 = /admin და /dev ხელსაწყოები (მხოლოდ internal-ში). production-ში 0. |
| `REVIEWERS` | security | არასავალდებულო | კი | — | ადამიანური განხილვის რეცენზენტები (internal): `სახელი\|reviewer ან lead\|sha256(token)`, გამყოფი `;`. სერვერზე ინახება მხოლოდ token-ის hash. |
| `REVIEW_DB_PATH` | security | არასავალდებულო | — | `data/review/reviews.sqlite` | განხილვის ჩანაწერებისა და audit trail-ის SQLite ფაილი (მუდმივ volume-ზე, internal). |
| `OPENAI_API_KEY` | ai | პლატფორმის AI-სთვის | კი | — | პლატფორმის AI გასაღები, მხოლოდ სერვერზე. გარეშე AI პასუხები მუშაობს მხოლოდ მომხმარებლის საკუთარი გასაღებით (BYOK); დეტერმინისტული მოდულები მუშაობს ყოველთვის. |
| `AI_API_KEY` | ai | არასავალდებულო | კი | — | OPENAI_API_KEY-ის ალტერნატიული სახელი (თავსებადი gateway). |
| `AI_PROVIDER` | ai | არასავალდებულო | — | `openai` | ამჟამად რეალური adapter მხოლოდ OpenAI Responses API-ა. |
| `AI_BASE_URL` | ai | არასავალდებულო | — | `https://api.openai.com/v1` | OpenAI-თავსებადი endpoint. |
| `OPENAI_MODEL` | ai | არასავალდებულო | — | `(კოდში მითითებული)` | მოდელი. უფრო ძვირი მოდელი ავტომატურად არ ირჩევა. |
| `AI_MODEL_FAST` | ai | არასავალდებულო | — | `= OPENAI_MODEL` | სწრაფი დონის მოდელი (ცალკე მხოლოდ შეგნებულად). |
| `AI_MODEL_REASONING` | ai | არასავალდებულო | — | `= OPENAI_MODEL` | ღრმა რეჟიმის მოდელი. |
| `AI_MODEL_FALLBACK` | ai | არასავალდებულო | — | `(კოდში)` | ხელახალი ცდის მოდელი. |
| `OPENAI_REASONING_EFFORT` | ai | არასავალდებულო | — | `low` | minimal \| low \| medium \| high |
| `OPENAI_REASONING_EFFORT_DEEP` | ai | არასავალდებულო | — | `= OPENAI_REASONING_EFFORT` | ღრმა რეჟიმისთვის. |
| `OPENAI_MAX_OUTPUT_TOKENS` | ai | არასავალდებულო | — | `1600` | პასუხის ზომის ზღვარი (ხარჯის მთავარი ბერკეტი). |
| `OPENAI_MAX_OUTPUT_TOKENS_DEEP` | ai | არასავალდებულო | — | `3000` | ღრმა რეჟიმისთვის. |
| `AI_TIMEOUT_MS` | ai | არასავალდებულო | — | `90000` | AI მოთხოვნის ვადა. |
| `AGENT_TIMEOUT_MS` | ai | არასავალდებულო | — | `25000` | ერთი აგენტის ვადა; გადაცილება აღირიცხება timeout-ად. |
| `MODEL_PRICING_JSON` | ai | არასავალდებულო | — | — | ფასების სიის გადაფარვა (USD / 1M token). |
| `OPENFDA_API_KEY` | medications | არასავალდებულო | კი | — | openFDA გასაღები (მაღალი ლიმიტი). მხოლოდ სერვერზე. |
| `MED_RECEIPT_SECRET` | medications | როცა პლატფორმის AI გასაღები არ არის | კი | `(პლატფორმის გასაღებიდან გამოყვანილი)` | პრეპარატის დადასტურების ქვითრის ხელმოწერა. პლატფორმის AI გასაღების გარეშე ჰოსტზე აუცილებელია, თორემ დადასტურება ვერ ხელმოიწერება. |
| `MED_CURATED_MAP` | medications | არასავალდებულო | — | `knowledge/medications/curated-map.json` | კურირებული რუკის ფაილი (ტესტებისთვის). |
| `DISABLE_LIVE_SOURCES` | medications | არასავალდებულო | — | `0` | 1 = openFDA/EMA/Europe PMC ცოცხალი მოთხოვნები გამორთულია (ტესტები, offline). |
| `LIMIT_STORE` | limits | რამდენიმე პროცესი/ინსტანცია | — | `memory` | ლიმიტებისა და ხარჯის მრიცხველი. memory = მხოლოდ ერთი პროცესი; file = ერთი ჰოსტი/volume; redis = რამდენიმე ჰოსტი. (memory / file / redis) |
| `LIMIT_STORE_PATH` | limits | არასავალდებულო | — | `data/runtime/limits.json` | file store-ის ფაილი (მუდმივ volume-ზე). |
| `LIMIT_STORE_URL` | limits | LIMIT_STORE=redis | კი | — | redis://[:password@]host:port[/db] ან Upstash-თავსებადი https://… |
| `LIMIT_STORE_TOKEN` | limits | არასავალდებულო | კი | — | REST Redis-ის token. |
| `DAILY_BUDGET_USD` | limits | არასავალდებულო | — | `5` | აპლიკაციის დღიური ხარჯის ზღვარი (პროვაიდერის ანგარიშის ბიუჯეტი რჩება ერთადერთ გარე მყარ ზღვრად). |
| `AI_RESERVE_USD_PER_RUN` | limits | არასავალდებულო | — | `0.03` | გაშვების წინასწარი რეზერვაცია ზღვარზე. |
| `RATE_LIMIT_IP_PER_WINDOW` | limits | არასავალდებულო | — | `12` |  |
| `RATE_LIMIT_WINDOW_SEC` | limits | არასავალდებულო | — | `60` |  |
| `RATE_LIMIT_IP_PER_DAY` | limits | არასავალდებულო | — | `200` |  |
| `RATE_LIMIT_GLOBAL_PER_MIN` | limits | არასავალდებულო | — | `120` |  |
| `PROCESSING_POLICY` | processing | არასავალდებულო | — | — | institutional = დაწესებულების დოკუმენტირებული სამართლებრივი საფუძველი. (institutional) |
| `PROCESSING_BASIS_REF` | processing | არასავალდებულო | — | — | ამ საფუძვლის დოკუმენტის იდენტიფიკატორი. |
| `NEXT_PUBLIC_UPLOAD_MAX_TOTAL_MB` | processing | არასავალდებულო | — | `4` | ატვირთვის ჯამური ზღვარი. Vercel-ზე ≤4 (პლატფორმის ლიმიტი 4.5 MB); self-hosted-ზე მხოლოდ თუ proxy-ც იღებს. |
| `NEXT_PUBLIC_CONTACT_WHATSAPP` | processing | არასავალდებულო | — | `(კოდში)` | საკონტაქტო ნომერი UI-ში (საჯარო). |
| `LOG_RETRIEVAL_QUERY` | processing | არასავალდებულო | — | `0` | 1 = ძიების ტექსტი ჟურნალში (ნაგულისხმევად გამორთულია). |
| `KB_DB_PATH` | knowledge | internal ცოდნის ბაზა | — | `data/gmai-kb.sqlite` | შიდა SQLite ცოდნის ბაზა (მხოლოდ internal). |
| `KB_SOURCE_DIR` | knowledge | internal ცოდნის ბაზა | — | `knowledge-source` | master JSON-ების საქაღალდე იმპორტისთვის. |
| `EMBEDDING_PROVIDER` | knowledge | არასავალდებულო | — | `auto` | შიდა ძრავის ვექტორები. hash = ლექსიკური n-gram, არა ნასწავლი სემანტიკა. (auto / hash / openai) |
| `EMBEDDING_MODEL` | knowledge | არასავალდებულო | — | `text-embedding-3-small` |  |
| `EMBEDDING_DIM` | knowledge | არასავალდებულო | — | `1536` |  |
| `EMBEDDING_BASE_URL` | knowledge | არასავალდებულო | — | — |  |
| `EMBEDDING_API_KEY` | knowledge | არასავალდებულო | კი | — |  |
| `CLINICAL_V2_PKG` | knowledge | არასავალდებულო | — | — | clinical-v2 პაკეტის გზა იმპორტის სკრიპტისთვის. |
| `DATABASE_URL` | knowledge | არასავალდებულო | კი | — | არასავალდებულო PostgreSQL (წყაროების რეესტრის ასლი). |
| `EVAL_TOKEN` | operations | არასავალდებულო | კი | — | /api/eval/drift-ის token; გარეშე endpoint არ არსებობს. |
| `RELEASE_COMMIT` | operations | არასავალდებულო | — | `(git rev-parse HEAD)` | release manifest-ის commit, როცა .git არ არის ხელმისაწვდომი. |
| `RELEASE_MANIFEST_DEBUG` | operations | არასავალდებულო | — | `0` | 1 = build-ისას release manifest-ი ბეჭდავს წყაროს ფაილების სიას (ზომა, hash-ის თავი) ორი ჰოსტის შესადარებლად. |
