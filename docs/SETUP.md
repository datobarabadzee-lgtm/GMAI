# SETUP — გაშვება ნებისმიერ ჰოსტზე

ორი გზა: **A. Docker (რეკომენდებული)** ან **B. Node 22 პირდაპირ**. ორივე Vercel-ისგან დამოუკიდებელია.

## 0. მოთხოვნები

| | A. Docker | B. Node |
|---|---|---|
| OS | ნებისმიერი Linux x86_64 (ან Windows/macOS Docker Desktop-ით) | Linux / Windows / macOS |
| ძრავა | Docker 24+ (BuildKit), Compose v2 | Node 22.x (`.nvmrc`: 22.22.0), npm 10.9+ |
| დისკი | ~2 GB (image ~1.2 GB) | ~1.5 GB |
| ქსელი build-ისას | npm registry, deb.debian.org (build tools) | npm registry |
| ქსელი გაშვებისას | api.openai.com (თუ AI), api.fda.gov, www.ema.europa.eu, www.ebi.ac.uk | იგივე |

## 1. წყარო

```bash
unzip GMAI_source_<release>.zip -d gmai && cd gmai
node scripts/release-manifest.mjs --verify RELEASE_MANIFEST.json   # ok: true, medicationIndexFiles 515
```

## 2. გარემოს ცვლადები

```bash
cp .env.example .env.production
# შეავსეთ: APP_TIER, PUBLIC_ORIGIN, (საჭიროების მიხედვით) OPENAI_API_KEY, MED_RECEIPT_SECRET,
# OPERATOR_TOKEN, REVIEWERS, LIMIT_STORE. საიდუმლოები — მხოლოდ ჰოსტის secret store-იდან.
npx tsx scripts/check-env.ts --hosting self_hosted --env-file .env.production      # Node-ით (npm ci-ის შემდეგ)
# ან მხოლოდ Docker-ით (build-ის შემდეგ):
docker compose run --rm --no-deps gmai node_modules/.bin/tsx scripts/check-env.ts --hosting self_hosted
```

სრული სია: `ENVIRONMENT_SCHEMA.md`. შემოწმება ბეჭდავს მხოლოდ present/missing-ს.

## 3A. Docker

```bash
APP_TIER=public docker compose up -d --build        # internal: APP_TIER=internal
docker compose ps                                    # healthy
node scripts/smoke.mjs http://127.0.0.1:3000 --expect-release "$(jq -r .releaseId RELEASE_MANIFEST.json)"
```

- პორტი მხოლოდ `127.0.0.1:3000`-ზეა; წინ დააყენეთ TLS reverse proxy (Caddy / nginx) და `PUBLIC_ORIGIN=https://…`.
- ჩასაწერი მდგომარეობა (ლიმიტები, განხილვები, შიდა KB) — volume `gmai-data` → `/app/data`. image read-only-ა.
- `APP_TIER` build-ისა და გაშვების დროს ერთნაირი უნდა იყოს (compose ამას აკეთებს).
- TLS-inspecting proxy-ს მქონე ქსელში: `docker build --build-arg APT_HTTPS=1 --secret id=ca,src=<ca.pem> …`.

Caddy-ის მაგალითი:

```
gmai.example.ge {
  reverse_proxy 127.0.0.1:3000
}
```

## 3B. Node პირდაპირ

```bash
nvm use                      # 22.22.0
npm ci                       # lockfile; better-sqlite3-ისთვის საჭიროა python3, make, g++ (Linux) / VS Build Tools (Windows)
APP_TIER=public npm run build
set -a; . ./.env.production; set +a
npm start                    # PORT=3000
```

Windows PowerShell:

```powershell
npm ci
$env:APP_TIER="public"; npm run build
Get-Content .env.production | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2]) } }
npm start
```

## 4. internal ვერსია (კლინიკის სერვერი)

```bash
# მფლობელის საკუთარი ფაილებიდან — release-ში არ შედის:
mkdir -p knowledge-source
cp GMAI_Quality_Defect_Rules_Master_v1.json knowledge-source/
unzip GMAI_Clinical_Rules_Master_v1.zip -d knowledge-source/     # მხოლოდ internal; საჯაროდ არა
APP_TIER=internal EMBEDDING_PROVIDER=hash npm run kb:import      # data/gmai-kb.sqlite
npm run kb:stats                                                 # taxonomyParentsUnresolved: 0
```

Docker-ში: `knowledge-source` mount-ით და `docker compose exec gmai npm run kb:import` (KB_DB_PATH=/app/data/gmai-kb.sqlite).

## 5. შემოწმება

| ბრძანება | რა ამოწმებს |
|---|---|
| `curl /api/health` | liveness |
| `curl /api/health/ready` (`?probe=1`) | readiness: manifest, runtime assets, env, store, AI configured / reachable |
| `curl /api/version` | release id (უნდა ემთხვეოდეს `RELEASE_MANIFEST.json`-ს) |
| `node scripts/smoke.mjs <url>` | 14 შემოწმება |
| `npm test` | 565 ტესტი (44 გამოტოვებული შიდა KB-ის გარეშე) |
