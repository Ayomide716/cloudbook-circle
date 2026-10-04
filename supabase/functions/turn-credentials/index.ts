// Hands the TURN relay login to signed-in users when they start a call, so the
// password lives in the project's secrets instead of the website's code.
//
// Secrets (Lovable Cloud → Secrets, or `supabase secrets set`):
//   TURN_USERNAME, TURN_CREDENTIAL   required
//   TURN_URLS                        optional, comma-separated; defaults to Metered's global relay

const DEFAULT_TURN_URLS = [
  "turn:global.relay.metered.ca:80",
  "turn:global.relay.metered.ca:80?transport=tcp",
  "turn:global.relay.metered.ca:443",
  "turns:global.relay.metered.ca:443?transport=tcp",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Only signed-in users get the relay login (relay traffic is billed).
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResponse({ error: "Please sign in." }, 401);
  const userRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return jsonResponse({ error: "Please sign in." }, 401);

  const username = Deno.env.get("TURN_USERNAME");
  const credential = Deno.env.get("TURN_CREDENTIAL");
  // Not configured: the app falls back to direct connections only.
  if (!username || !credential) return jsonResponse({ iceServers: [] }, 200);

  const urls = Deno.env.get("TURN_URLS")?.split(",").map((u) => u.trim()).filter(Boolean) ?? DEFAULT_TURN_URLS;
  return jsonResponse(
    {
      iceServers: [
        { urls: "stun:stun.relay.metered.ca:80" },
        { urls, username, credential },
      ],
    },
    200,
    // Never cache a credential in a shared cache.
    { "Cache-Control": "private, no-store" }
  );
});
