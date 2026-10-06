# Moving CloudBook to a new Supabase project (fresh start)

Everyone signs up again on the new project; nothing is copied from the old one.
About an hour, all in the Supabase and Vercel dashboards.

## 1. Create the project
supabase.com → **New project**. Region: **London (eu-west-2)** is closest for Nigeria.
Free plan to start. Note: free projects **pause after a week with no activity** (restore
from the dashboard), with 500 MB of database and 1 GB of files.

## 2. Create the database (one paste)
Supabase → **SQL Editor** → **New query** → paste all of
[`supabase/setup/full-schema.sql`](../supabase/setup/full-schema.sql) → **Run**.
It creates every table, rule, function, trigger and the 8 storage buckets. Run it once, on
the empty project. (It is every file in `supabase/migrations`, in order; CI checks it stays
in step with them. Tested: the whole app's phone tests pass on a database built from it.)

## 3. Sign-in settings
Supabase → **Authentication**:
- **URL Configuration**: Site URL = your live address (e.g. `https://ayo-chat.vercel.app`).
  Redirect URLs: `https://<your-domain>/reset-password` and `https://<your-domain>/**`.
- **Providers → Email**: turn on **Confirm email**; minimum password length 8.
- **Emails → SMTP**: the built-in sender only sends a few emails an hour. For real users,
  connect a sender such as Resend (free tier) with sender name `CloudBook`.
- **Google**: leave it off for now (the "Continue with Google" button will show an error until
  it's set up), or set up a Google OAuth client pointing at the new project.

## 4. Server functions (optional, for calls on mobile data and email notifications)
With the Supabase CLI (`npx supabase login`, then `npx supabase link --project-ref <ref>`):
```
npx supabase functions deploy turn-credentials send-email-notification
npx supabase secrets set TURN_URLS=... TURN_USERNAME=... TURN_CREDENTIAL=...
```
Skip `ai-chat`: CloudBuddy is switched off (it used Lovable's AI service).

## 5. Point the app at it
Vercel → `ayo-chat` → **Settings → Environment Variables** (Production):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API → `anon` / publishable key |
| `VITE_DB_UPDATES_2026_10` | `true` (place on posts, profile details, blocking) |

Then **Deployments → ⋯ → Redeploy**. (The anon key is public by design; never put the
`service_role` key in Vercel.)

## 6. Make yourself admin
Sign up in the app, then in the SQL Editor:
```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'you@example.com'
ON CONFLICT DO NOTHING;
```

## 7. Check
Sign up (confirm the email), post with a photo, add a friend from a second account, send a
message, block and unblock someone, and use "Forgot password?". Installed apps pick up the
new project after a close and reopen; everyone is signed out once.
