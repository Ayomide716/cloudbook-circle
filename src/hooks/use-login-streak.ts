import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectEvent } from "@/hooks/use-effect-event";

/**
 * Records today's visit and returns the current daily streak. Safe to call from
 * several places: a second call on the same day only reads.
 */
export function useLoginStreak(userId: string | undefined) {
  const [streak, setStreak] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);

  const trackLogin = useEffectEvent(async (userId: string) => {
    const today = new Date().toISOString().split("T")[0];

    const { data: existing } = await supabase
      .from("login_streaks")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!existing) {
      const { data } = await supabase
        .from("login_streaks")
        .insert({ user_id: userId, current_streak: 1, longest_streak: 1, last_login_date: today })
        .select()
        .single();
      if (data) {
        setStreak(1);
        setShowCelebration(true);
      }
      return;
    }

    const lastLogin = new Date(existing.last_login_date);
    const todayDate = new Date(today);
    const diffDays = Math.floor((todayDate.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      setStreak(existing.current_streak);
      return;
    }

    let newStreak: number;
    if (diffDays === 1) {
      newStreak = existing.current_streak + 1;
      setShowCelebration(true);
    } else {
      newStreak = 1;
    }

    const newLongest = Math.max(existing.longest_streak, newStreak);

    await supabase
      .from("login_streaks")
      .update({ current_streak: newStreak, longest_streak: newLongest, last_login_date: today, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    setStreak(newStreak);
  });

  useEffect(() => {
    if (userId) trackLogin(userId);
  }, [userId, trackLogin]);

  return { streak, showCelebration };
}
