#!/usr/bin/env bash
# Runs all migrations + demo seed + database test suite against a local PostgreSQL.
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres tests/db/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-hrp_test}
PSQL="psql -v ON_ERROR_STOP=1 -q -X"

$PSQL -d postgres -c "drop database if exists $DB" -c "create database $DB"
$PSQL -d "$DB" -f tests/db/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "→ applying $(basename "$f")"
  $PSQL -d "$DB" -f "$f"
done

# Demo users (in production these are created by scripts/seed-demo.mjs through the Admin API)
$PSQL -d "$DB" <<'SQL'
insert into auth.users (email, raw_app_meta_data, raw_user_meta_data) values
 ('hr.manager@demo.local', '{"role":"admin"}', '{"full_name":"Imran Qureshi"}'),
 ('team.lead@demo.local', '{"role":"team_lead"}', '{"full_name":"Fatima Raza"}'),
 ('employee1@demo.local', '{}', '{"full_name":"Ayesha Khan"}'),
 ('employee2@demo.local', '{}', '{"full_name":"Bilal Ahmed"}'),
 ('employee3@demo.local', '{}', '{"full_name":"Sana Malik"}'),
 ('employee4@demo.local', '{}', '{"full_name":"Usman Tariq"}'),
 ('employee5@demo.local', '{"role":"employee"}', '{"full_name":"Hira Siddiqui","role":"admin"}');
select public.seed_demo_data();
SQL

echo "→ running database tests"
status=0
for t in tests/db/test_*.sql; do
  if $PSQL -d "$DB" -f "$t" > /tmp/hrp_test_out.txt 2>&1; then
    echo "  ✔ $(basename "$t") ($(grep -c 'PASS' /tmp/hrp_test_out.txt || true) assertions)"
  else
    echo "  ✘ $(basename "$t")"; cat /tmp/hrp_test_out.txt; status=1
  fi
done
exit $status
