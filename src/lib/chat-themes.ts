import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { features } from "@/lib/features";

/**
 * A chat's theme, the same for both people (as on Messenger): who picked it is saved with it,
 * and the other person's chat changes live. Kept in chat_themes, one row per pair of people.
 */
const pair = (me: string, other: string) => (me < other ? { user_a: me, user_b: other } : { user_a: other, user_b: me });

export async function saveSharedTheme(me: string, other: string, theme: string) {
  if (!features.chatThemes) return null;
  const { error } = await supabase
    .from("chat_themes")
    .upsert({ ...pair(me, other), theme, updated_by: me, updated_at: new Date().toISOString() }, { onConflict: "user_a,user_b" });
  return error;
}

/** The chat's shared theme (null until one of you picks one), kept up to date. */
export function useSharedTheme(me: string | null | undefined, other: string | null | undefined) {
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(() => {
    setTheme(null);
    if (!features.chatThemes || !me || !other) return;
    let cancelled = false;
    const { user_a, user_b } = pair(me, other);
    void supabase.from("chat_themes").select("theme").eq("user_a", user_a).eq("user_b", user_b).maybeSingle()
      .then(({ data }) => { if (!cancelled && data) setTheme(data.theme); });
    const channel = supabase
      .channel(`chat-theme-${user_a}-${user_b}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_themes", filter: `user_a=eq.${user_a}` }, (payload) => {
        const row = payload.new as { user_b?: string; theme?: string } | null;
        if (row?.user_b === user_b && row.theme) setTheme(row.theme);
      })
      .subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [me, other]);
  return theme;
}

/** The background behind a chat in each theme: a faint wash of its colour over the wallpaper. */
export const THEME_WASH: Record<string, string> = {
  ocean: "bg-blue-500/[0.07] dark:bg-blue-400/[0.08]",
  sunset: "bg-orange-500/[0.07] dark:bg-orange-400/[0.08]",
  forest: "bg-green-600/[0.07] dark:bg-green-400/[0.08]",
  lavender: "bg-purple-500/[0.07] dark:bg-purple-400/[0.08]",
  crimson: "bg-red-500/[0.06] dark:bg-red-400/[0.08]",
  midnight: "bg-indigo-500/[0.08] dark:bg-indigo-400/[0.1]",
};
