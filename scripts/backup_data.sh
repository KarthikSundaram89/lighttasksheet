#!/usr/bin/env bash
# backup_data.sh
# Creates a timestamped tar.gz of the data/ folder into backups/
# Keeps the last N backups (rotate)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$HERE/.." && pwd)"   # repository root (assumes scripts/ is under project root)
DATA_DIR="$ROOT_DIR/data"
BACKUP_DIR="$ROOT_DIR/backups"
KEEP_COUNT="${KEEP_COUNT:-7}"  # keep last 7 backups by default

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
OUT_FILE="$BACKUP_DIR/sheets-backup-$TIMESTAMP.tar.gz"

if [ ! -d "$DATA_DIR" ]; then
  echo "No data directory ($DATA_DIR) found — nothing to backup." >&2
  exit 1
fi

tar -czf "$OUT_FILE" -C "$ROOT_DIR" "data"
echo "Backup created: $OUT_FILE"

# Rotate: keep only latest $KEEP_COUNT backups sorted by time
cd "$BACKUP_DIR"
ls -1t *.tar.gz 2>/dev/null | tail -n +$((KEEP_COUNT+1)) | xargs -r rm --
echo "Kept last $KEEP_COUNT backups."

# print list of backups
echo "Current backups:"
ls -1t *.tar.gz 2>/dev/null || true
