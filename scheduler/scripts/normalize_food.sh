#!/bin/bash
set -euo pipefail
RESP=$(curl -sS -X POST "${BACKEND_URL}/api/v1/admin/normalize-food-aliases" \
    -H "X-API-Key: ${KITCHEN_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"limit":50}')
echo "[$(date -Iseconds)] Normalize: ${RESP}"
