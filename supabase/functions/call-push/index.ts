// Rings someone's phone for a call, even with Ember closed, like WhatsApp: a silent,
// high-priority Firebase message that the Android app turns into a full-screen incoming call
// (android/.../EmberMessagingService.java). "cancel" stops the ringing when the caller hangs up.
//
// Called by the signed-in caller (JWT verification on). Needs FCM_SERVICE_ACCOUNT, the same
// Firebase key as send-push. One self-contained file, so it can be pasted into the dashboard.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Same as src/lib/native/push.ts. */
const FCM_PREFIX = "https://fcm.googleapis.com/v1/ember-device/";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

let cachedToken: { value: string; until: number } | null = null;

async function googleAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.until > Date.now()) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )}`;
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${b64url(signature)}`,
    }),
  });
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status})`);
  const { access_token, expires_in } = await res.json();
  cachedToken = { value: access_token, until: Date.now() + (Number(expires_in) - 120) * 1000 };
  return access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  // Who's calling: the signed-in person making the request.
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: req.headers.get("Authorization") ?? "" },
  });
  if (!userRes.ok) return json({ error: "Not signed in" }, 401);
  const caller: { id: string } = await userRes.json();

  let body: { to?: string; action?: string; isVoiceOnly?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }
  const to = body.to;
  if (!to || !UUID_RE.test(to) || to === caller.id) return json({ error: "Invalid person" }, 400);
  const action = body.action === "cancel" ? "cancel" : "ring";

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "");
  } catch {
    return json({ error: "FCM_SERVICE_ACCOUNT isn't set" }, 500);
  }

  // Never ring through a block, either way round.
  if (action === "ring") {
    const blocked = await fetch(
      `${supabaseUrl}/rest/v1/blocks?select=id&or=(and(blocker_id.eq.${to},blocked_id.eq.${caller.id}),and(blocker_id.eq.${caller.id},blocked_id.eq.${to}))&limit=1`,
      { headers: admin },
    );
    if (blocked.ok && (await blocked.json()).length) return json({ sent: 0 });
  }

  const [devicesRes, profileRes] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/push_subscriptions?select=id,endpoint&user_id=eq.${to}&endpoint=like.${encodeURIComponent(FCM_PREFIX)}*`, { headers: admin }),
    fetch(`${supabaseUrl}/rest/v1/profiles?select=full_name,avatar_url&id=eq.${caller.id}`, { headers: admin }),
  ]);
  if (!devicesRes.ok) return json({ error: "Couldn't read devices" }, 500);
  const devices: { id: string; endpoint: string }[] = await devicesRes.json();
  const profile: { full_name: string | null; avatar_url: string | null } | undefined = profileRes.ok ? (await profileRes.json())[0] : undefined;

  // Everything as strings (Firebase data messages only carry strings).
  const data: Record<string, string> = {
    type: action === "ring" ? "call" : "call-cancel",
    callerId: caller.id,
    callerName: profile?.full_name || "Someone",
    callerAvatar: profile?.avatar_url || "",
    calleeId: to,
    isVoiceOnly: body.isVoiceOnly ? "1" : "0",
    sentAt: String(Date.now()),
    // For "Decline" without opening the app: it tells the caller through Supabase Realtime.
    realtimeUrl: `${supabaseUrl}/realtime/v1/api/broadcast`,
    anonKey,
  };

  const access = await googleAccessToken(sa);
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(devices.map(async (d) => {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: d.endpoint.slice(FCM_PREFIX.length),
          data,
          // Delivered at once, and dropped if it can't be within the time a call rings.
          android: { priority: "HIGH", ttl: action === "ring" ? "40s" : "60s" },
        },
      }),
    });
    if (res.ok) sent++;
    else {
      const detail = await res.text();
      if (res.status === 404 || detail.includes("UNREGISTERED")) gone.push(d.id);
      else console.error("call push failed", res.status, detail.slice(0, 300));
    }
  }));

  if (gone.length) {
    await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?id=in.(${gone.join(",")})`, { method: "DELETE", headers: admin });
  }
  return json({ sent });
});
