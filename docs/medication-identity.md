# Medication identity service — GMAI_Medication_L5_Vercel_Lite (2026-10-19, live)

## Package
- Folder: `knowledge/medications/`. Server-only. The `.json.gz` shards stay compressed and are decompressed per request.
- Contents:
  - FDA snapshot 2026-10-16: 262,897 label IDs and 138,319 NDC IDs; 580,114 name rows;
  - MIS catalog: 29,591 entries.
- No clinical text is stored locally. Labels are fetched from openFDA by source ID.
- The runtime is the package's own `store.mjs`, unchanged. A type declaration (`store.d.mts`) was added next to it.
- Included only in the server functions that need it, via `outputFileTracingIncludes` in `next.config.mjs`.
- Bug found and fixed: `.vercelignore` had an unanchored `data/`, which would also have excluded `knowledge/medications/data`. It is now `/data/`.

## Pipeline
`src/server/medications/`:
1. Exact catalog lookup (`identity.ts`). No fuzzy matching, transliteration or embeddings.
2. Candidates, paged.
3. Card identity fields: one batched request per page, with ID, set_id and name checks.
4. Preview (`previewProduct`):
   - the record's own source, fetched by its ID;
   - ingredient/salt, strength, form and route, with label↔NDC linked only through explicit `spl_set_id` and checked for ingredient/route consistency;
   - an incomplete record cannot be confirmed.
5. Confirmation (`confirmProduct`): a server-issued receipt (`receipts.ts`) bound to:
   - the httpOnly session cookie `gmai_med_sid`;
   - the record ID and the normalized query;
   - the content SHA-256 and the linked-record hash;
   - an expiry of 15 minutes.

   The receipt is sealed with HMAC (secret: `MED_RECEIPT_SECRET`, else derived from the existing server provider key) because each Vercel route is a separate function with its own memory. A token is useless without the same session; booleans and model flags are ignored.
6. Context (`confirmedContext`): the package's `store.context()` re-checks the receipt, then the source is re-fetched and re-verified (ID, group, name, content hash, linked hash). Any change → `SOURCE_CHANGED_RECONFIRM`.

## FDA transport
`fda-client.ts`:
- fixed host, 12 s timeout, 8 MB cap;
- per-instance rate control (60/min and 800/day without a key; 200/min with a key);
- coalescing of identical in-flight requests;
- cache bounded to 10 minutes, 300 entries and 40 MB. Every read is re-verified.

`OPENFDA_API_KEY` is optional; if used, add it in Vercel → Project → Settings → Environment Variables (server only).

## Agents and routes
- **Orchestrator:** builds `MedicationGate` server-side before any agent runs (`agent-gate.ts`).
- **A07:**
  - a confirmed product → that product's own label;
  - a substance typed exactly → curated substance-level rules, labelled as such;
  - a brand, catalog-only, multi-candidate or unknown name → no dose, no label; a link to `/medications`.
- **Synthesis:**
  - a programmatic drug-name guard (`drug-name-guard.ts`): if the model names a drug that neither the user nor any agent named, its text is not published;
  - the existing numeric guard;
  - prompt rule 10 (patient-mode prompt: rule 11).
- **Polypharmacy:** name-based openFDA label lookup and the label cross-screen were removed. It now shows identities with links, plus curated interactions between exact substances and the registry interactions.
- **`/api/drug-summary`:** only with a confirmed product. Cache keyed by `record:content_sha256` (`v3`).
- **`findDrug`:** exact substance only; trade names go through `brandOnlyMatch`, with no dosing.
- **Chat thread:** sessionStorage key bumped `v2` → `v3`, so old answers built on name-matched labels are not read.

## UI
- `/medications`:
  - exact search (Georgian or English);
  - MIS catalog cards with the required message;
  - suggestions shown apart, unverified;
  - candidate cards, paged 10 per page;
  - identity grid and confirmation;
  - collapsible original sections, at most 250 KB per response;
  - Georgian summary marked as a translation;
  - a "კითხვა AI-ს ამ პროდუქტზე" link that attaches the reference to the chat.

## Verification
- Unit tests: 388 passed (22 in `medication-identity.test.ts`).
- Package `test.mjs` and `live-test.mjs` pass.
- Production regression suite: 35/35, including the new "კოლომიცინი → never colchicine" case.
- Measured sizes:
  - upload 77.0 MB (Hobby limit 100 MB);
  - largest function trace 47.4 MB, of which the index is 27.2 MB (limit 250 MB);
  - static client files 2.4 MB, with no index content.

## Open limits
- Coverage is the FDA snapshot plus the MIS name catalog. This is not all drugs, and not the Georgian registration register.
- MIS↔FDA equivalence is not verified. `unapproved-crosswalk` is unused at runtime (curator material).
- Label-text interaction screening needs confirmed products and is off.
- Receipts expire after 15 minutes. A changed source requires re-confirmation; a cached source body can lag by up to 10 minutes.
- Without `OPENFDA_API_KEY`, the openFDA quota is 1,000 requests/day per IP, and Vercel IPs are shared.
- Identity confirmation is not clinical approval. No clinical validation was performed and no prescribing is automated.

## Curator mappings (2026-10-19, live)
- **Page `/curation`** (clinician menu → „სხვა ხელსაწყოები“ → „კურატორის გვერდი“):
  - Georgian MIS name → exact FDA brand or generic name;
  - decisions: approved / rejected, with curator name, date and note;
  - approval requires the target to have selectable FDA products and the curator to tick „მოქმედი ნივთიერება და მარილი ემთხვევა“.
- **Queue:**
  - 2,050 names that the package crosswalk links to FDA by identical English name;
  - all other names reachable by search and filter;
  - placeholder entries excluded.
- **Storage:** `knowledge/medications/curated-map.json`, shipped with the deployment.
  - Local run on the owner's computer (localhost, not Vercel): „შენახვა ფაილში“ writes the file directly.
  - Public site: decisions stay in the browser (localStorage) and are exported as `gmai-curation-YYYY-MM-DD.json`. The operator merges the file and redeploys. The site cannot write.
- **Validation on every load:**
  - MIS id and Georgian name must match the catalog;
  - curator and date must be present;
  - an approved target must exist in the FDA index with selectable products.

  Invalid entries are ignored and listed on the page.
- **Effect of an approval:**
  - search for the Georgian name returns the approved FDA name's products (status `curated_mapping`, `effectiveQuery` = target);
  - the agent gate kind becomes `curator_approved`;
  - product selection and confirmation are still required, and the receipt is bound to the FDA name;
  - the Georgian name itself still cannot open a product record.
- **Effect of a rejection:** status `curator_rejected`, no products.
- **Tests:** `src/tests/medication-curation.test.ts`, 8 tests. Total: 396 passing.
