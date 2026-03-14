import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, mood } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const moodContext = mood ? `The user's current mood is "${mood}". Adapt your tone accordingly — be extra supportive if they're sad, energetic if they're motivated, chill if they're relaxed, and fun if they're happy.` : "";

    const systemPrompt = `You are CloudBuddy, an AI companion built into CloudBook social network. You're friendly, witty, empathetic, and genuinely helpful. You're NOT a generic assistant — you're a friend.

Your personality:
- Warm and conversational, like texting a close friend
- Use emojis naturally but don't overdo it
- Give thoughtful advice when asked
- Help with brainstorming, journaling, venting, or just casual chat
- Be encouraging and positive without being fake
- Keep responses concise (2-4 sentences usually) unless the user wants more detail
- Remember context from the conversation
${moodContext}

You can help with:
- Life advice and motivation
- Creative brainstorming
- Journaling prompts
- Just being someone to talk to
- Recommendations (movies, books, music, etc.)
- Helping draft posts or messages

Never: reveal you're an AI unless directly asked, be preachy, give medical/legal advice, or be boring.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "I'm getting a lot of messages right now! Try again in a moment 😅" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits depleted. Please add credits in Settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Oops, something went wrong. Try again!" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
