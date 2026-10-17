# Moving Ember to a new Supabase project

Everything moves: accounts and passwords, profiles, posts, messages, friends, groups. Photos and
videos are already on Cloudflare R2, so they keep working without being moved. Everyone is
signed out once and signs back in with the same email and password.

About an hour. You do the dashboard steps; the database password never goes into chat or code.

## 1. Create the project
A free project needs its own **organization** (Supabase → your avatar → **New organization**,
Free plan), then **New project** in it. Region: **London (eu-west-2)**, as before. Write down
its database password.

## 2. Copy the database (GitHub does it)
1. In **each** project (old and new): **Connect** (top bar) → **Session pooler** → copy the
   connection string and put the database password in place of `[YOUR-PASSWORD]`.
   (Use Session pooler, not Direct: GitHub can't reach the direct address.)
2. GitHub → the repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `OLD_DATABASE_URL`: the old project's string
   - `NEW_DATABASE_URL`: the new project's string
3. GitHub → **Actions → Copy database → Run workflow**, type `copy`, **Run**.
   It refuses to write into a project that already has tables, and it's all or nothing: if any
   part fails, the new project is left empty and you can run it again. The last step shows how
   many accounts, posts and messages arrived.
4. Delete both secrets once it has worked.

If the old project won't let it connect while it's blocked, the first step fails with a
connection error. Then the choice is a fresh start (step 2b) or waiting for the reset.

**2b. Fresh start instead (nothing copied, everyone signs up again):** Supabase → **SQL Editor**
→ paste all of [`supabase/setup/full-schema.sql`](../supabase/setup/full-schema.sql) → **Run**.

## 3. Sign-in settings
Supabase → **Authentication**:
- **URL Configuration**: Site URL = the live address (e.g. `https://ayo-chat-xi.vercel.app`).
  Redirect URLs: `https://<your-domain>/reset-password` and `https://<your-domain>/**`.
- **Providers → Email**: turn on **Confirm email**; minimum password length 8.
- **Emails → SMTP**: copy the old project's sender settings (e.g. Resend), sender name `Ember`.

## 4. Server functions and their secrets
With the Supabase CLI (`npx supabase login`, then `npx supabase link --project-ref <new ref>`):
```
npx supabase functions deploy media-upload call-push turn-credentials send-email-notification
npx supabase functions deploy send-push --no-verify-jwt
```
Then **Edge Functions → Secrets** in the new project. Supabase never shows a secret again once
saved, so where you don't have the old value, make a new one:
- **Cloudflare R2**: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
  `R2_PUBLIC_URL` (and `R2_ENDPOINT` if you set it before). Same bucket as before. A new key is
  fine: Cloudflare → R2 → **Manage API tokens** → Object Read & Write on the bucket.
- **Push**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_WEBHOOK_SECRET`
  ([push-notifications.md](push-notifications.md)). New VAPID keys mean everyone turns
  notifications on again; if they change, update `VITE_VAPID_PUBLIC_KEY` in Vercel too.
- **Android push**: `FCM_SERVICE_ACCOUNT` ([firebase-push.md](firebase-push.md)).
- **Calls**: `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`.

Tell the database where send-push now lives (SQL Editor; the copy brought the old address):
```sql
insert into private.push_config (function_url, secret)
values ('https://<new-ref>.supabase.co/functions/v1/send-push', '<PUSH_WEBHOOK_SECRET>')
on conflict (id) do update set function_url = excluded.function_url, secret = excluded.secret;
```

## 5. Point the app at it
- **Vercel** → `ayo-chat` → **Settings → Environment Variables** (Production):
  `VITE_SUPABASE_URL` = Project Settings → API → Project URL, and
  `VITE_SUPABASE_PUBLISHABLE_KEY` = the `anon` / publishable key. Then **Redeploy**.
  (The anon key is public by design; never put the `service_role` key in Vercel.)
- **The Android app** reads the same two values from `.env` in the repo, and the project ref
  from `supabase/config.toml`: change them there (or send the new Project URL and anon key to
  Claude to do it), then build a new APK.

## 6. Check
Settings → Photo storage → **Test** (all green), sign in with an old account, post a photo,
send a message, and turn notifications on. With a fresh start (2b), sign up and make yourself
admin:
```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'you@example.com'
ON CONFLICT DO NOTHING;
```
