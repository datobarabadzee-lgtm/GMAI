#!/usr/bin/env sh
# Backup of the application's writable state (audit F17).
#   ops/backup-data.sh <data-dir> <backup-dir>
# data-dir: the volume mounted at /app/data (limits, review store, internal KB).
# Writes <backup-dir>/gmai-data-<UTC timestamp>.tar.gz and a .sha256 beside it.
# SQLite files are copied with sqlite3 .backup when available (consistent while
# the app runs); otherwise stop the app first.
set -eu
DATA=${1:?data dir}; OUT=${2:?backup dir}
TS=$(date -u +%Y%m%dT%H%M%SZ)
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT" "$WORK/data"
cd "$DATA"
find . -type f ! -name '*.sqlite' ! -name '*.sqlite-wal' ! -name '*.sqlite-shm' ! -name '*.lock' -exec sh -c 'mkdir -p "$2/$(dirname "$1")" && cp -p "$1" "$2/$1"' _ {} "$WORK/data" \;
for db in $(find . -type f -name '*.sqlite'); do
  mkdir -p "$WORK/data/$(dirname "$db")"
  if command -v sqlite3 >/dev/null 2>&1; then sqlite3 "$db" ".backup '$WORK/data/$db'"; else cp -p "$db" "$WORK/data/$db"; fi
done
ARCHIVE="$OUT/gmai-data-$TS.tar.gz"
tar -C "$WORK" -czf "$ARCHIVE" data
( cd "$OUT" && sha256sum "$(basename "$ARCHIVE")" > "$(basename "$ARCHIVE").sha256" )
echo "$ARCHIVE"
