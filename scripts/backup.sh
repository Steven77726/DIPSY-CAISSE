#!/usr/bin/env bash
# PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE are supplied by the secret manager.
# No passwords in command arguments. Only caisse_* data is included.
set -euo pipefail
umask 077
: "${PGHOST:?Set PGHOST}" "${PGUSER:?Set PGUSER}" "${PGPASSWORD:?Set PGPASSWORD}" "${PGDATABASE:?Set PGDATABASE}" "${AGE_RECIPIENT:?Set the public age recipient}"
export PGSSLMODE=require
backup_dir="${1:?Usage: backup.sh /absolute/backup-directory}"
mkdir -p "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
partial="$backup_dir/.dipsy-caisse-$stamp.partial"
trap 'rm -f "$partial"' EXIT
pg_dump --format=custom --data-only --table='public.caisse_*' --no-owner --no-privileges | age --recipient "$AGE_RECIPIENT" > "$partial"
test -s "$partial"
mv "$partial" "$backup_dir/dipsy-caisse-$stamp.dump.age"
shasum -a 256 "$backup_dir/dipsy-caisse-$stamp.dump.age" > "$backup_dir/dipsy-caisse-$stamp.sha256"
echo "Encrypted caisse-only backup created."
