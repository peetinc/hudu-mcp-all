#!/usr/bin/env bash
# fetch-swagger.sh — try to pull Hudu Swagger from your instance.
#
# Hudu hosts the Swagger UI behind admin login (Admin > API > Hudu API Documentation).
# The raw JSON spec is NOT served by a stable public endpoint, so this script
# tries a handful of conventional paths. If none of them work, log into Hudu
# as an admin, open browser DevTools → Network tab → reload the API docs page,
# find the JSON request, save it locally, and drop it in as `swagger.json`.
#
# Usage:
#   HUDU_BASE_URL=https://yourorg.huducloud.com/api/v1 ./scripts/fetch-swagger.sh
#   (HUDU_API_KEY or ~/.hudukey honored for auth, though admin session cookies
#    are what Hudu actually requires for the docs JSON.)
set -euo pipefail

BASE="${HUDU_BASE_URL:-}"
if [ -z "$BASE" ]; then
  echo "HUDU_BASE_URL not set. Example: HUDU_BASE_URL=https://yourorg.huducloud.com/api/v1" >&2
  exit 1
fi

# Strip trailing /api/v1 to get host root
ROOT="${BASE%/api/v1}"
ROOT="${ROOT%/}"

KEY="${HUDU_API_KEY:-}"
if [ -z "$KEY" ] && [ -f "$HOME/.hudukey" ]; then
  KEY="$(tr -d '[:space:]' < "$HOME/.hudukey")"
fi

CANDIDATES=(
  "$ROOT/api/v1/swagger.json"
  "$ROOT/api/v1/openapi.json"
  "$ROOT/api/swagger.json"
  "$ROOT/api/openapi.json"
  "$ROOT/swagger.json"
  "$ROOT/api-docs/swagger.json"
  "$ROOT/api-docs.json"
)

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

for URL in "${CANDIDATES[@]}"; do
  echo "Trying: $URL" >&2
  STATUS=$(curl -sS -o "$TMP" -w '%{http_code}' \
    ${KEY:+-H "x-api-key: $KEY"} \
    "$URL" || echo "000")
  if [ "$STATUS" = "200" ]; then
    if head -c 1 "$TMP" | grep -q '{'; then
      cp "$TMP" swagger.json
      echo "Saved swagger.json from $URL" >&2
      exit 0
    fi
  fi
done

cat >&2 <<'EOF'

No public Swagger endpoint found. Manual steps:
  1. Log into Hudu as an admin.
  2. Open Admin > API > Hudu API Documentation.
  3. Open browser DevTools > Network tab, reload the page.
  4. Find the request that returns the Swagger JSON (look for "swagger" or
     "openapi" in the response).
  5. Save the response body to ./swagger.json in this directory.

Then restart the MCP server.
EOF
exit 1
