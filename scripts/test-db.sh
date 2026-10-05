#!/usr/bin/env bash
# Lokálna testovacia DB gosko_test: shim Supabase, supabase-setup.sql,
# migrácie 001–006 a 010–015 a seedy. Iba lokálny Postgres (socket /tmp, port 5432).
# Iný názov DB (súbežné behy): GOSKO_TEST_DB=gosko_test_x.
# Nikdy sa nepripája na produkčný Supabase.
# Voliteľný argument: posledná migrácia (napr. `scripts/test-db.sh 001` = len
# setup + 001 bez seedu, stav po nasadení samotnej bezpečnostnej opravy).
set -euo pipefail

UNTIL="${1:-015}"
case "$UNTIL" in 001|002|003|004|005|006|010|011|012|013|014|015) ;; *) echo "usage: $0 [001|002|003|004|005|006|010|011|012|013|014|015]" >&2; exit 2 ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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
for f in 001_hardening 002_registration_v2 003_results_rpc 004_guardian_after_checkin 005_results_clear_nft 006_privacy \
         010_game_core 011_game_crews 012_game_loot 013_game_consent 014_main_sync 015_main_sync2; do
  run "$ROOT/supabase/migrations/$f.sql"
  [ "${f%%_*}" = "$UNTIL" ] && break
done
[ "$UNTIL" \> 005 ] && run "$ROOT/supabase/seed/events_2026.sql"
[ "$UNTIL" \> 011 ] && run "$ROOT/supabase/seed/spots_ba.sql"

echo "$DB ready"
