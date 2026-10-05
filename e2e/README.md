# End-to-end tests

Playwright drives the real app (phone-sized) against a local Supabase built from
`supabase/migrations`. Test users and data are created fresh on each run by
`global-setup.ts`; nothing touches the live project.

```sh
npx supabase start                      # needs Docker
eval "$(npx supabase status -o env | sed 's/^/export /')"
export E2E_SUPABASE_URL=$API_URL E2E_SUPABASE_ANON_KEY=$ANON_KEY E2E_SUPABASE_SERVICE_KEY=$SERVICE_ROLE_KEY
npx playwright install chromium         # once
npm run test:e2e
```

CI does the same in `.github/workflows/ci.yml`.
