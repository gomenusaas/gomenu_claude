#!/usr/bin/env bash
# Runs the pgTAP suite in supabase/tests/database against the local Supabase database.
# Equivalent to `supabase test db`, but needs only psql (no extra Docker image), so it runs
# the same way locally and in CI. Fails on any "not ok", plan mismatch or SQL error.
set -euo pipefail

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/tests/database"
failed=0

for file in "$DIR"/*.test.sql; do
  name="$(basename "$file")"
  if ! output="$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -At -f "$file" 2>&1)"; then
    echo "✗ $name (SQL error)"; echo "$output" | sed 's/^/    /'; failed=1; continue
  fi
  if echo "$output" | grep -qE '^not ok|^# Looks like|^# Planned'; then
    echo "✗ $name"; echo "$output" | grep -E '^not ok|^#' | sed 's/^/    /'; failed=1
  else
    count="$(echo "$output" | grep -cE '^ok ' || true)"
    echo "✓ $name ($count assertions)"
  fi
done

exit $failed
