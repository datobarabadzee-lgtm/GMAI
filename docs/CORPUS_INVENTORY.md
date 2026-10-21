# ცოდნის კოლექციების ინვენტარი

გენერირებულია: 2026-10-21T13:57:31.618Z — `npx tsx scripts/corpus-inventory.ts`. რიცხვები და hash-ები გამოთვლილია ფაილებიდან.

## ხარისხისა და დეფექტების კორპუსი (ავტორის სახელმძღვანელო)

- **ID:** `quality-defect-corpus`
- **მფლობელი / წარმომავლობა:** დავით ბარაბაძე — ავტორის საკუთარი მასალა
- **ნებართვა:** ავტორის საკუთრება; გამოყენება და საჯარო გავრცელება ავტორის მიერ ნებადართულია (owner statement, 2026-10-21; earlier: knowledge-base-ingestion 2026-10-15).
- **წყაროს ფაილები:** `დეფექტების_კლასიფიკატორი - DRAFT.docx`, `GMAI_Quality_Defect_Rules_Master_v1.json`, `GMAI_Quality_Defect_Rules_Master_v1.zip`
- **ვერსია:** AUTHOR_DRAFT · ingested 2026-10-15
- **ნორმალიზებული (repo):** `{"path":"authored/quality","files":6,"bytes":3230537,"sha256":"d78ca8bb330e518bc6c405af60e27d0c96b8e01f9c6bbb940213e4225303eb5a"}`
- **რაოდენობები:** `{"extracted":4482,"active":757,"activeLoaded":757,"auditQuestions":128,"taxonomyNodes":160}`
- **აქტიური (runtime):** src/knowledge/quality-corpus.ts (bundled JSON) — public and internal tiers
- **ინდექსი:** src/kb/open-corpus.ts: BM25 + Georgian/English lexicon + hash n-gram vectors (NOT learned embeddings)
- **მოძიება:** retrieveRules(kinds: quality_rule, audit_question) → orchestrator; /api/quality/audit
- **პასუხში:** A13/A14, quality mode, /defect, /quality; rule IDs verified by A19 (verifyCitations)
- **tier:** public=true, internal=true
- **გამორიცხვა / შეზღუდვა:** 3725 records are not active: 3439 QUALITY_RULE_CANDIDATE sentence extracts (traceability only) and 286 rules of an active maturity without a decidable trigger/criterion/evidence — activation policy in knowledge-base-ingestion.md.

## კლინიკური ცოდნა L5 v2 — გადაუდებელი მედიცინა / ინტენსიური თერაპია

- **ID:** `gmai_clinical_v2`
- **მფლობელი / წარმომავლობა:** მფლობელის მიერ მოწოდებული პაკეტი GMAI-CLINICAL-KNOWLEDGE-L5-v2
- **ნებართვა:** მფლობელის მიერ მოწოდებული ამ აპლიკაციისთვის; საჯარო გამოყენება ნებადართულია მფლობელის მიერ.
- **წყაროს ფაილები:** `GMAI_Clinical_Knowledge_L5_v2.zip`, `GMAI_Clinical_Knowledge_L5_v2/`
- **ვერსია:** GMAI-CLINICAL-KNOWLEDGE-L5-v2 schema 2.0 · imported 2026-10-19T11:47:30.340Z
- **ნორმალიზებული (repo):** `{"units":{"path":"authored/gmai_clinical_v2/units.json","bytes":5267534,"sha256":"084fe745654f8917ad94e30d8f4dfde8a20f032f025914cfb5d9f3e31205f86e"},"public":{"path":"public/clinical-v2","files":189,"bytes":37790064,"sha256":"06c71db37c85f1aa8eafff306988e8d5f6b3de192f6b922d431ef5da7b3e91f0"}}`
- **რაოდენობები:** `{"topics":51,"units":962,"sections":702,"items":8170,"media":137,"trainingSectionsNotImported":555,"validationSectionsNotImported":147}`
- **აქტიური (runtime):** src/knowledge/clinical-v2.ts — public and internal tiers (not in patient mode)
- **ინდექსი:** src/kb/clinical-v2-search.ts: lexical/morphological BM25 + lexicon (NOT learned embeddings)
- **მოძიება:** retrieveRules(kinds: clinical_unit) → orchestrator (quick/deep/evidence modes); /api/clinical-v2/search
- **პასუხში:** synthesis context (labelled reference material); clinicalKnowledge panel only for units linked to an answer sentence or titled on the question’s topic; /academy/clinical (51 topics, 962 units)
- **tier:** public=true, internal=true
- **გამორიცხვა / შეზღუდვა:** Package train/validation files are not imported (scripts/import-clinical-v2.mjs). No clinical validation of the content has been performed; it is labelled as reference material.

## GMAI Clinical Rules Master v1 (107 თემა / 5,464 წესი)

- **ID:** `clinical-rules-master-v1`
- **მფლობელი / წარმომავლობა:** წარმოებულია UpToDate 2022-დან (Wolters Kluwer) — მესამე მხარის საავტორო მასალა
- **ნებართვა:** პაკეტის საკუთარი მეტამონაცემები: rights_status RESTRICTED_INTERNAL_REFERENCE, public_republication=false. მფლობელის ნებართვა ფარავს მის საკუთარ მასალას; Wolters Kluwer-ის უფლებებს ვერ გადასცემს. ამიტომ საჯარო ჩართვა BLOCKED.
- **წყაროს ფაილები:** `GMAI_Clinical_Rules_Master_v1.zip`, `GMAI_Clinical_Rules_Master_v1.json`, `GMAI_UpToDate_L1_L3_Batch_*.zip`, `GMAI_UpToDate_2022_FHIR_R4_Single_Document_Bundle.json`
- **ვერსია:** UpToDate 2022 snapshot
- **ნორმალიზებული (repo):** — (repository-ში არ არის)
- **რაოდენობები:** `{"topics":107,"rules":5464,"note":"counts from the audit restore report (restore-report.json), not from files in this repository"}`
- **აქტიური (runtime):** internal tier only, after the owner runs npm run kb:import with his own copy; never shipped, never in a release archive
- **ინდექსი:** SQLite FTS5 + hash n-gram vectors (data/gmai-kb.sqlite, internal)
- **მოძიება:** retrieveRules(kinds: clinical_rule) — internal tier; public tier returns KB_UNAVAILABLE by design
- **პასუხში:** internal tier agents only
- **tier:** public=false, internal=owner-imported only
- **გამორიცხვა / შეზღუდვა:** Third-party copyrighted content (verbatim clinical_statement_internal fields). Excluded from the public tier, the repository and the release archives.

## მედიკამენტების იდენტობის ინდექსი (FDA label/NDC + MIS კატალოგი)

- **ID:** `medication-identity`
- **მფლობელი / წარმომავლობა:** GMAI_Medication_L5_Vercel_Lite (მფლობელის პაკეტი); openFDA — საჯარო; MIS — საჯარო რეესტრი
- **ნებართვა:** openFDA public domain; MIS public catalogue; package provided by the owner.
- **წყაროს ფაილები:** `GMAI_Medication_L5_Vercel_Lite.zip`, `GMAI_Medication_L5_Vercel_Lite/`
- **ვერსია:** FDA snapshot 2026-10-16
- **ნორმალიზებული (repo):** `{"path":"knowledge/medications/data","files":515,"bytes":27044684,"sha256":"9ed751969c5b716b81ead69a75fda33b56e7a165834e3054b8935ec6096dbf56"}`
- **რაოდენობები:** `{"fdaRecords":401216,"labelIds":262897,"ndcIds":138319,"misNames":29591,"curatedMappings":0,"note":"FDA/NDC records are product records, not distinct substances"}`
- **აქტიური (runtime):** knowledge/medications/store.mjs via src/server/medications/identity.ts
- **ინდექსი:** exact normalized-name shards (no fuzzy matching)
- **მოძიება:** /api/medications/*, agent gate (A07), polypharmacy
- **პასუხში:** product selection → server receipt → label text fetched live from openFDA by source ID
- **tier:** public=true, internal=true
- **გამორიცხვა / შეზღუდვა:** No clinical text is bundled; labels are fetched live. curated-map.json holds owner-reviewed MIS→FDA mappings only.

## EMA — ევროპული პროდუქტის ინფორმაცია (SmPC)

- **ID:** `ema-product-information`
- **მფლობელი / წარმომავლობა:** European Medicines Agency — საჯარო ფაილები
- **ნებართვა:** EMA public data (reuse permitted with attribution).
- **წყაროს ფაილები:** `https://www.ema.europa.eu/en/documents/report/medicines-output-medicines_json-report_en.json`, `https://www.ema.europa.eu/en/documents/report/documents-output-json-report_en.json`
- **ვერსია:** EMA files of 2026-10-20T08:12:08.051Z
- **ნორმალიზებული (repo):** `{"path":"knowledge/medications/ema","files":2,"bytes":111544,"sha256":"e1b7250a3aa2ed6cfd6d70bac79e396e1fc8f83cf865185c4b39132582614c57"}`
- **რაოდენობები:** `{"human":2357,"with_pi":1932,"authorised":1566,"authorised_with_pi":1533,"ambiguous_pi":1}`
- **აქტიური (runtime):** src/server/medications/ema.ts
- **ინდექსი:** exact name/substance index
- **მოძიება:** /api/medications/search|preview|confirm|context (EMA records), agent gate
- **პასუხში:** confirmed EU product; SmPC fetched live from www.ema.europa.eu and verified
- **tier:** public=true, internal=true
- **გამორიცხვა / შეზღუდვა:** Centrally authorised medicines only.

## კურირებული რეესტრები (კოდში)

- **ID:** `curated-registries`
- **მფლობელი / წარმომავლობა:** აპლიკაციის ავტორები; წყაროები თითოეულ ჩანაწერშია
- **ნებართვა:** n/a (application code)
- **წყაროს ფაილები:** —
- **ვერსია:** repository
- **ნორმალიზებული (repo):** `[{"path":"src/knowledge/sources.ts","bytes":44743,"sha256":"759bc7b1b70913eccede1ac3ae86ebea1048c64224b31a7d5918725c2abf087d"},{"path":"src/knowledge/drugs.ts","bytes":60284,"sha256":"36fa2070e00aac17cf5a4a818741f378be9e7410f391e8d42187dfff916590e7"},{"path":"src/knowledge/low-value-meds.ts","bytes":67276,"sha256":"d72710112326f1f9df49fe61c5f5c9efe17ac9f582be0db91d5ebb8b70158180"},{"path":"src/lib/calculators.ts","bytes":58961,"sha256":"de36bb7cad42d4b2b80a9e4f8a65fbf62a0c8ebff47390edb188055d744d8691"},{"path":"src/knowledge/georgian-context.ts","bytes":15971,"sha256":"36fc5d94c18187c628992be97192c025de00726e63781f11c7a0b441c6bb6826"},{"path":"src/kb/lexicon.ts","bytes":34413,"sha256":"35f4f530e518d483f11034b5be1671f8f186b4adb77b4872028f8b53e11be751"}]`
- **რაოდენობები:** `{"registrySources":28,"drugMonographs":27,"lowValueMeds":23,"calculators":18,"georgianTerms":8,"georgianContextNotes":7}`
- **აქტიური (runtime):** imported directly by agents
- **ინდექსი:** src/services/retrieval.ts (lexical + keywords; specific-term requirement)
- **მოძიება:** A05/A06/A07/A09/A15
- **პასუხში:** sources listed only when an answer sentence is linked to them (claim-support.ts)
- **tier:** public=true, internal=true
- **გამორიცხვა / შეზღუდვა:** —


