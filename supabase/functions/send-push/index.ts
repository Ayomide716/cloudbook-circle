// Delivers one alert to every phone and browser a person has allowed notifications on
// (Web Push), so it reaches them with the app closed or the phone locked.
//
// Called only by the database (see migrations/20261018090000_web_push.sql), with the shared
// secret PUSH_WEBHOOK_SECRET. Needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT.
import webpush from "npm:web-push@3.6.7";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || token !== secret) return json({ error: "Forbidden" }, 403);

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@ember.app";
  if (!publicKey || !privateKey) return json({ error: "VAPID keys are not set" }, 500);
  webpush.setVapidDetails(subject, publicKey, privateKey);

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
  const message = JSON.stringify({
    title: String(payload.title ?? "Ember").slice(0, 120),
    body: String(payload.body ?? "").slice(0, 240),
    url,
    tag: typeof payload.tag === "string" ? payload.tag.slice(0, 100) : undefined,
  });

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
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
