#!/usr/bin/env bash
# Lokálna testovacia DB gosko_test: shim Supabase, supabase-setup.sql,
# migrácie 001–004 a seed. Iba lokálny Postgres (socket /tmp, port 5432).
# Nikdy sa nepripája na produkčný Supabase.
# Voliteľný argument: posledná migrácia (napr. `scripts/test-db.sh 001` = len
# setup + 001 bez seedu, stav po nasadení samotnej bezpečnostnej opravy).
set -euo pipefail

UNTIL="${1:-004}"
case "$UNTIL" in 001|002|003|004) ;; *) echo "usage: $0 [001|002|003|004]" >&2; exit 2 ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="gosko_test"

export PGHOST=/tmp
export PGPORT=5432
export PGOPTIONS="-c client_min_messages=warning"
unset PGDATABASE PGSERVICE

dropdb --if-exists --force "$DB"
createdb "$DB"

run() {
  psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1" >/dev/null
}

run "$ROOT/supabase/test/shim.sql"
run "$ROOT/supabase-setup.sql"
for f in 001_hardening 002_registration_v2 003_results_rpc 004_guardian_after_checkin; do
  run "$ROOT/supabase/migrations/$f.sql"
  [ "${f%%_*}" = "$UNTIL" ] && break
done
[ "$UNTIL" = 004 ] && run "$ROOT/supabase/seed/events_2026.sql"

echo "gosko_test ready"
