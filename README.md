# CloudBook

A social network: feed, profiles, friends, messaging, video/voice calls, groups, pages, events, stories, reels, watch, marketplace, ads and an AI companion ("CloudBuddy").

Built with React + Vite + TypeScript, Tailwind/shadcn-ui, and Supabase (Postgres, Auth, Storage, Realtime, Edge Functions), hosted on [Lovable](https://lovable.dev) with Lovable Cloud.

## Local development

Requirements: Node.js 20+. The `.env` file (managed by Lovable Cloud) points the app at the project's database.

```sh
npm ci
npm run dev            # http://localhost:8080
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build into `dist/` |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (strict mode) |

Changes pushed to `main` sync back to the Lovable editor.

### Optional settings

GIF search in chat uses Tenor (falling back to Giphy) with built-in default keys. To use your own keys, add them to `.env`:

```sh
VITE_TENOR_API_KEY="..."
VITE_GIPHY_API_KEY="..."
```
