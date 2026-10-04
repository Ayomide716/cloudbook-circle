const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Server-to-server only: this looks up any user's email, so callers must hold the service role key.
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (token !== serviceRoleKey) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { user_id, type, content, actor_name } = await req.json();

    if (!user_id || !type || !content) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }
    if (typeof user_id !== "string" || !UUID_RE.test(user_id)) {
      return jsonResponse({ error: "Invalid user_id" }, 400);
    }

    const adminHeaders = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };

    // Check if user has email notifications enabled
    const prefsRes = await fetch(
      `${supabaseUrl}/rest/v1/notification_preferences?select=push_enabled&user_id=eq.${user_id}`,
      { headers: adminHeaders },
    );
    const [prefs] = prefsRes.ok ? await prefsRes.json() : [];

    // If push_enabled is explicitly false, skip
    if (prefs && prefs.push_enabled === false) {
      return jsonResponse({ skipped: true, reason: "notifications_disabled" });
    }

    // Get user email from auth
    const userRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user_id}`, { headers: adminHeaders });
    const email: string | undefined = userRes.ok ? (await userRes.json()).email : undefined;

    if (!email) {
      return jsonResponse({ skipped: true, reason: "no_email" });
    }

    // For now, log the notification - in production, integrate with an email provider
    console.log(`📧 Email notification for user ${user_id}: [${type}] ${actor_name || "Someone"}: ${content}`);

    return jsonResponse({ success: true, type });
  } catch (error) {
    console.error("Error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
