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
import { planUpload, readR2Settings } from "../_shared/media-rules.ts";

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

  const r2Settings = readR2Settings((name) => Deno.env.get(name));
  if (!r2Settings.ok) {
    // Names only (never values), so Settings → Photo storage can say which secret to fix.
    return json({ error: "not-configured", missing: r2Settings.missing, bad: r2Settings.bad }, 503);
  }
  const { accountId, accessKeyId, secretAccessKey, bucket, publicUrl } = r2Settings.settings;

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

  const endpoint = (Deno.env.get("R2_ENDPOINT") ?? `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/$/, "");
  const r2 = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });

  // Settings → Photo storage → Test: is the key right? Writes a tiny file from here (no CORS
  // involved), then hands the app a link to try the same from the phone (that's where CORS counts).
  if (body.check === true) {
    if (!/^[0-9a-f-]{36}$/i.test(user.id ?? "")) return json({ error: "Please sign in." }, 401);
    const key = `_check/${user.id}.txt`;
    let server: { ok: boolean; status: number; code?: string };
    try {
      const res = await r2.fetch(`${endpoint}/${bucket}/${key}`, { method: "PUT", headers: { "Content-Type": "text/plain" }, body: "ok" });
      const text = await res.text();
      server = { ok: res.ok, status: res.status, code: text.match(/<Code>([^<]+)<\/Code>/)?.[1] };
    } catch (e) {
      server = { ok: false, status: 0, code: e instanceof Error ? e.message.slice(0, 120) : "unreachable" };
    }
    const target = new URL(`${endpoint}/${bucket}/_check/${user.id}-app.txt`);
    target.searchParams.set("X-Amz-Expires", "600");
    const headers = { "Content-Type": "text/plain", "Cache-Control": "no-store" };
    const signed = await r2.sign(new Request(target, { method: "PUT", headers }), { aws: { signQuery: true } });
    return json({ server, bucket, uploadUrl: signed.url, headers, publicUrl: `${publicUrl}/${key}` });
  }

  const plan = planUpload(user.id ?? "", body);
  if (!plan.ok) return json({ error: plan.error }, plan.status);

  const contentType = String(body.contentType).toLowerCase();
  const target = new URL(`${endpoint}/${bucket}/${plan.key}`);
  // The link works once-ish: for 10 minutes, for this file name and these headers only.
  target.searchParams.set("X-Amz-Expires", "600");

  const headers = { "Content-Type": contentType, "Cache-Control": CACHE_CONTROL };
  const signed = await r2.sign(new Request(target, { method: "PUT", headers }), { aws: { signQuery: true } });

  return json({ uploadUrl: signed.url, headers, publicUrl: `${publicUrl}/${plan.key}` });
});
