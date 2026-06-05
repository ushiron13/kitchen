#!/bin/bash
set -euo pipefail
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${NAS_BACKUP_PATH}"
mkdir -p "${BACKUP_DIR}"
sqlite3 "${DB_PATH}" ".backup '${BACKUP_DIR}/app_${DATE}.db'"
gzip "${BACKUP_DIR}/app_${DATE}.db"
find "${BACKUP_DIR}" -name "app_*.db.gz" -mtime +30 -delete
echo "[$(date -Iseconds)] Backup: ${BACKUP_DIR}/app_${DATE}.db.gz"
