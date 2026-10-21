#!/usr/bin/env sh
# Restore of the writable state (audit F17).
#   ops/restore-data.sh <archive.tar.gz> <data-dir>
# Verifies the archive's SHA-256 first, refuses a non-empty target unless
# FORCE=1 (the previous content is moved aside, never deleted).
set -eu
ARCHIVE=${1:?archive}; DATA=${2:?data dir}
( cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$ARCHIVE").sha256" )
if [ -d "$DATA" ] && [ -n "$(ls -A "$DATA" 2>/dev/null)" ]; then
  [ "${FORCE:-0}" = 1 ] || { echo "target $DATA is not empty; set FORCE=1 to move it aside" >&2; exit 2; }
  mv "$DATA" "$DATA.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
fi
mkdir -p "$DATA"
tar -C "$DATA" --strip-components=1 -xzf "$ARCHIVE"
echo "restored into $DATA"
