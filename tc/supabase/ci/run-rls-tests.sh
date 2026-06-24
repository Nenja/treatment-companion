#!/usr/bin/env bash
# Run the RLS-denial tests against a throwaway local Postgres.
#
# CI runs these automatically (see .github/workflows/ci.yml -> migrations job).
# This script reproduces that locally for the developer. It needs a running
# Postgres 16 you can connect to as a superuser; it applies the CI bootstrap,
# every numbered migration (skipping ci:skip dev-seed files), the RLS test
# setup, then the assertions. Any failed assertion aborts with a non-zero exit.
#
# Usage:
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres \
#   PGDATABASE=rls_test ./supabase/ci/run-rls-tests.sh
#
# (Create the target database first; the script does not create it.)
set -euo pipefail
cd "$(dirname "$0")/../.."

PSQL="psql -v ON_ERROR_STOP=1 -q"

echo "→ bootstrap"
$PSQL -f supabase/ci/bootstrap.sql

echo "→ migrations"
for f in $(ls -1 supabase/migrations/[0-9]*.sql | sort); do
  if grep -q "ci:skip" "$f"; then continue; fi
  $PSQL -f "$f"
done

echo "→ rls test setup"
$PSQL -f supabase/ci/rls-test-setup.sql

echo "→ rls-denial assertions"
psql -v ON_ERROR_STOP=1 -f supabase/ci/rls-tests.sql
