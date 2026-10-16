/**
 * "Test push notifications" (Admin dashboard): goes through every link between this phone and
 * a notification on its lock screen, and says which one is broken. The server part needs
 * supabase/migrations/20261020100000_push_test.sql.
 */
import { supabase } from "@/integrations/supabase/client";
import { isNative } from "@/lib/native/platform";
import { nativePushAvailable, nativePushPermission, nativePushReady } from "@/lib/native/push";
import { pushPermission, pushSupported } from "@/lib/web-push";

export interface PushTestStep {
  ok: boolean;
  text: string;
}

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;

interface Setup {
  setup: boolean;
  config?: boolean;
  fcm: number;
  web: number;
  push_enabled: boolean;
  request?: number;
  function_url?: string;
}
interface Answer {
  status: number | null;
  body: string | null;
  error: string | null;
  timed_out: boolean | null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function testPush(): Promise<{ ok: boolean; steps: PushTestStep[] }> {
  const steps: PushTestStep[] = [];
  const fail = (text: string) => { steps.push({ ok: false, text }); return { ok: false, steps }; };
  const pass = (text: string) => steps.push({ ok: true, text });

  // 1. This phone or browser.
  if (isNative) {
    await nativePushReady;
    if (!nativePushAvailable()) return fail("This app version can't get notifications. Install the newest APK (1.2 or later).");
    pass("This app version can get notifications.");
    if (nativePushPermission() !== "granted") return fail("Notifications aren't allowed on this phone. Turn on Settings → Notifications → \"Notifications on this device\".");
    pass("Notifications are allowed on this phone.");
  } else {
    if (!pushSupported()) return fail("This browser can't get push notifications (or VITE_VAPID_PUBLIC_KEY isn't set for the website).");
    if (pushPermission() !== "granted") return fail("Notifications aren't allowed in this browser. Turn them on in Settings → Notifications.");
    pass("Notifications are allowed in this browser.");
  }

  // 2. The database: is push set up, and is this device saved for you?
  const { data, error } = await rpc("push_test");
  if (error) return fail(/push_test/.test(error.message) ? "The push test isn't installed. Run the push test SQL in Supabase." : `The database said: ${error.message}`);
  const setup = data as Setup;
  if (!setup.setup) return fail("Push was never set up on the server. Run supabase/migrations/20261018090000_web_push.sql (docs/push-notifications.md, step 1).");
  if (!setup.config) return fail("The database doesn't know where send-push is. Do step 4 of docs/push-notifications.md (insert into private.push_config …).");
  pass("The database knows where send-push is.");
  const here = isNative ? setup.fcm : setup.web;
  if (here === 0) return fail(isNative ? "This phone isn't saved for your account. Turn \"Notifications on this device\" off and on again in Settings." : "This browser isn't saved for your account. Turn notifications off and on again in Settings.");
  pass(`Saved for your account: ${setup.fcm} ${setup.fcm === 1 ? "phone" : "phones"}, ${setup.web} ${setup.web === 1 ? "browser" : "browsers"}.`);
  if (!setup.push_enabled) return fail("Notifications are paused for your account. Turn them on in Settings → Notifications.");

  // 3. send-push's answer.
  let answer: Answer | null = null;
  for (let i = 0; i < 10 && !answer; i++) {
    await wait(1000);
    const res = await rpc("push_test_result", { _request: setup.request });
    answer = (res.data as Answer | null) ?? null;
  }
  const where = setup.function_url ?? "send-push";
  if (!answer) return fail(`send-push didn't answer within 10 seconds. Check the address in private.push_config (${where}).`);
  if (answer.timed_out || answer.error) return fail(`Couldn't reach send-push at ${where}: ${answer.error ?? "timed out"}.`);
  const body = answer.body ?? "";
  if (answer.status === 404) return fail(`send-push isn't deployed (404 at ${where}).`);
  if (answer.status === 401) return fail("send-push refused the database: turn off \"Enforce JWT verification\" on send-push.");
  if (answer.status === 403) return fail("send-push refused the database's secret: PUSH_WEBHOOK_SECRET in Edge Function secrets must match the secret in private.push_config.");
  if (answer.status !== 200) {
    if (/No push keys/.test(body)) return fail("send-push has no keys: add the FCM_SERVICE_ACCOUNT secret (the Firebase service account JSON).");
    return fail(`send-push answered ${answer.status}: ${body.slice(0, 200)}`);
  }
  pass("send-push answered.");
  interface Kind { devices: number; sent: number; configured: boolean; error: string }
  let result: { sent?: number; removed?: number; fcm?: Kind; web?: Kind } = {};
  try { result = JSON.parse(body); } catch { /* shown below */ }
  if (!result.fcm || !result.web) {
    return fail("send-push is an older version. Paste the newest supabase/functions/send-push/index.ts into Supabase and deploy it.");
  }
  const mine = isNative ? result.fcm : result.web;
  const other = isNative ? result.web : result.fcm;
  if (other && other.sent > 0) pass(`Reached your ${isNative ? "browsers" : "phones"} (${other.sent}).`);
  if (!mine.configured) {
    return fail(isNative
      ? "send-push has no Firebase key: add the FCM_SERVICE_ACCOUNT secret (the whole service account JSON) in Edge Functions → Secrets, then test again."
      : "send-push has no Web Push keys (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).");
  }
  if (mine.sent === 0) {
    if (result.removed) return fail("Firebase says this device's registration is gone. Turn notifications off and on again in Settings, then test again.");
    return fail(`${isNative ? "Firebase" : "Web Push"} didn't deliver to this device. ${mine.error || "Check send-push's Logs."}`);
  }
  pass(`Sent to this ${isNative ? "phone" : "browser"}. It should arrive in a few seconds.`);
  return { ok: true, steps };
}
