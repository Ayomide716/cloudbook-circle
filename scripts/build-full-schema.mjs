// Combines supabase/migrations/*.sql (in order) into supabase/full_schema.sql,
// a single file that can be pasted into the Supabase SQL Editor.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "supabase/migrations";
const header = `-- =====================================================================
-- CloudBook: complete database schema
--
-- Paste this whole file into a NEW Supabase project's SQL editor
-- (Dashboard -> SQL Editor -> New query) and click Run.
-- It creates every table, function, trigger, security policy, storage
-- bucket and realtime setting the app needs.
--
-- Generated from supabase/migrations/ (one section per migration, in order)
-- by \`npm run schema:sql\`. Run it only once, on an empty project. If you use
-- the Supabase CLI, run \`npx supabase db push\` instead of this file - don't do both.
--
-- After signing up in the app, make yourself admin:
--   INSERT INTO public.user_roles (user_id, role)
--   SELECT id, 'admin' FROM auth.users WHERE email = 'you@example.com';
-- =====================================================================
`;

const rule = "-- ---------------------------------------------------------------------";
const sections = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => `\n${rule}\n-- ${f}\n${rule}\n\n${readFileSync(join(dir, f), "utf8")}\n`);

writeFileSync("supabase/full_schema.sql", header + sections.join(""));
console.log(`Wrote supabase/full_schema.sql from ${sections.length} migrations.`);
