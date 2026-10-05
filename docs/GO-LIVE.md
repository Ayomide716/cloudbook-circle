# Going live with CloudBook

The code is ready for launch. These are the steps that happen in dashboards, in order.
Each one says where to do it and how to check it worked.

## 1. Choose where the live site runs

CloudBook is deployed in two places today:

- **Vercel** (project `ayo-chat`). Connected to GitHub: every merge to `main` deploys automatically, and every PR gets a preview link.
- **Lovable** (Publish button), if you keep using Lovable's hosting.

Pick one as the real site and share only that address. Vercel is the simpler choice because it already follows `main`.
`vercel.json` now adds security headers and the right caching for it.

**Custom domain (optional):** Vercel → `ayo-chat` → Settings → Domains → add e.g. `cloudbook.app`, then add the DNS records it shows.

**Check:** open the live address on your phone, fully close and reopen the installed app, and confirm you see the new bottom tabs (Home · Friends · Reels · Groups · Notifications · your photo), with ☰ Menu at the top left.

## 2. Bring the database up to date

In Lovable → your project → Cloud → Database → SQL editor (or Supabase → SQL Editor), run each of these files from `supabase/migrations/` that hasn't been run yet, in this order:

1. `20261005120000_friend_and_member_counts.sql`: friend counts, suggestions, group member counts
2. `20261005130000_group_member_role_check.sql`: stops people making themselves admin of others' groups
3. `20261006090000_post_cover_image.sql`: cover photo for posts with several photos
4. `20261006120000_feed_newest_first.sql`: newest posts first, no repeats, expired posts hidden
5. `20261007090000_user_delete_set_null.sql`: lets accounts be deleted
6. `20261008090000_delete_my_account.sql`: the **Delete my account** button in Settings
7. `20261009090000_profile_details_post_location.sql`: hometown, birthday and relationship on profiles, and a place on posts

Each one is safe to run on the live database: it only adds or replaces functions, rules and links.

**Check:** in the app, open Settings → Delete account → the dialog opens (don't confirm), and the feed shows your newest post first.

## 3. Sign-in and email settings

Supabase / Lovable Cloud → **Authentication**:

- **URL Configuration**
  - **Site URL**: your live address, e.g. `https://ayo-chat.vercel.app` (or your custom domain).
  - **Redirect URLs**: add `https://<your-domain>/reset-password` and `https://<your-domain>/**`.
    Without these, the "Forgot password?" and confirmation emails send people to the wrong place.
- **Providers → Email**
  - Turn on **Confirm email**, so people must own the address they sign up with. The sign-up screen already tells them to check their email.
  - Set the **minimum password length** to 8 (the app asks for 8 on sign-up, reset and change).
  - Turn on **leaked password protection** if your plan has it.
- **Emails (SMTP)**
  The built-in email sender is only for testing and sends just a few emails an hour. For launch, connect a real sender (Resend, Postmark, SendGrid, …) under **SMTP Settings**, with sender name `CloudBook`.
- **Email templates**
  Optionally reword "Confirm signup" and "Reset password" to say CloudBook.
- **Google sign-in**
  If you keep "Continue with Google", add your live domain to its allowed redirect URLs.

**Check:** sign up with a real email address, then confirm. Sign out, use **Forgot password?**, open the email and set a new password.

## 4. Backend functions and their secrets

These run on Supabase / Lovable Cloud (Edge Functions). Make sure each one is deployed and its secrets are set (Cloud → Secrets):

| Function | Needs | What breaks without it |
|---|---|---|
| `turn-credentials` | `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` (your Metered.ca login) | Calls and voice rooms fail on mobile data and many home networks |
| `ai-chat` | `LOVABLE_API_KEY` | CloudBuddy (AI chat) |
| `send-email-notification` | set automatically | Email notifications |

**Check:** make a video call from your phone on **mobile data** (Wi-Fi off) to a friend on Wi-Fi. It should connect.

## 5. Final checks on a phone

- [ ] Sign up, confirm email, finish your profile
- [ ] Post with several photos: collage, then the full-screen viewer, then double-tap to like
- [ ] Add a friend, accept on the other account, send a message
- [ ] Join a group, start a voice room, see it in the stories row on the other account
- [ ] Forgot password works end to end
- [ ] Delete a test account from Settings
- [ ] Install to home screen (Share → Add to Home Screen) and open it

## 6. After launch

- **Errors:** Vercel → `ayo-chat` → Logs, and Supabase → Logs.
- **Backups:** paid Supabase plans include daily backups. Turn on point-in-time recovery once real people's data is there.
- **CI:** every PR runs lint, type check, unit tests, build and the phone end-to-end tests (GitHub → Actions). Keep `main` green.
