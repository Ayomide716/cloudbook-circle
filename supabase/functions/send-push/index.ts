// Delivers one alert to every phone and browser a person has allowed notifications on, so it
// reaches them with the app closed or the phone locked:
// - browsers through Web Push (needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT);
// - the Android app through Firebase Cloud Messaging (needs FCM_SERVICE_ACCOUNT, the Firebase
//   service account key). Its devices are saved with addresses under FCM_PREFIX.
//
// Called only by the database (see migrations/20261018090000_web_push.sql), with the shared
// secret PUSH_WEBHOOK_SECRET.
import webpush from "npm:web-push@3.6.7";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Same as src/lib/native/push.ts. */
const FCM_PREFIX = "https://fcm.googleapis.com/v1/ember-device/";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

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

// Google access token for sending, kept until shortly before it runs out.
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

/** Sends to one Android phone. Returns "gone" when Firebase says the app was removed. */
async function sendFcm(
  sa: ServiceAccount,
  deviceToken: string,
  msg: { title: string; body: string; url: string; tag?: string },
): Promise<"sent" | "gone" | "failed"> {
  const access = await googleAccessToken(sa);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: deviceToken,
        notification: { title: msg.title, body: msg.body },
        data: { url: msg.url, ...(msg.tag ? { tag: msg.tag } : {}) },
        android: {
          priority: "HIGH",
          ttl: "86400s",
          // Same tag replaces the last one (e.g. a chat's newest message), as Web Push does.
          notification: { channel_id: "ember", ...(msg.tag ? { tag: msg.tag } : {}) },
        },
      },
    }),
  });
  if (res.ok) return "sent";
  const detail = await res.text();
  if (res.status === 404 || detail.includes("UNREGISTERED") || (res.status === 400 && detail.includes("registration token"))) return "gone";
  console.error("fcm failed", res.status, detail.slice(0, 300));
  return "failed";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || token !== secret) return json({ error: "Forbidden" }, 403);

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@ember.app";
  const webPushReady = !!(publicKey && privateKey);
  if (webPushReady) webpush.setVapidDetails(subject, publicKey!, privateKey!);

  let serviceAccount: ServiceAccount | null = null;
  try {
    const raw = Deno.env.get("FCM_SERVICE_ACCOUNT");
    if (raw) serviceAccount = JSON.parse(raw);
  } catch {
    console.error("FCM_SERVICE_ACCOUNT isn't valid JSON");
  }
  if (!webPushReady && !serviceAccount) return json({ error: "No push keys are set" }, 500);

  let payload: { user_id?: string; title?: string; body?: string; url?: string; tag?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }
  const userId = payload.user_id;
  if (!userId || !UUID_RE.test(userId)) return json({ error: "Invalid user_id" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  const subsRes = await fetch(
    `${supabaseUrl}/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${userId}`,
    { headers: admin },
  );
  if (!subsRes.ok) return json({ error: "Couldn't read subscriptions" }, 500);
  const subs: { id: string; endpoint: string; p256dh: string; auth: string }[] = await subsRes.json();

  // Only links inside the app.
  const url = typeof payload.url === "string" && payload.url.startsWith("/") ? payload.url : "/";
  const msg = {
    title: String(payload.title ?? "Ember").slice(0, 120),
    body: String(payload.body ?? "").slice(0, 240),
    url,
    tag: typeof payload.tag === "string" ? payload.tag.slice(0, 100) : undefined,
  };
  const message = JSON.stringify(msg);

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      if (s.endpoint.startsWith(FCM_PREFIX)) {
        if (!serviceAccount) return;
        try {
          const result = await sendFcm(serviceAccount, s.endpoint.slice(FCM_PREFIX.length), msg);
          if (result === "sent") sent++;
          else if (result === "gone") gone.push(s.id);
        } catch (err) {
          console.error("fcm failed", (err as Error).message);
        }
        return;
      }
      if (!webPushReady) return;
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message,
          { TTL: 60 * 60 * 24, urgency: "high" },
        );
        sent++;
      } catch (err) {
        // 404 / 410: the device unsubscribed or the app was removed. Forget it.
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
        else console.error("push failed", status, (err as Error).message);
      }
    }),
  );

  if (gone.length) {
    await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?id=in.(${gone.join(",")})`, {
      method: "DELETE",
      headers: admin,
    });
  }

  return json({ sent, removed: gone.length });
});
