#!/bin/sh
# ==============================================================================
# Kinship Disaster Recovery & Restore Script
# Usage: ./scripts/restore.sh /data/backups/daily/kinship_backup_YYYYMMDD_HHMMSS.tar.gz
# ==============================================================================
set -e

ARCHIVE_PATH="$1"
BACKUP_ROOT="${BACKUP_ROOT:-/data/backups}"
MEDIA_ROOT="${MEDIA_ROOT:-/data/media}"

if [ -z "$ARCHIVE_PATH" ]; then
  echo "Usage: $0 <path-to-backup-archive.tar.gz>"
  echo "Available daily backups:"
  ls -lh "$BACKUP_ROOT/daily/" 2>/dev/null || true
  exit 1
fi

if [ ! -f "$ARCHIVE_PATH" ]; then
  echo "Error: Archive not found at $ARCHIVE_PATH"
  exit 1
fi

WORK_DIR=$(mktemp -d)
echo "[$(date -Iseconds)] Extracting backup archive $ARCHIVE_PATH..."
tar -xzf "$ARCHIVE_PATH" -C "$WORK_DIR"

if [ -f "$WORK_DIR/manifest.json" ]; then
  echo "Backup Manifest:"
  cat "$WORK_DIR/manifest.json"
fi

# 1. Restore Database
if [ -f "$WORK_DIR/database.dump" ] && command -v pg_restore >/dev/null 2>&1; then
  echo "[$(date -Iseconds)] Restoring PostgreSQL database..."
  pg_restore --clean --if-exists --no-owner -d "${PGDATABASE:-kinship}" "$WORK_DIR/database.dump"
  echo "[$(date -Iseconds)] PostgreSQL database restored."
elif [ -d "$WORK_DIR/pglite_data" ]; then
  echo "[$(date -Iseconds)] Restoring local PGlite database..."
  rm -rf ./data/pglite
  mkdir -p ./data
  cp -r "$WORK_DIR/pglite_data" ./data/pglite
fi

# 2. Restore Media Mirror
if [ -d "$BACKUP_ROOT/media_mirror" ]; then
  echo "[$(date -Iseconds)] Restoring media files to $MEDIA_ROOT..."
  mkdir -p "$MEDIA_ROOT"
  cp -r "$BACKUP_ROOT/media_mirror/." "$MEDIA_ROOT/"
  echo "[$(date -Iseconds)] Media files restored."
fi

rm -rf "$WORK_DIR"
echo "[$(date -Iseconds)] Restore completed successfully!"
