# ARCHITECTURE

## 1. მთლიანი სურათი

```
ბრაუზერი (Next.js UI, ქართული) ── sessionStorage: ქეისი, თანხმობა/ატესტაცია, საკუთარი გასაღები
        │ HTTPS
        ▼
src/proxy.ts ── tier-ის საზღვარი (public: /admin, /dev, /api/kb/*, /api/usage, /api/review/* არ არსებობს)
        ▼
API routes (Node runtime)
  ├─ /api/orchestrate ── processing-policy (451) → rate-limit (counter-store, ხარჯის რეზერვაცია)
  │      └─ orchestrator
  │           ├─ registry retrieval (ლექსიკური) · medication identity gate (FDA/MIS/EMA, ზუსტი)
  │           ├─ აგენტები A01–A18 (დეტერმინისტული, timeout, trace)
  │           ├─ ცოდნის ძებნა: quality corpus (BM25+ლექსიკონი) · clinical-v2 · შიდა SQLite (internal) + onTopic
  │           ├─ A00 AI სინთეზი (OpenAI Responses; შეფერხება კლასიფიცირებული)
  │           ├─ A19 ვერიფიკაცია: numeric-facts (ერთეული/პრეპარატი/გზა/სიხშირე/პოპულაცია), ციტირება, claim→passage
  │           └─ A20 release gate → release-contract (BLOCK ყველა გამოსავალზე) → trace, usage ledger
  ├─ /api/documents/generate ── processing-policy → AI → document-guard → draft
  ├─ /api/documents/export ── DOCX „პროექტი“, ხელმოწერის ცარიელი ველი
  ├─ /api/medications/*, /api/drug-summary, /api/curation/* (ჩაწერა: operator-auth)
  ├─ /api/review/* (internal: რეცენზენტის token, four-eyes, append-only)
  ├─ /api/parse (≤ 4 MB, მეხსიერებაში, არ ინახება)
  └─ /api/health (liveness) · /api/health/ready (readiness) · /api/version (release id) · /api/agents (observed)
        ▼
გარე სერვისები: OpenAI (AI) · api.fda.gov · www.ema.europa.eu · Europe PMC   (DISABLE_LIVE_SOURCES=1 → გამორთული)
```

## 2. მონაცემები

| მონაცემი | ადგილი | ცვლილება runtime-ში |
|---|---|---|
| მედიკამენტის იდენტობის ინდექსი (515 ფაილი, 27 MB gz) | `knowledge/medications` | არა (კურაციის რუკა — მხოლოდ ოპერატორი) |
| ხარისხის კორპუსი (ავტორის) | `authored/quality` | არა |
| clinical-v2 (51/962) | `authored/gmai_clinical_v2`, `public/clinical-v2` | არა |
| შიდა KB (UpToDate-დან + ავტორის) | `data/gmai-kb.sqlite` (internal, repo-ში არ არის) | იმპორტით |
| ლიმიტები/ხარჯი | counter-store: memory / `data/runtime/limits.json` / Redis | კი |
| განხილვები | `data/review/reviews.sqlite` (internal) | კი, append-only ჟურნალი |
| პაციენტის მონაცემი | მხოლოდ ბრაუზერის სესია; AI-ს გადაეცემა მხოლოდ თანხმობით/ატესტაციით | — |

## 3. გაშვების პროფილები

| | Vercel (მიმდინარე) | Docker / Node (self-hosted) |
|---|---|---|
| install | `npm ci` | `npm ci` |
| build | `npm run build` (prebuild → release manifest) | იგივე |
| headers | `next.config.mjs` | იგივე |
| ლიმიტების საცავი | memory (per-instance) | file (ერთი ჰოსტი) / redis |
| ატვირთვა | ≤ 4 MB | ≤ 4 MB (ან კონფიგურირებადი) |
| health | `/api/health`, `/api/health/ready` | იგივე + Docker HEALTHCHECK |

## 4. ხარისხის კონტროლის ჯაჭვი (P1)

1. **შემავალი**: უარყოფის ამოცნობა (`intent-text`), ერთეულების ნორმალიზაცია (`labs`), პაციენტის მონაცემის აღმოჩენა (`processing-policy`).
2. **მოძიება**: თემის ცნებები (`claim-support.onTopic`) — თემის გარეშე წესი პასუხში არ ხვდება.
3. **სინთეზი**: მხოლოდ მოწოდებული კონტექსტიდან; script drift → retry/fallback.
4. **ვერიფიკაცია**: ყოველი რიცხვი typed fact-ით; ყოველი დებულება წყაროს ფრაგმენტთან; გამოქვეყნებული წყარო = დაკავშირებული წყარო.
5. **გამოქვეყნება**: PASS / PASS_WITH_WARNING / HUMAN_REVIEW / BLOCK — `release-contract` API-ს დონეზე.
6. **აუდიტი**: `trace` (რა შესრულდა), usage ledger, internal-ში განხილვის ჟურნალი.

## 5. აგენტები

21 აგენტის მატრიცა (შემავალი → ძრავა → წყარო → გამოსავალი → ჩავარდნა → ტესტი): `AGENT_MATRIX.md`.
