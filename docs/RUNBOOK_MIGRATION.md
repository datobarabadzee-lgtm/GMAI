# RUNBOOK — მიგრაცია Vercel-იდან სხვა ჰოსტზე

ეს დოკუმენტი აღწერს გადასვლას; ამ release-ში production ჰოსტინგი/დომენი **არ** გადატანილა.

## 0. წინაპირობები

- [ ] release საქაღალდე: `GMAI_Migration_Ready_<თარიღი>` (source ZIP + SHA-256, `RELEASE_MANIFEST.json`).
- [ ] ახალი ჰოსტი `SETUP.md`-ის მიხედვით; TLS reverse proxy; DNS-ის TTL შემცირებული 300 წმ-მდე 24 სთ-ით ადრე.
- [ ] საიდუმლოები ახალი ჰოსტის secret store-ში (არასოდეს ფაილით გადატანა): `OPENAI_API_KEY`, `OPENFDA_API_KEY`, `MED_RECEIPT_SECRET`, `OPERATOR_TOKEN`, `REVIEWERS`, `LIMIT_STORE_URL/TOKEN`, `EVAL_TOKEN`.
- [ ] Vercel-ის ცვლადების სახელები (მნიშვნელობების გარეშე): `AI_MODEL_FALLBACK, APP_TIER, DAILY_BUDGET_USD, EVAL_TOKEN, OPENAI_API_KEY, OPENAI_MODEL, OPENFDA_API_KEY, RATE_LIMIT_GLOBAL_PER_MIN, RATE_LIMIT_IP_PER_DAY, RATE_LIMIT_IP_PER_WINDOW`. ახალ ჰოსტზე დაემატება: `PUBLIC_ORIGIN`, `LIMIT_STORE=file|redis`, (BYOK-only ჰოსტზე) `MED_RECEIPT_SECRET`.

## 1. მომზადება (T−1 დღე)

1. `node scripts/release-manifest.mjs --verify RELEASE_MANIFEST.json` → `ok: true`.
2. `npx tsx scripts/check-env.ts --hosting self_hosted --env-file .env.production` (ან `docker compose run --rm --no-deps gmai node_modules/.bin/tsx scripts/check-env.ts --hosting self_hosted`) → `OK`.
3. `APP_TIER=public docker compose up -d --build`.
4. `curl -s https://<ახალი>/api/health/ready` → `ready: true`; `?probe=1` → `ai_provider: reachable yes`.
5. `node scripts/smoke.mjs https://<ახალი> --expect-release <id>` → 14/14.
6. `node scripts/eval-production.mjs https://<ახალი>` → 37/37 (ხარჯი ≈ $0.08).
7. ორივე გარემოს `/api/version` ერთსა და იმავე release id-ს აჩვენებს.

## 2. გადართვა (T0)

1. ახალ ჰოსტზე `PUBLIC_ORIGIN` = საბოლოო დომენი; რესტარტი.
2. DNS: დომენის A/CNAME → ახალი ჰოსტი.
3. TLS სერტიფიკატის მიღების შემოწმება (Caddy ავტომატურად).
4. 15 წუთი: `/api/health/ready`, smoke, ჟურნალები (`docker compose logs -f`), შეცდომების სიხშირე.
5. Vercel-ის deployment რჩება ხელუხლებელი (rollback-ისთვის) მინიმუმ 14 დღე.

## 3. გადართვის შემდეგ (T+1)

- [ ] backup-ის დაგეგმვა (`BACKUP_RESTORE.md`) და პირველი აღდგენის ტესტი.
- [ ] `LIMIT_STORE` = file (ერთი ჰოსტი) ან redis (რამდენიმე) — readiness `limit_store: pass`.
- [ ] მონიტორინგი: `/api/health` ყოველ 30 წმ-ში (liveness), `/api/health/ready` ყოველ 5 წთ-ში.
- [ ] პროვაიდერის ანგარიშზე ბიუჯეტის ლიმიტი (ერთადერთი მყარი გარე ზღვარი).

## 4. უკან დაბრუნება

`ROLLBACK.md` — DNS-ის დაბრუნება Vercel-ზე (deployment არ წაშლილა).

## 5. Windows ოპერატორისთვის

Docker Desktop (WSL2) → PowerShell-ში იგივე ბრძანებები: `docker compose up -d --build`, `node scripts\smoke.mjs http://127.0.0.1:3000`. Node-ით გაშვება — `SETUP.md` 3B (PowerShell ბლოკი).
