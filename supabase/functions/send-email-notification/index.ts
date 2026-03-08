import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { user_id, type, content, actor_name } = await req.json();

    if (!user_id || !type || !content) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user has email notifications enabled
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("push_enabled")
      .eq("user_id", user_id)
      .maybeSingle();

    // If push_enabled is explicitly false, skip
    if (prefs && prefs.push_enabled === false) {
      return new Response(JSON.stringify({ skipped: true, reason: "notifications_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user email from auth
    const { data: userData } = await supabase.auth.admin.getUserById(user_id);
    const email = userData?.user?.email;

    if (!email) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send email via Supabase's built-in email (using auth.admin)
    // For now, log the notification - in production, integrate with an email provider
    console.log(`📧 Email notification to ${email}: [${type}] ${content}`);

    return new Response(
      JSON.stringify({
        success: true,
        to: email,
        type,
        content,
        actor_name: actor_name || "Someone",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
