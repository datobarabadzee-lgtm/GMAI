# ROLLBACK

## 1. Vercel (მიმდინარე production)

წინა production deployment არ იშლება. დაბრუნება ერთი ბრძანებით:

```bash
npx vercel rollback <deployment-url-or-id> --token "$VERCEL_TOKEN" --scope davit9
# ან Vercel Dashboard → Project gmai-public → Deployments → წინა → „Promote to Production“
```

| deployment | როდის | შენიშვნა |
|---|---|---|
| `dpl_9wmsA9Br58iD7H2S9sazcvdBEevh` (`gmai-public-a5udppe0k-davit9.vercel.app`) | 2026-10-20 | აუდიტის გამოსწორებამდე ბოლო production — rollback-ის სამიზნე |
| ამ release-ის deployment | 2026-10-21 | იხ. `TEST_RESULTS.md` |

შემოწმება დაბრუნების შემდეგ: `curl https://gmai-public.vercel.app/api/health` (ძველ ვერსიას `/api/version` არ აქვს — 404 მოსალოდნელია).

## 2. საკუთარი ჰოსტი (Docker)

```bash
docker image ls gmai                       # ყოველი release ცალკე tag-ით: gmai:<releaseId>
docker tag gmai:<previous-release-id> gmai:release
docker compose up -d --no-build
curl -s http://127.0.0.1:3000/api/version  # წინა release id
```

build-ის წინ ყოველთვის: `docker tag gmai:release gmai:$(jq -r .releaseId RELEASE_MANIFEST.json)`.

მონაცემების დაბრუნება (თუ ახალმა ვერსიამ სქემა შეცვალა): `BACKUP_RESTORE.md` §3, release-მდე გაკეთებული backup-იდან.

## 3. DNS (მიგრაციის შემდეგ)

DNS ჩანაწერი → Vercel (`cname.vercel-dns.com`), TTL 300. Vercel-ის deployment მიგრაციიდან 14 დღე რჩება.

## 4. კურაციის რუკა

```bash
git log -- knowledge/medications/curated-map.json
git checkout <commit> -- knowledge/medications/curated-map.json
npm run med:curation-diff -- old.json knowledge/medications/curated-map.json
```

## 5. გადაწყვეტილების კრიტერიუმები

rollback, თუ ახალი ვერსია: `ready: false` 5 წუთზე მეტხანს; smoke-ის რომელიმე შემოწმება ჩავარდა; BLOCK-ის/თანხმობის კონტროლი არ მუშაობს; პაციენტის მონაცემი ჩანს ჟურნალში.
