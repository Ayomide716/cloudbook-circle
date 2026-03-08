import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Flame } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface LoginStreakBadgeProps {
  userId: string;
  className?: string;
}

const LoginStreakBadge = ({ userId, className }: LoginStreakBadgeProps) => {
  const [streak, setStreak] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    trackLogin();
  }, [userId]);

  const trackLogin = async () => {
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
  };

  if (streak === 0) return null;

  const flameColor = streak >= 30 ? "text-purple-500" : streak >= 7 ? "text-orange-500" : "text-yellow-500";

  return (
    <motion.div
      initial={showCelebration ? { scale: 0, rotate: -20 } : { scale: 1 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/80 border border-border/50 text-sm font-semibold",
        className
      )}
    >
      <Flame className={cn("h-4 w-4", flameColor)} />
      <span>{streak}</span>
      <span className="text-muted-foreground text-xs font-medium">day{streak !== 1 ? "s" : ""}</span>
    </motion.div>
  );
};

export default LoginStreakBadge;
