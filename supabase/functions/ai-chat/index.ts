// Any OpenAI-compatible chat completions endpoint works (Google Gemini, OpenAI, Groq, OpenRouter, ...).
const DEFAULT_AI_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MAX_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 4000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Only signed-in users may use the AI (it costs money per request).
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "Please sign in to chat." }, 401);
    const userRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
      headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) return jsonResponse({ error: "Please sign in to chat." }, 401);

    const AI_API_KEY = Deno.env.get("AI_API_KEY");
    const AI_MODEL = Deno.env.get("AI_MODEL");
    const AI_API_URL = Deno.env.get("AI_API_URL") || DEFAULT_AI_API_URL;
    if (!AI_API_KEY || !AI_MODEL) throw new Error("AI_API_KEY and AI_MODEL must be configured");

    const body = await req.json();
    const mood = typeof body.mood === "string" ? body.mood.slice(0, 50) : null;
    // Only pass through plain user/assistant turns, so clients can't inject system prompts.
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m: { role?: unknown; content?: unknown }) =>
        (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-MAX_MESSAGES)
      .map((m: { role: string; content: string }) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));
    if (messages.length === 0) return jsonResponse({ error: "No message to send." }, 400);

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

    const response = await fetch(AI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
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
        return new Response(JSON.stringify({ error: "CloudBuddy is out of AI credits right now. Please try again later." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI provider error:", response.status, t);
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
