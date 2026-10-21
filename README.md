# Georgian Expert Medical AI + AI Hospital

**Internal project code: GMAI-AIH**

ქართულენოვანი მრავალაგენტიანი Medical Intelligence Platform — კლინიკური მსჯელობა, მტკიცებულების ძრავა, წამლის ინტელექტი, ხარისხისა და დეფექტების ანალიზი და AI Hospital ერთ გარემოში.

> სისტემა არის **კლინიკური გადაწყვეტილების მხარდაჭერა (CDS)** და არა დანიშნულება. კლინიკური პასუხისმგებლობა რჩება ექიმთან.

---

## 1. სწრაფი გაშვება

> სრული ინსტრუქცია სხვა ჰოსტზე გადასატანად: `docs/SETUP.md`, `docs/RUNBOOK_MIGRATION.md`, `docs/BACKUP_RESTORE.md`, `docs/ROLLBACK.md`.

```bash
npm ci                    # lockfile-ით, გამეორებადი (Node 22, npm 10 — .nvmrc, package.json engines)
cp .env.example .env      # ცვლადები: docs/ENVIRONMENT_SCHEMA.md; შემოწმება: npm run env:check
npm run dev               # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

დამატებითი ბრძანებები:

| ბრძანება | დანიშნულება |
| --- | --- |
| `npm run typecheck` | TypeScript-ის სრული შემოწმება (`tsc --noEmit`) |
| `npm test` | Vitest — unit, schema, calculator, routing, verification, safety, parsing, ცოდნის ძრავა, აგენტები, ქართული UI |
| `npm run kb:import` | ცოდნის ბაზის აგება `knowledge-source/`-იდან |
| `npm run db:generate` | Drizzle მიგრაციის გენერაცია (მოითხოვს `DATABASE_URL`) |
| `npm run seed` | ცოდნის ბაზის ჩაწერა SQL-ში (ან SQL-ის stdout-ზე დაბეჭდვა) |

**ავტორიზაცია არ არსებობს.** აპლიკაცია პირდაპირ იხსნება მთავარ სისტემაში: არ არის login, signup, password, email verification ან OAuth.

---

## 2. არქიტექტურა

```
src/
  app/            Next.js App Router — 19 გვერდი + API routes
  components/     layout (shell, nav) და UI პრიმიტივები
  features/       თითო მოდულის კლიენტური ინტერფეისი
  agents/         აგენტების რეესტრი (A00–A20) და სერვერული იმპლემენტაციები
  services/       orchestrator, model-router, retrieval, citation-verifier,
                  safety-gate, ai-provider
  lib/            დეტერმინისტული ძრავები: calculators, medication-review,
                  labs, parsers, utils
  schemas/        zod კონტრაქტები (clinical, evidence, drug, quality, agent)
  knowledge/      sources, drugs, guidelines, georgian-context,
                  defect-classifier, hospital, academy, document-templates,
                  demo-cases
  db/             Drizzle სქემა და seed
  tests/          Vitest ტესტები
drizzle/          SQL მიგრაცია (pgvector-ready)
```

### შვიდი ფენა

1. **Experience** — ვებ ინტერფეისი (პროფესიული / პაციენტის / სასწავლო რეჟიმები)
2. **Identity & Access** — ამ ვერსიაში გამორთული; არქიტექტურა RBAC-ისთვის მომზადებულია
3. **AI Orchestration** — intent, risk, context, model routing, agent coordination
4. **Clinical Intelligence** — reasoning, DDx, drugs, calculators, labs, quality
5. **Knowledge** — source registry, drug objects, Georgian ontology, defect classifier
6. **Data & Interoperability** — FHIR-ready მოდელი; DB სქემა pgvector-ისთვის
7. **Governance & Audit** — provenance, versions, rights, safety, audit events

### მოთხოვნის სრული ციკლი

```
კითხვა
  → Orchestrator: intent + risk (R0–R5) + emergency + missing data
  → Model Router: tier / temperature / verification budget
  → A05 Evidence Retrieval (თანმიმდევრული)
  → სპეციალიზებული აგენტები (პარალელური)
  → A19 Citation & Claim Verification
  → A20 Clinical Safety Final Gate
  → სტრუქტურირებული, წყაროზე მიბმული პასუხი
```

---

## 3. ცოდნის ძრავა (Knowledge Engine)

აპლიკაცია მუშაობს შიდა, ნორმალიზებულ ცოდნის ბაზაზე. სტრუქტურა:

```
საწყისი ფაილები (knowledge-source/)
  → zero-trust importer (ვალიდაცია · hash · ვერსია · კარანტინი)
  → ნორმალიზებული SQLite (src/kb/schema.sql)
  → FTS5 ლექსიკური ინდექსი + ვექტორული ინდექსი
  → ჰიბრიდული მოძიება + რერანკინგი
  → coverage gate
  → აგენტები (მხოლოდ მოძიებულ წესებზე)
  → ვერიფიკატორები → Safety Gate → პასუხი + provenance
```

### იმპორტი

```bash
mkdir -p knowledge-source
cp GMAI_Clinical_Rules_Master_v1.json GMAI_Quality_Defect_Rules_Master_v1.json knowledge-source/
npm run kb:import
```

იმპორტი იდემპოტენტურია: იდენტური ფაილის ჰეშით განმეორებითი გაშვება ჩანაწერს არ ამატებს.
წყაროს ახალი ჰეში ავტომატურად აუქმებს (supersedes) წინა აქტიურ ვერსიას.

**Zero-trust:** ყოველი ჩანაწერი მოწმდება zod სქემით; ვალიდაციის ჩავარდნა → `knowledge_import_errors`
(კარანტინი, სრული raw payload-ით), არა ჩუმი გამოტოვება. დამატებით:
დუბლიკატი ID → კარანტინი; გატეხილი მითითება → გაფრთხილება; `null` არ იქცევა ცარიელ სტრიქონად;
`eligible_for_autonomous_legal_conclusion = true` → ჩანაწერი **უარყოფილია პოლიტიკით**;
`QUALITY_RULE_CANDIDATE` + auto-flag → ფლაგი გამორთულია იმპორტზე.

### ბაზის ცხრილები

`knowledge_sources · knowledge_source_versions · knowledge_import_runs · knowledge_import_errors ·
clinical_topics · clinical_rules · clinical_required_data · clinical_fhir_requirements ·
clinical_numeric_constraints · clinical_provenance · quality_rules · quality_required_evidence ·
defect_taxonomy · audit_questions · quality_workflow_steps · quality_sections ·
search_items · search_fts (FTS5) · search_vectors · ai_runs`

### სიმწიფის სემანტიკა (უცვლელად შენარჩუნებული)

კლინიკური: `L3_STRUCTURED_RULE` · `L3_HIGH_COMPUTABILITY_CANDIDATE` · `L3_CANDIDATE`
ხარისხის: `COMPUTABLE_AUDIT_CHECK` · `HIGH_COMPUTABILITY_RULE` · `STRUCTURED_DECISION_RULE` ·
`HUMAN_JUDGMENT_RULE` · `QUALITY_RULE_CANDIDATE`

არცერთი მათგანი არ ნიშნავს `PRODUCTION_CDS`-ს. `executable_expression`-ის არარსებობისას
სისტემა ლოგიკას არ იგონებს.

### ჰიბრიდული მოძიება

| კომპონენტი | წყარო |
| --- | --- |
| ლექსიკური | SQLite FTS5 / BM25 (`unicode61`, ქართულით ტესტირებული) |
| ტერმინების დაფარვა | მოთხოვნის კონცეფციების წილი, რომლებიც რეალურად გვხვდება წესში |
| სემანტიკური | ვექტორული ინდექსი (`EmbeddingProvider`) |
| დომენი | კლინიკური დომენი / დეფექტის კლასი |
| სიმწიფე | სტრუქტურირებული წესი კანდიდატზე მაღლა |
| უსაფრთხოება | patient-specific / numeric / causality ფლაგები |
| მონაცემები | `required_data` ქეისის მონაცემებთან შესაბამისობა |
| სიახლე | `current_evidence_refresh_required` → ჯარიმა |

ყველა ქულა დეკომპოზირებულია და ჩანს „ძიების დიაგნოსტიკაში“.

**Cross-language layer.** კლინიკური კორპუსი ინგლისურია, პროდუქტი ქართული.
`src/kb/lexicon.ts` შეიცავს კონტროლირებად ქართულ↔ინგლისურ ლექსიკონს ქართული
ფლექსიის სტემინგით; მოთხოვნა ფართოვდება ორივე ენაზე ძიებამდე.

### Coverage gate

| სტატუსი | მნიშვნელობა |
| --- | --- |
| `COVERED` | კორპუსი ფარავს კითხვას; დასკვნა ეყრდნობა წესებს |
| `PARTIAL` | მოიძებნა მხოლოდ ნაწილობრივ რელევანტური მასალა |
| `NOT_COVERED` | კორპუსი არ ფარავს — **პასუხი მოდელის მეხსიერებიდან არ გაიცემა** |
| `KB_UNAVAILABLE` | ბაზა არ არის იმპორტირებული |

### ემბედინგები

`EmbeddingProvider` აბსტრაქციაა ორი იმპლემენტაციით:

* **`hash`** (ნაგულისხმევი, ოფლაინ) — `gmai-hash-ngram-v1`, 384d. რეალური ვექტორული სივრცე
  რეალური კოსინუსური მსგავსებით, მაგრამ **არა ნასწავლი მოდელი**: იჭერს მორფოლოგიურ და
  ლექსიკურ მსგავსებას. ინტერფეისში ასეა მონიშნული — ზედმეტი დაპირება არ კეთდება.
* **`openai`** — `text-embedding-3-small` ან ნებისმიერი თავსებადი endpoint.

მოდელი და განზომილება ინახება ყოველ ვექტორთან, ამიტომ სივრცეები არ ერევა.

### ვერიფიკატორები

| ვერიფიკატორი | რას აკეთებს |
| --- | --- |
| Numeric | ყოველი დოზა/ზღვარი/ინტერვალი მოწმდება მოძიებულ წესებში არსებულ რიცხვებთან |
| Citation | ციტირებული ID უნდა (ა) არსებობდეს ბაზაში და (ბ) იყოს რეალურად მოძიებული; სხვაგვარად პასუხიდან იშლება |
| Freshness | `CURRENT / REFRESH_REQUIRED / OUTDATED / UNCERTAIN` |
| Contradiction | ურთიერთგამომრიცხავი წესები ჩნდება ცალ-ცალკე — **საშუალო არ გამოითვლება** |

### Safety release gate

`PASS · PASS_WITH_WARNING · HUMAN_REVIEW · BLOCK`.
R3–R5 ყოველთვის ადამიანურ მიმოხილვაზე გადის; გამოგონილი ციტირება → `BLOCK`.

### ხარისხის სავალდებულო პრინციპები (კოდში ჩაშენებული)

1. არასასურველი შედეგი ავტომატურად არ ნიშნავს დეფექტს.
2. გაიდლაინიდან გადახვევა ავტომატურად არ ნიშნავს დაუდევრობას.
3. ჩანაწერის არარსებობა არ არის იმის მტკიცებულება, რომ ქმედება არ განხორციელებულა.
4. დროითი თანმიმდევრობა არ არის მიზეზობრიობა.
5. შესაძლო დეფექტი არ არის სამართლებრივი პასუხისმგებლობა.

### შიდა გვერდები (`ENABLE_DEV_TOOLS=1`)

| მისამართი | დანიშნულება |
| --- | --- |
| `/admin/knowledge` | ცოდნის ბაზის მდგომარეობა — რეალური რაოდენობები |
| `/admin/retrieval` | ძიების დიაგნოსტიკა — სრული კვალი და ქულების დაშლა |
| `/admin/usage` | AI გამოყენება და ხარჯები |
| `/dev/ingest` | წყაროების იმპორტი |

production-ში `ENABLE_DEV_TOOLS=0`; ეს გვერდები საჯარო ნავიგაციაში არასდროს ჩანს.

### უფლებრივი დაცვა

`RESTRICTED_INTERNAL_REFERENCE` და `PROPRIETARY_INTERNAL` კორპუსი:
`knowledge-source/` და `data/` არის `.gitignore`-ში; საწყისი ტექსტი არ იგზავნება
frontend bundle-ში და არ ქვეყნდება ჩამოსატვირთად; საჯარო პასუხი სინთეზირებულია და
ციტირებულია წესის ID-ითა და provenance-ით.


---

## 4. აგენტები

21 აგენტი (A00–A20). თითოეულს აქვს `id`, `name`, `description`, `acceptedIntents`,
`requiredInputs`, `optionalInputs`, `outputSchema`, `riskClass`, `tools`,
`dependencies`, `verification` და `guardrail` — იხ. `src/agents/registry.ts`.

| ID | აგენტი | რისკი | Guardrail (მოკლედ) |
| --- | --- | --- | --- |
| A00 | Central Clinical Orchestrator | R2 | ვერიფიკაციის გვერდის ავლა აკრძალულია |
| A01 | Clinical Reasoning | R3 | მტკიცებულების გარეშე დიაგნოზი არ ყალიბდება |
| A02 | Differential Diagnosis | R3 | გამოგონილი რიცხვითი ალბათობა აკრძალულია |
| A03 | What Am I Missing? | R3 | პოტენციური გამოტოვება, არა ბრალდება |
| A04 | Challenge My Plan | R4 | პროფესიული, არააგრესიული ტონი |
| A05 | Evidence Retrieval | R1 | მხოლოდ რეესტრში არსებული წყაროები |
| A06 | Guideline Intelligence | R2 | უხილავი „საშუალო პასუხი“ აკრძალულია |
| A07 | Drug Safety & Dosing | R4 | რიცხვები დეტერმინისტული ვერიფიკაციით |
| A08 | Medication Reconciliation & Deprescribing | R4 | decision support, არა დანიშნულება |
| A09 | Clinical Calculator | R2 | LLM არითმეტიკა აკრძალულია |
| A10 | Laboratory Intelligence | R3 | რეფერენსი და კონტექსტი ყოველთვის |
| A11 | Imaging / Diagnostic Report | R3 | DICOM ანალიზი ამ ვერსიაში არ ხდება |
| A12 | Documentation | R2 | ექიმის ხელმოწერა სავალდებულო |
| A13 | Quality & Patient Safety | R3 | ბრალეულობა არ დგინდება |
| A14 | Medical Defect & Medico-Legal | R4 | მხარეს არ ირჩევს |
| A15 | Georgian Medical Context | R1 | ლოკალური და გლობალური არ ერევა |
| A16 | Patient Education | R2 | კონსერვატიული ესკალაცია |
| A17 | Medical Academy | R1 | დონეზე მორგებული პედაგოგიკა |
| A18 | Research | R1 | გამოგონილი ციტირება აკრძალულია |
| A19 | Citation & Claim Verification | R2 | დაუდასტურებელი მტკიცება არ ქვეყნდება |
| A20 | Clinical Safety Final Gate | R5 | პასუხის ბლოკირების/გადაწერის უფლება |

### რისკის კლასები

| კლასი | მნიშვნელობა | ქცევა |
| --- | --- | --- |
| R0 | ადმინისტრაციული | ვერიფიკაცია არ ესაჭიროება |
| R1 | საგანმანათლებლო / ზოგადი | citation verification |
| R2 | დაბალი რისკის კლინიკური ინფორმაცია | citation verification |
| R3 | პაციენტ-სპეციფიკური CDS | + safety gate, ადამიანური მიმოხილვა |
| R4 | მაღალი რისკის პაციენტ-სპეციფიკური | + numeric verification |
| R5 | დროით კრიტიკული / გადაუდებელი | გადაუდებელი ბლოკი პასუხის თავში |

### ახალი აგენტის დამატება

1. დაამატე `AgentSpec` `src/agents/registry.ts`-ში.
2. დაწერე `AgentImpl` `src/agents/implementations.ts`-ში და დაარეგისტრირე `AGENT_IMPLEMENTATIONS`-ში.
3. საჭიროებისას ჩასვი `MODE_AGENTS` ან `INTENT_AGENTS` რუკაში (`src/services/orchestrator.ts`).
4. დაამატე ტესტი `src/tests/governance.test.ts` და `orchestration.test.ts`-ში.

აგენტის იმპლემენტაცია მხოლოდ სერვერზე სრულდება; კლიენტი მას პირდაპირ არ იძახებს.

---

## 5. მონაცემთა მოდელი

Core objects: **Patient Context · Clinical Question · Recommendation · Evidence
Source · Drug · Defect Object · Clinical Document · Audit Event · Term**
(`src/schemas/`).

Source Registry-ის ველები:

```
source_id · title · publisher · year · publication_date · source_type ·
specialty · jurisdiction · rights_status · version · last_checked · url ·
citation_text · evidence_rank · freshness · is_current · superseded_by ·
population · key_finding · applicability · keywords · fulltext_public · excerpt
```

**Rights status:** `OPEN · PUBLIC_DOMAIN · LICENSED · INTERNAL_REFERENCE ·
RESTRICTED · UNKNOWN`. LICENSED/INTERNAL_REFERENCE/RESTRICTED/UNKNOWN წყაროების
სრული ტექსტი საჯარო ინტერფეისში **არ ქვეყნდება** — ხელმისაწვდომია მხოლოდ
მეტამონაცემები და ციტირება. UNKNOWN ნიშნავს კარანტინს უფლებრივი მიმოხილვის დასრულებამდე.

**Freshness:** `current · review_due · superseded · historical`.
`superseded` არასდროს ირანჟირება როგორც პირველადი წყარო.

### ბაზა

აპლიკაცია მუშაობს **ბაზის გარეშე**. `drizzle/0000_init.sql` და
`src/db/schema.ts` განკუთვნილია production-ისთვის:

```bash
psql "$DATABASE_URL" -f drizzle/0000_init.sql
DATABASE_URL=postgres://… npm run seed
```

pgvector: `CREATE EXTENSION vector;` შემდეგ `source_chunks.embedding vector(1536)`
და HNSW ინდექსი (SQL ფაილში კომენტარადაა).

---

## 6. AI პროვაიდერის კონფიგურაცია

```
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=
AI_MODEL_FAST=gpt-4o-mini
AI_MODEL_REASONING=gpt-4o
AI_TIMEOUT_MS=90000
```

* **MOCK MODE** (გასაღების გარეშე) — აპლიკაცია სრულად მუშაობს. ყველა გამოთვლა,
  ურთიერთქმედების შემოწმება, ლაბორატორიული ინტერპრეტაცია, მტკიცებულების ძიება,
  ციტირების ვერიფიკაცია და უსაფრთხოების ბარიერი **რეალურია**; LLM-ით სინთეზირებული
  ტექსტი ჩანაცვლებულია დეტერმინისტული შაბლონით.
* **LIVE MODE** (`AI_API_KEY` დაყენებულია) — იგივე დეტერმინისტული ბირთვი, ზემოდან
  LLM-ის სინთეზის ფენა, რომელსაც აკრძალული აქვს ახალი წყაროს, რიცხვის ან დოზის შექმნა.

ინტერფეისში ჩანს მხოლოდ პატარა `Demo` / `Live` ინდიკატორი. **API გასაღები არასდროს
ხვდება კლიენტის კოდში** — `src/services/ai-provider.ts` არის `server-only`.

პროვაიდერის შესაცვლელად საკმარისია `AI_BASE_URL`-ის მითითება ნებისმიერ
OpenAI-თავსებად endpoint-ზე; სხვა SDK-სთვის დაამატე ახალი კლასი, რომელიც
`AiProvider` ინტერფეისს აკმაყოფილებს.

---

## 7. ცოდნის ბაზის შევსება (ingestion)

Developer-only გვერდი: `/dev/ingest` (საჯარო ნავიგაციაში არ ჩანს).
ჩართვა: `ENABLE_DEV_TOOLS=1`.

Pipeline: `upload → ტექსტის ამოღება → მეტამონაცემები → zod ვალიდაცია →
chunking (900 სიმბოლო, 120 overlap) → keywords → ინდექსაცია`.

ახალი ჩანაწერი ავტომატურად იღებს `freshness: review_due` სტატუსს და
`fulltext_public` განისაზღვრება უფლებრივი სტატუსით.

---

## 8. უსაფრთხოება და კონფიდენციალობა

* login/auth არ არსებობს; **პერსონალური სამედიცინო ჩანაწერი ნაგულისხმევად არ იქმნება**
* ქეისი ინახება **მხოლოდ `sessionStorage`-ში** და იშლება ჩანართის დახურვისას
* ატვირთული ფაილები მუშავდება სერვერის მეხსიერებაში, დისკზე არ იწერება
* ყველა secret — მხოლოდ environment variables; კლიენტს არასდროს უბრუნდება
* ინტერფეისში ჩანს გაფრთხილება პაციენტის იდენტიფიკატორების შეყვანაზე
* ჯანმრთელობის მონაცემი საქართველოს კანონმდებლობით განსაკუთრებული კატეგორიისაა
* არქიტექტურა მომზადებულია RBAC/authentication-ის დამატებისთვის **რეფაქტორის გარეშე**
  (`cases` ცხრილს უკვე აქვს `owner_id`; ავტორიზაცია არის additive migration)

### რიცხვითი უსაფრთხოება

ყველა ქულა, დოზის ზღვარი, კლირენსი და ინტერვალი გამოითვლება **დეტერმინისტული
TypeScript-ით** (`src/lib/calculators.ts`, `src/lib/medication-review.ts`,
`src/lib/labs.ts`). LLM არითმეტიკა არსად არ გამოიყენება.

### ტერმინოლოგიური ბარიერი

`src/services/safety-gate.ts` ცვლის აკრძალულ ფორმულირებებს (`დანაშაული`,
`ბრალეული`, `malpractice proven`, `ექიმმა დაარღვია კანონი`, `guilty`)
ნეიტრალურით: `პოტენციური გადახვევა`, `პოტენციური დეფექტი`,
`საჭიროებს ექსპერტულ შეფასებას`.

---

## 9. ხარისხისა და დეფექტების ბირთვი

`src/knowledge/defect-classifier.ts` აკოდირებს ავტორის სახელმძღვანელოს
„სამედიცინო დახმარების ხარისხის კრიტერიუმები და დეფექტების კლასიფიკაცია“:

* **10 კლასი** (I დიაგნოსტიკური … X ეკონომიკურ-ლოგისტიკური), თითოეულს —
  განმარტება, განმასხვავებელი ნიშნები, პოტენციური შედეგები, შეფასების
  კრიტერიუმები, კონტროლის მექანიზმი, პასუხისმგებელი რგოლი, ქვეკატეგორიები
* **მიზეზების ტიპოლოგია** RCA-სთვის: ინდივიდუალური, პროცესული, სტრუქტურული,
  სისტემური, კომუნიკაციის, ეთიკური/კულტურული, კომპლექსური
* **შეფასების სტრუქტურული კითხვები** და ნეიტრალური ტერმინოლოგიის ლექსიკონი

Automated Case Audit: ქრონოლოგია → სტანდარტი → ფაქტობრივი დახმარება → გადახვევა →
კლასიფიკაცია → ზიანი/მიზეზობრიობა → CAPA → **ადამიანური მიმოხილვა**.

---

## 10. ტესტირება

```bash
npm test
```

176 ტესტი 10 ფაილში:

| ფაილი | რას ფარავს |
| --- | --- |
| `calculators.test.ts` | 18 ქულის სისწორე, დეტერმინიზმი, გამოგონილი პროცენტების არარსებობა |
| `schemas.test.ts` | zod კონტრაქტები, ყველა source და agent spec |
| `orchestration.test.ts` | intent/risk routing, red flags, planning, end-to-end workflow |
| `verification.test.ts` | citation verification, retrieval ფილტრები, safety gate |
| `clinical-engines.test.ts` | medication reconciliation, labs, drug registry, defect classifier |
| `parsing.test.ts` | PDF/DOCX/TXT/MD/CSV, error states, fact extraction |
| `governance.test.ts` | agent registry integrity, rights policy, privacy, document templates |
| `kb-engine.test.ts` | zero-trust ვალიდაცია, ემბედინგები, ჰიბრიდული ძიება, coverage gate, უფლებრივი დაცვა |
| `grounded-agents.test.ts` | A01–A04, A07 კონტრაქტები, ხარისხის hard rules, end-to-end grounding |
| `ui-language.test.ts` | ქართული UI აუდიტი — გადაუთარგმნელი ინგლისური სტრიქონი QA-ს ვარდნის |

სავალდებულო კატეგორიები დაფარულია: normal workflow · missing data · red flag ·
prohibited use · source conflict · outdated source · privacy · hallucination ·
output format · human-review escalation.

---

## 11. Deployment

### 11.1 ორი ტიერი

აპლიკაცია ერთი კოდის ბაზაა ორი გაშვების რეჟიმით, რომელსაც ცვლადი `APP_TIER` განსაზღვრავს.

| | `public` (ნაგულისხმევი — `APP_TIER` დაუყენებელი ან უცნობი) | `internal` (მხოლოდ ცხადად: `APP_TIER=internal`) |
|---|---|---|
| დანიშნულება | ღია ინტერნეტი, ტელეფონში დაყენება | კლინიკის კონტროლირებადი ინფრასტრუქტურა |
| პაციენტის AI, კალკულატორები, აკადემია, ბიბლიოთეკა | ✅ | ✅ |
| კლინიკური AI (ყველა რეჟიმი), DDx, მედიკამენტები, ლაბორატორია, დოკუმენტები | ✅ (AI — პლატფორმის ან მომხმარებლის გასაღებით) | ✅ |
| ხარისხი და დეფექტების ანალიზი (ავტორის კორპუსი) | ✅ | ✅ |
| clinical-v2 (გადაუდებელი/ინტენსიური, 51 თემა / 962 ერთეული) | ✅ | ✅ |
| Clinical Rules Master v1 (UpToDate-დან წარმოებული) | ❌ არ იტვირთება | მხოლოდ მფლობელის მიერ საკუთარი ასლიდან იმპორტის შემდეგ |
| ადამიანური განხილვის სამუშაო პროცესი | ❌ (მხოლოდ გაფრთხილება) | ✅ `/admin/review`, `REVIEWERS` |
| კურაციის ჩაწერა | ❌ | ✅ `OPERATOR_TOKEN`-ით |
| `/admin/*`, `/dev/*` | ❌ | `ENABLE_DEV_TOOLS=1`-ით (`/admin/review` — ყოველთვის internal-ში) |

საჯარო ტიერში ზღვარი სამ დამოუკიდებელ დონეზე მოქმედებს, რათა ერთის გამორჩენა საკმარისი
არ იყოს გასაჟონად:

1. `src/proxy.ts` — მოთხოვნა ჩერდება ნებისმიერ handler-ამდე (`/admin`, `/dev`, `/api/kb/*`, `/api/usage`, `/api/review/*`);
2. `/api/orchestrate` — იღებს მხოლოდ `PUBLIC_MODES`;
3. `src/kb/db.ts` — `kbExists()` აბრუნებს `false`-ს და `openDb()` აგდებს `KbUnavailableError`-ს
   მიუხედავად იმისა, არსებობს თუ არა ბაზის ფაილი დისკზე.

`.vercelignore` დამატებით კრძალავს `data/`, `knowledge-source/` და ყველა `*.sqlite` ფაილის
ატვირთვას. შემოწმებულია: კორპუსის 20 რეალური ფრაზა და 8 წესის ID — ბილდის გამოსავალში
**0 დამთხვევა**.

### 11.2 საჯარო ტიერი (Vercel)

დეტალური, ნაბიჯ-ნაბიჯ ინსტრუქცია: **[DEPLOY.md](./DEPLOY.md)**.

```bash
npm run build:public       # APP_TIER=public next build
npm run start:public
```

Vercel-ის Environment Variables: `APP_TIER=public`, `ENABLE_DEV_TOOLS=0`,
არასავალდებულოდ `AI_API_KEY`. გასაღები მხოლოდ სერვერზე რჩება.

### 11.3 PWA — ტელეფონში დაყენება

აპლიკაცია დაინსტალირდება Home Screen-იდან App Store-ის გარეშე.

- `public/manifest.webmanifest` — `display: standalone`, `lang: ka`, აიკონები 192/512 + maskable,
  სამი shortcut (პაციენტი, კალკულატორები, ბიბლიოთეკა);
- `public/sw.js` — ოფლაინ გარსი. ქეშირდება მხოლოდ სტატიკური ასეთები და უკვე გახსნილი
  გვერდები; **`/api/*` არასოდეს ქეშირდება**, რათა ძველი კლინიკური პასუხი ახლის ნაცვლად
  არასოდეს გამოჩნდეს;
- `viewportFit: cover` + `env(safe-area-inset-*)` — შიგთავსი არ ხვდება notch-ისა და
  home indicator-ის ქვეშ;
- ფორმის ველები 16px მობილურზე — iOS აღარ აზუმებს ფოკუსზე;
- `InstallHint` — iOS Safari-ზე აჩვენებს რეალურ ნაბიჯებს (Apple არ იძლევა პროგრამულ
  დაყენებას), Chrome-ზე იყენებს `beforeinstallprompt`-ს.

### 11.4 შიდა ტიერი

Next.js standalone-თავსებადი; მუშაობს ნებისმიერ Node 20+ ჰოსტინგზე. Serverless არ
გამოდგება: 77 MB SQLite ბაზა და ნატიური `better-sqlite3` მუდმივ ფაილურ სისტემას მოითხოვს.

```bash
npm ci
npm run kb:import
npm run build
NODE_ENV=production npm start        # PORT ცვლადით
```

Environment production-ში:

```
APP_TIER=internal
AI_API_KEY=…            # არასავალდებულო
DATABASE_URL=…          # არასავალდებულო
ENABLE_DEV_TOOLS=0      # production-ში აუცილებლად 0
```

რეკომენდაცია: reverse proxy TLS-ით, rate limiting `/api/orchestrate`-ზე,
და audit log-ის ჩართვა `audit_events` ცხრილში.

---

## 12. შეზღუდვები

* Source Registry სადემონსტრაციო მოცულობისაა — რეალური კლინიკური გამოყენებისთვის
  საჭიროა სრული, ლიცენზირებული კორპუსი
* ქართული რეგულაციური ჩანაწერები მონიშნულია `review_due`-ად და საჭიროებს
  ოფიციალური რედაქციის დადასტურებას
* პირდაპირი DICOM ანალიზი ამ ვერსიაში არ ხდება (L3 — ცალკე ვალიდირებული მოდული)
* დეფექტების ანალიზი არ არის სამართლებრივი კვალიფიკაცია
* დროით კრიტიკული ავტონომიური გადაწყვეტილება სისტემის ფარგლებს გარეთაა

---

## 13. ავტორი

Project Founder & Clinical Architect — **Dr. Davit Barabadze**, ნევროლოგი,
სამედიცინო დირექტორი.

> მედიცინა მტკიცებულებით. ხელოვნური ინტელექტი პასუხისმგებლობით. ცოდნა ყველასთვის.
