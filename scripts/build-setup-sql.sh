#!/usr/bin/env bash
# Rebuilds supabase/setup/full-schema.sql (every migration, in order, as one file to paste
# into a new Supabase project's SQL editor). Run it after adding a migration.
set -euo pipefail
cd "$(dirname "$0")/.."
out=supabase/setup/full-schema.sql
{
  head -n 10 "$out"
  for f in supabase/migrations/*.sql; do
    printf '\n-- ════════════════════════════════════════════════════════════════════════════\n-- %s\n-- ════════════════════════════════════════════════════════════════════════════\n\n' "$(basename "$f")"
    cat "$f"
    printf '\n'
  done
  printf '\n-- Make the API see the new tables straight away.\nNOTIFY pgrst, '"'"'reload schema'"'"';\n'
} > "$out.tmp"
mv "$out.tmp" "$out"
echo "Wrote $out"
