# BACKUP / RESTORE

## 1. რა ინახება სად

| კატეგორია | სად | backup |
|---|---|---|
| კოდი + runtime მონაცემები (515 მედიკამენტის ფაილი, ავტორის კორპუსი, clinical-v2) | source ZIP / git | release ZIP + SHA-256 + `RELEASE_MANIFEST.json` |
| ჩასაწერი მდგომარეობა: ლიმიტები, განხილვის ჩანაწერები და audit trail, შიდა KB | volume `/app/data` | `ops/backup-data.sh` |
| კურაციის რუკა | `knowledge/medications/curated-map.json` + `.changelog.jsonl` | git commit (ვერსიონირებული, revision + sha256) |
| საიდუმლოები | ჰოსტის secret store | secret store-ის საკუთარი backup; ფაილად არასოდეს |
| მფლობელის საწყისი მასალა | `C:\Users\davit\Desktop\georgian expert AI` | მფლობელის მიერ; hash-ები: `SOURCE_MATERIALS_SHA256.md` |
| პაციენტის მონაცემი | არ ინახება სერვერზე (სესია ბრაუზერში) | — |

## 2. მონაცემების backup

```bash
# Docker volume-ის ბილიკი
DATA=$(docker volume inspect gmai_gmai-data -f '{{.Mountpoint}}')
sudo ops/backup-data.sh "$DATA" /srv/backups/gmai     # → gmai-data-<UTC>.tar.gz + .sha256
```

SQLite ფაილები `sqlite3 .backup`-ით კოპირდება (თანმიმდევრული აპლიკაციის მუშაობისას); `sqlite3`-ის არქონისას გააჩერეთ კონტეინერი (`docker compose stop`) backup-ის წინ.

რეკომენდებული: ყოველდღე 03:00, 30 დღე შენახვა, ერთი ასლი სხვა ფიზიკურ ადგილას.

## 3. აღდგენა

```bash
docker compose stop
sudo ops/restore-data.sh /srv/backups/gmai/gmai-data-<UTC>.tar.gz "$DATA"     # SHA-256 მოწმდება პირველად
# არაცარიელ საქაღალდეზე: FORCE=1 — ძველი შიგთავსი გადაინაცვლებს *.before-restore-<UTC>-ში (არ იშლება)
docker compose start
curl -s http://127.0.0.1:3000/api/health/ready
```

## 4. ავტომატური შემოწმება

| შემოწმება | ბრძანება | შედეგი 2026-10-21 |
|---|---|---|
| source-ის მთლიანობა | `node scripts/release-manifest.mjs --verify RELEASE_MANIFEST.json` | ok (1056 ფაილი, 515 მედიკამენტის ინდექსი) |
| data backup → restore | `ops/backup-data.sh` → `ops/restore-data.sh`; SQLite მწკრივი და JSON იდენტური | ok |
| დაზიანებული არქივი | შეცვლილი ბაიტი → `sha256sum -c` FAILED, აღდგენა არ ხდება | ok |
| არაცარიელ საქაღალდეზე | უარი `FORCE=1`-ის გარეშე | ok |
| სუფთა Linux აღდგენა | სუფთა არქივი → `docker build` → smoke 14/14 | ok |
