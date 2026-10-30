#!/bin/sh
# ==============================================================================
# Kinship Automated Nightly Backup Script
# Dumps PostgreSQL DB + syncs media originals + prunes old backups
# ==============================================================================
set -e

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DAY_OF_WEEK=$(date +"%u")
DAY_OF_MONTH=$(date +"%d")

BACKUP_ROOT="${BACKUP_ROOT:-/data/backups}"
MEDIA_ROOT="${MEDIA_ROOT:-/data/media}"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-7}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${BACKUP_KEEP_MONTHLY:-6}"

mkdir -p "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly" "$BACKUP_ROOT/monthly" "$BACKUP_ROOT/media_mirror"

ARCHIVE_NAME="kinship_backup_${TIMESTAMP}.tar.gz"
WORK_DIR=$(mktemp -d)

echo "[$(date -Iseconds)] Starting Kinship backup: ${ARCHIVE_NAME}"

# 1. Dump PostgreSQL database in custom compressed format
if command -v pg_dump >/dev/null 2>&1 && [ -n "$PGHOST" ]; then
  pg_dump -Fc -f "$WORK_DIR/database.dump"
  echo "[$(date -Iseconds)] PostgreSQL dump completed."
else
  echo "[$(date -Iseconds)] PGHOST not set or pg_dump unavailable; backing up local pglite data if present."
  if [ -d "./data/pglite" ]; then
    cp -r "./data/pglite" "$WORK_DIR/pglite_data"
  fi
fi

# 2. Mirror media originals & thumbnails incrementally
if [ -d "$MEDIA_ROOT" ]; then
  cp -au "$MEDIA_ROOT/." "$BACKUP_ROOT/media_mirror/" 2>/dev/null || cp -r "$MEDIA_ROOT/." "$BACKUP_ROOT/media_mirror/"
fi

# 3. Create manifest & package snapshot
cat <<EOF > "$WORK_DIR/manifest.json"
{
  "timestamp": "${TIMESTAMP}",
  "createdAt": "$(date -Iseconds)",
  "database": "${PGDATABASE:-local}",
  "mediaRoot": "${MEDIA_ROOT}"
}
EOF

tar -czf "$BACKUP_ROOT/daily/$ARCHIVE_NAME" -C "$WORK_DIR" .
rm -rf "$WORK_DIR"

# 4. Promote to weekly (Sundays) and monthly (1st of month)
if [ "$DAY_OF_WEEK" = "7" ]; then
  cp "$BACKUP_ROOT/daily/$ARCHIVE_NAME" "$BACKUP_ROOT/weekly/$ARCHIVE_NAME"
fi
if [ "$DAY_OF_MONTH" = "01" ]; then
  cp "$BACKUP_ROOT/daily/$ARCHIVE_NAME" "$BACKUP_ROOT/monthly/$ARCHIVE_NAME"
fi

# 5. Retention Pruning
ls -1t "$BACKUP_ROOT/daily"/kinship_backup_*.tar.gz 2>/dev/null | tail -n +$((KEEP_DAILY + 1)) | xargs -r rm -f
ls -1t "$BACKUP_ROOT/weekly"/kinship_backup_*.tar.gz 2>/dev/null | tail -n +$((KEEP_WEEKLY + 1)) | xargs -r rm -f
ls -1t "$BACKUP_ROOT/monthly"/kinship_backup_*.tar.gz 2>/dev/null | tail -n +$((KEEP_MONTHLY + 1)) | xargs -r rm -f

BACKUP_SIZE=$(du -sh "$BACKUP_ROOT/daily/$ARCHIVE_NAME" | cut -f1)
echo "[$(date -Iseconds)] Backup finished successfully: $BACKUP_ROOT/daily/$ARCHIVE_NAME ($BACKUP_SIZE)"
