// Hands a signed-in user a one-time link to upload one photo, video or voice note straight to
// Cloudflare R2, where downloads are free (Supabase Storage charges for them as "egress").
// The file itself never passes through here; this only signs the link.
//
// Secrets (Supabase → Edge Functions → Secrets), see docs/cloudflare-r2.md:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET   the bucket and its API token
//   R2_PUBLIC_URL   where the bucket's files are served, e.g. https://pub-xxxx.r2.dev or https://media.example.com
//   R2_ENDPOINT     optional: another S3-compatible store instead of R2 (used by the tests)
//
// Until they're set, this answers 503 and the app keeps uploading to Supabase Storage.
import { AwsClient } from "../_shared/aws4fetch.js";
import { planUpload } from "../_shared/media-rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });

/** Files never change once uploaded (every upload gets a new name): let everyone keep them. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET");
  const publicUrl = Deno.env.get("R2_PUBLIC_URL")?.replace(/\/$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return json({ error: "not-configured" }, 503);
  }

  // Only signed-in users can upload.
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Please sign in." }, 401);
  const userRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return json({ error: "Please sign in." }, 401);
  const user: { id?: string } = await userRes.json();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }

  const plan = planUpload(user.id ?? "", body);
  if (!plan.ok) return json({ error: plan.error }, plan.status);

  const contentType = String(body.contentType).toLowerCase();
  const endpoint = (Deno.env.get("R2_ENDPOINT") ?? `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/$/, "");
  const target = new URL(`${endpoint}/${bucket}/${plan.key}`);
  // The link works once-ish: for 10 minutes, for this file name and these headers only.
  target.searchParams.set("X-Amz-Expires", "600");

  const r2 = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const headers = { "Content-Type": contentType, "Cache-Control": CACHE_CONTROL };
  const signed = await r2.sign(new Request(target, { method: "PUT", headers }), { aws: { signQuery: true } });

  return json({ uploadUrl: signed.url, headers, publicUrl: `${publicUrl}/${plan.key}` });
});
