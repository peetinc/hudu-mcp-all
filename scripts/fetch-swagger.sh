#!/usr/bin/env bash
# fetch-swagger.sh — pull Hudu Swagger spec from your instance.
#
# Hudu serves the spec at /api-docs.json behind admin SESSION auth (cookie),
# not API-key auth. This script:
#   1. Tries x-api-key (will 401 — Hudu doesn't accept API keys for the docs)
#   2. Tries a session cookie if HUDU_SESSION_COOKIE is set
#   3. Falls back to manual instructions
#
# Usage:
#   HUDU_BASE_URL=https://yourorg.huducloud.com/api/v1 ./scripts/fetch-swagger.sh
#
#   With cookie (recommended):
#     1. Log into Hudu as admin in your browser.
#     2. Open DevTools > Application > Cookies > yourorg.huducloud.com
#     3. Copy the value of _hudu_session
#     4. HUDU_SESSION_COOKIE='_hudu_session=...' ./scripts/fetch-swagger.sh
set -euo pipefail

BASE="${HUDU_BASE_URL:-}"
if [ -z "$BASE" ]; then
  echo "HUDU_BASE_URL not set. Example: HUDU_BASE_URL=https://yourorg.huducloud.com/api/v1" >&2
  exit 1
fi

ROOT="${BASE%/api/v1}"
ROOT="${ROOT%/}"

KEY="${HUDU_API_KEY:-}"
SESSION="${HUDU_SESSION_COOKIE:-}"

CANDIDATES=(
  "$ROOT/api-docs.json"
  "$ROOT/api-docs/v1.json"
  "$ROOT/api/v1/swagger.json"
  "$ROOT/api/v1/openapi.json"
  "$ROOT/api/swagger.json"
  "$ROOT/api/openapi.json"
  "$ROOT/swagger.json"
)

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

try_fetch() {
  local url="$1" auth_kind="$2"
  local headers=()
  case "$auth_kind" in
    key) headers+=(-H "x-api-key: $KEY") ;;
    cookie) headers+=(-H "cookie: $SESSION") ;;
    both)
      headers+=(-H "x-api-key: $KEY")
      headers+=(-H "cookie: $SESSION")
      ;;
  esac
  local status
  status=$(curl -sS -L -o "$TMP" -w '%{http_code}' "${headers[@]}" "$url" 2>/dev/null || echo "000")
  echo "  $auth_kind → HTTP $status" >&2
  if [ "$status" = "200" ]; then
    if head -c 1 "$TMP" 2>/dev/null | grep -q '{'; then
      cp "$TMP" swagger.json
      local bytes
      bytes=$(wc -c < swagger.json | tr -d ' ')
      echo "Saved swagger.json ($bytes bytes) from $url" >&2
      exit 0
    fi
  fi
  return 1
}

for URL in "${CANDIDATES[@]}"; do
  echo "Trying: $URL" >&2
  if [ -n "$SESSION" ]; then
    try_fetch "$URL" cookie || true
  fi
  if [ -n "$KEY" ]; then
    try_fetch "$URL" key || true
  fi
done

cat >&2 <<'EOF'

No Swagger endpoint succeeded. Hudu serves /api-docs.json but requires an
admin session cookie. Options:

OPTION A — pass session cookie:
  1. Log into Hudu as admin in your browser.
  2. DevTools > Application > Cookies > yourorg.huducloud.com
  3. Copy the _hudu_session value.
  4. Re-run with:
     HUDU_SESSION_COOKIE='_hudu_session=<value>' \
     HUDU_BASE_URL=https://yourorg.huducloud.com/api/v1 \
     ./scripts/fetch-swagger.sh

OPTION B — save from browser:
  1. Log into Hudu as admin.
  2. Visit: https://yourorg.huducloud.com/api-docs.json
  3. Save the JSON body as ./swagger.json

Then restart the MCP server.
EOF
exit 1
