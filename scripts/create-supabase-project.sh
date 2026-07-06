#!/usr/bin/env bash
# Creates a fresh Supabase project for VK Apartments and applies every
# migration in supabase-*.sql, in order, via the Supabase CLI.
#
# Usage:
#   npx supabase login                       # once, opens a browser to authenticate
#   ./scripts/create-supabase-project.sh [project-name]
#
# Optional env vars (script prompts for these if not set):
#   SUPABASE_ORG_ID       — org to create the project in
#   SUPABASE_DB_PASSWORD  — Postgres password (a random one is generated if omitted)
#   SUPABASE_REGION       — defaults to eu-west-1 (closest listed region to Zambia)
#
# Safe to re-run: each SQL file is written to be idempotent where it matters
# (supabase-realtime.sql checks before altering the publication), but running
# supabase-schema.sql twice against the same project will fail on "table
# already exists" — only re-run this whole script against a brand-new project.

set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_NAME="${1:-vk-apartments}"
REGION="${SUPABASE_REGION:-eu-west-1}"
ORG_ID="${SUPABASE_ORG_ID:-}"
DB_PASSWORD="${SUPABASE_DB_PASSWORD:-}"

SQL_FILES=(
  supabase-schema.sql
  supabase-fixes.sql
  supabase-publish-update.sql
  supabase-refactor.sql
  supabase-monitoring.sql
  supabase-hardening.sql
  supabase-error-logging.sql
  supabase-data-integrity.sql
  supabase-realtime.sql
  supabase-search-path-hardening.sql
  supabase-rls-tightening.sql
)

echo "==> Checking Supabase CLI login..."
if ! npx supabase projects list >/dev/null 2>&1; then
  echo "Not logged in. Run 'npx supabase login' first, then re-run this script."
  exit 1
fi

if [ -z "$ORG_ID" ]; then
  echo "==> Your organizations:"
  npx supabase orgs list
  echo
  read -rp "Enter the organization ID to create the project in: " ORG_ID
fi

if [ -z "$DB_PASSWORD" ]; then
  DB_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(18).toString('base64').replace(/[+/=]/g,''))")
  echo "==> Generated a database password — SAVE THIS, it won't be shown again:"
  echo "    $DB_PASSWORD"
  echo
fi

echo "==> Creating project '$PROJECT_NAME' in org $ORG_ID (region: $REGION)..."
CREATE_OUTPUT=$(npx supabase projects create "$PROJECT_NAME" --org-id "$ORG_ID" --db-password "$DB_PASSWORD" --region "$REGION" --output-format json)
echo "$CREATE_OUTPUT"
echo

PROJECT_REF=$(echo "$CREATE_OUTPUT" | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  try {
    const j = JSON.parse(d);
    console.log(j.id || j.ref || j.project_ref || j.projectRef || '');
  } catch { console.log(''); }
});")

if [ -z "$PROJECT_REF" ]; then
  echo "Couldn't auto-detect the project ref from the output above."
  read -rp "Paste the project ref manually: " PROJECT_REF
fi
echo "==> Project ref: $PROJECT_REF"

echo "==> Waiting for the project to become active (this can take a minute or two)..."
for i in $(seq 1 60); do
  STATUS=$(npx supabase projects list --output-format json 2>/dev/null | node -e "
    let d='';process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try {
        const list = JSON.parse(d).projects || [];
        const p = list.find(x => (x.id || x.ref) === process.env.PROJECT_REF);
        console.log(p ? p.status : 'UNKNOWN');
      } catch { console.log('UNKNOWN'); }
    });" PROJECT_REF="$PROJECT_REF" 2>/dev/null || echo "UNKNOWN")
  echo "  status: $STATUS"
  [ "$STATUS" = "ACTIVE_HEALTHY" ] && break
  sleep 10
done

echo "==> Linking local repo to the new project..."
npx supabase link --project-ref "$PROJECT_REF" --password "$DB_PASSWORD"

echo "==> Applying migrations in order..."
for f in "${SQL_FILES[@]}"; do
  echo "  -> $f"
  npx supabase db query --linked -f "$f"
done

echo
echo "==> API keys for this project:"
npx supabase projects api-keys --project-ref "$PROJECT_REF" --reveal

cat <<EOF

==============================================================
Done. Next steps:

1. >>> DISABLE PUBLIC SIGNUPS <<<  (do this first — security critical)
   Dashboard -> Authentication -> Sign In / Providers ->
   turn OFF "Allow new users to sign up".
   This is a staff-only app: every read policy is "any authenticated
   user", so with signups left ON (the Supabase default) anyone with the
   public anon key could self-register and read every client, booking,
   and payment. Create staff accounts yourself under Authentication ->
   Users, then set their name/role/location in the app's Settings page.

2. Copy the "anon" key from above (and the project URL,
   https://${PROJECT_REF}.supabase.co) into:
     - your local .env file (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
     - your new Vercel project's Environment Variables

3. Save the database password somewhere safe:
     ${DB_PASSWORD}

4. Run 'npm run gen:types' to generate
   src/shared/types/database.types.ts against this new project.
==============================================================
EOF
