# Photos and videos on Cloudflare R2

Every time someone views a photo, video or voice note, it's downloaded from wherever it's stored.
On Supabase Storage those downloads count as "egress" and run out on the free plan. On Cloudflare
R2, downloads are free (storage is free up to 10 GB, then about $0.015 per GB a month).

Once R2 is set up, **new uploads go to R2**. Files uploaded before keep working from Supabase.
Until it's set up (or if R2 can't be reached), uploads go to Supabase as before, so nothing breaks
in between.

How it works: the app asks the `media-upload` function for a one-time upload link (only signed-in
users get one, and the name is chosen by the server under the uploader's id), then sends the file
straight to R2. The function never sees the file, and your R2 keys never leave Supabase.

## Set it up (about 10 minutes)

### 1. Cloudflare: make the bucket

1. Sign up or log in at **dash.cloudflare.com**, then open **R2 Object Storage** in the sidebar.
   Cloudflare may ask for a card to turn R2 on. The free allowance still applies.
2. **Create bucket** → name it `ember-media` → **Create bucket**.
3. In the bucket, open **Settings**:
   - **Public access → R2.dev subdomain → Allow**. Copy the address it shows
     (like `https://pub-1234abcd.r2.dev`). This is your **R2_PUBLIC_URL**.
     (Later, with your own domain on Cloudflare, use **Custom Domains** instead. r2.dev is
     rate-limited and meant for getting started.)
   - **CORS policy → Edit**, paste this, and save. It lets the website and the Android app upload:

     ```json
     [
       {
         "AllowedOrigins": ["https://ayo-chat-xi.vercel.app", "https://localhost", "http://localhost:8080"],
         "AllowedMethods": ["PUT", "GET", "HEAD"],
         "AllowedHeaders": ["content-type", "cache-control"],
         "MaxAgeSeconds": 3600
       }
     ]
     ```

     If the website also has another address (your own domain), add it to `AllowedOrigins`.

### 2. Cloudflare: make a key for the bucket

1. Back on **R2 Object Storage**, click **Manage API tokens** (or **API → Manage API tokens**)
   → **Create API token**.
2. Permissions: **Object Read & Write**. Under **Specify bucket(s)** pick **ember-media** only.
3. **Create API token**. Copy the **Access Key ID** and **Secret Access Key** now (the secret is
   shown once). Also copy your **Account ID** (on the R2 overview page, right side).

### 3. Supabase: add the function

Either with the CLI:

```sh
supabase functions deploy media-upload
```

or in the dashboard: **Edge Functions → Deploy a new function → Via editor**, name it
`media-upload`, delete the sample code, paste the whole of
`supabase/functions/media-upload/dashboard-paste.ts`, and **Deploy**. Leave "Verify JWT" on.

### 4. Supabase: add the secrets

**Edge Functions → Secrets** (or **Project Settings → Edge Functions**), add:

| Name | Value |
| --- | --- |
| `R2_ACCOUNT_ID` | your Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | the Access Key ID |
| `R2_SECRET_ACCESS_KEY` | the Secret Access Key |
| `R2_BUCKET` | `ember-media` |
| `R2_PUBLIC_URL` | the r2.dev address from step 1 (no slash at the end) |

That's it. To check, open **Settings → App → Photo storage → Test** in the app. It goes through
each link in turn and says which one is wrong: a missing secret, a wrong key, the CORS policy
missing your address, or a wrong public address. The card also says where your last upload went
and, if it wasn't R2, why.

(After changing the function, paste the new `dashboard-paste.ts` again and **Deploy**: the test
needs the latest version.)

## Good to know

- **Never paste the Secret Access Key into the app, Vercel or GitHub.** It belongs only in
  Supabase's secrets.
- If an upload to R2 fails (for example the CORS policy is missing your website's address), the
  app quietly uploads that file to Supabase instead and tries R2 again 10 minutes later.
- Files uploaded before R2 was set up: **Admin → Move old media to Cloudflare** copies them to R2
  and updates the links (needs the latest `media-upload` pasted). Safe to run again; anything it
  can't move keeps loading from Supabase. The old copies stay in Supabase.
- Deleting a post doesn't delete its file from R2 yet. Storage is cheap, and old files don't cost
  downloads unless someone views them.
- Developers: after changing `supabase/functions/media-upload/index.ts` or
  `supabase/functions/_shared/`, run `node scripts/bundle-media-upload.mjs` to update the pasteable
  file (CI checks it's up to date).
