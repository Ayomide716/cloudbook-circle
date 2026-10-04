# CloudBook

A social network: feed, profiles, friends, messaging, video/voice calls, groups, pages, events, stories, reels, watch, marketplace, ads and an AI companion ("CloudBuddy").

Built with React + Vite + TypeScript, Tailwind/shadcn-ui, and [Supabase](https://supabase.com) (Postgres, Auth, Storage, Realtime, Edge Functions).

## Local development

Requirements: Node.js 20+.

```sh
npm ci
cp .env.example .env   # then fill in your Supabase URL and anon/publishable key
npm run dev            # http://localhost:8080
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build into `dist/` |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (strict mode) |

## Setting up a new Supabase project

1. **Create a project** at [supabase.com/dashboard](https://supabase.com/dashboard).

2. **Create the database schema.** All tables, security policies, storage buckets and realtime settings are in `supabase/migrations/`.
   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

3. **Fill in `.env`** from *Project Settings → API*: the project URL and the anon (publishable) key.

4. **Configure auth** in *Authentication → URL Configuration*:
   - Site URL: your production URL (e.g. `https://your-domain.com`)
   - Redirect URLs: your production URL and `http://localhost:8080`

   For **Sign in with Google**, enable *Authentication → Providers → Google*, then create an OAuth client in the [Google Cloud console](https://console.cloud.google.com/apis/credentials) and use the callback URL Supabase shows there.

5. **Deploy the edge functions** and set the AI provider secrets. CloudBuddy works with any OpenAI-compatible chat API. By default it uses Google Gemini's endpoint:
   ```sh
   npx supabase secrets set AI_API_KEY=<your-key> AI_MODEL=<model-name>
   # Optional, for another provider, e.g. OpenAI:
   # npx supabase secrets set AI_API_URL=https://api.openai.com/v1/chat/completions
   npx supabase functions deploy ai-chat
   npx supabase functions deploy send-email-notification
   ```

6. **Make yourself an admin** (after signing up in the app), from the SQL editor:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'admin' FROM auth.users WHERE email = 'you@example.com';
   ```

### Regenerating database types

After changing the schema, regenerate `src/integrations/supabase/types.ts`:

```sh
npx supabase gen types typescript --linked --schema public > src/integrations/supabase/types.ts
```

## Deploying (Vercel)

Import the repo in Vercel. It detects Vite automatically; `vercel.json` handles client-side routing. Add the variables from `.env.example` under *Settings → Environment Variables*.
