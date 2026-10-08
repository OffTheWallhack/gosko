#!/usr/bin/env bash
# Lokálna testovacia DB gosko_test: shim Supabase, supabase-setup.sql,
# všetky migrácie supabase/migrations/NNN_*.sql v poradí čísla a seedy. Iba lokálny Postgres (socket /tmp, port 5432).
# Iný názov DB (súbežné behy): GOSKO_TEST_DB=gosko_test_x.
# Nikdy sa nepripája na produkčný Supabase.
# Voliteľný argument: posledná migrácia (napr. `scripts/test-db.sh 001` = len
# setup + 001 bez seedu, stav po nasadení samotnej bezpečnostnej opravy).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS=()
for f in "$ROOT"/supabase/migrations/[0-9][0-9][0-9]_*.sql; do MIGRATIONS+=("$(basename "$f" .sql)"); done
PREFIXES=" ${MIGRATIONS[*]%%_*} "
LAST="${MIGRATIONS[${#MIGRATIONS[@]}-1]%%_*}"

UNTIL="${1:-$LAST}"
case "$PREFIXES" in *" $UNTIL "*) ;; *) echo "usage: $0 [${PREFIXES// /|}]" >&2; exit 2 ;; esac
DB="${GOSKO_TEST_DB:-gosko_test}"
case "$DB" in gosko_test*) ;; *) echo "GOSKO_TEST_DB must start with gosko_test" >&2; exit 2 ;; esac

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
run "$ROOT/supabase/test/shim_game.sql"
run "$ROOT/supabase-setup.sql"
for f in "${MIGRATIONS[@]}"; do
  run "$ROOT/supabase/migrations/$f.sql"
  [ "${f%%_*}" = "$UNTIL" ] && break
done
[ "$UNTIL" \> 005 ] && run "$ROOT/supabase/seed/events_2026.sql"
[ "$UNTIL" \> 011 ] && run "$ROOT/supabase/seed/spots_ba.sql"

echo "$DB ready"
