# Push notifications (locked phone / closed app)

Messages, group messages and everything in the Notifications tab reach people's phones
even when Ember is closed, through Web Push:

1. A phone that allows notifications saves a subscription (`push_subscriptions`, via
   `save_push_subscription`). The "Don't miss a message" banner in Messages and
   Notifications, and Settings → Notifications, ask for permission.
2. Triggers on `messages`, `group_messages` and `notifications` call the `send-push` Edge
   Function through `pg_net` (`private.queue_push`), respecting Settings → Notifications.
3. `send-push` encrypts and sends the alert to each of the person's devices, and forgets
   devices that have unsubscribed.
4. The service worker (`public/sw.js`) shows it, and opens the right chat or post when tapped.

On iPhone, Web Push only works for Ember added to the Home Screen (iOS 16.4+).

## One-time setup

1. Run `supabase/migrations/20261018090000_web_push.sql` in the SQL editor.
2. Deploy the function, with JWT verification off (the database calls it with its own secret):
   `supabase functions deploy send-push --no-verify-jwt`
   (or in the dashboard: Edge Functions → Deploy a new function → `send-push`, paste
   `supabase/functions/send-push/index.ts`, and turn off "Enforce JWT verification").
3. Make a key pair (`npx web-push generate-vapid-keys`, or any "VAPID key generator") and add
   the function's secrets (Edge Functions → Secrets):
   - `VAPID_PUBLIC_KEY`: the public key (also set it as `VITE_VAPID_PUBLIC_KEY` in Vercel and
     redeploy; until then the app keeps push off)
   - `VAPID_PRIVATE_KEY`: the private key (never in the app, Vercel or the repo)
   - `VAPID_SUBJECT`: `mailto:` + a contact address
   - `PUSH_WEBHOOK_SECRET`: a long random string
4. Tell the database where to send, with the same secret:
   ```sql
   insert into private.push_config (function_url, secret)
   values ('https://<project-ref>.supabase.co/functions/v1/send-push', '<PUSH_WEBHOOK_SECRET>')
   on conflict (id) do update set function_url = excluded.function_url, secret = excluded.secret;
   ```

Changing keys later means everyone turns notifications on again.
