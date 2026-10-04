import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { motion } from "framer-motion";
import {
  BadgeCheck, BookOpen, Crown, Flame, Gem, HeartHandshake, PenLine, Star, Users, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Achievement {
  type: string;
  label: string;
  icon: LucideIcon;
  /** Colour of the icon once earned (milestones use the brand gold). */
  color: string;
  description: string;
}

const ALL_ACHIEVEMENTS: Achievement[] = [
  { type: "first_post", label: "First Post", icon: PenLine, color: "text-primary", description: "Published your first post" },
  { type: "10_friends", label: "Social Butterfly", icon: HeartHandshake, color: "text-primary", description: "Made 10 friends" },
  { type: "50_friends", label: "Popular", icon: Star, color: "text-gold", description: "Made 50 friends" },
  { type: "100_friends", label: "Celebrity", icon: Crown, color: "text-gold", description: "Made 100 friends" },
  { type: "first_story", label: "Storyteller", icon: BookOpen, color: "text-primary", description: "Shared your first story" },
  { type: "7_day_streak", label: "On Fire", icon: Flame, color: "text-gold", description: "7-day login streak" },
  { type: "30_day_streak", label: "Dedicated", icon: Gem, color: "text-gold", description: "30-day login streak" },
  { type: "first_group", label: "Community Builder", icon: Users, color: "text-primary", description: "Created your first group" },
  { type: "verified", label: "Verified", icon: BadgeCheck, color: "text-primary", description: "Got verified" },
];

interface ProfileAchievementsProps {
  userId: string;
  isOwnProfile?: boolean;
}

const ProfileAchievements = ({ userId, isOwnProfile }: ProfileAchievementsProps) => {
  const [earned, setEarned] = useState<Set<string>>(new Set());

  const loadAchievements = useEffectEvent(async () => {
    const { data } = await supabase
      .from("user_achievements")
      .select("achievement_type")
      .eq("user_id", userId);
    if (data) setEarned(new Set(data.map((a) => a.achievement_type)));
  });

  const checkAndAwardAchievements = useEffectEvent(async () => {
    const checks: { type: string; check: () => Promise<boolean> }[] = [
      {
        type: "first_post",
        check: async () => {
          const { count } = await supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userId);
          return (count || 0) >= 1;
        },
      },
      {
        type: "10_friends",
        check: async () => {
          const { count } = await supabase.from("friendships").select("id", { count: "exact", head: true }).eq("status", "accepted").or(`user_id.eq.${userId},friend_id.eq.${userId}`);
          return (count || 0) >= 10;
        },
      },
      {
        type: "50_friends",
        check: async () => {
          const { count } = await supabase.from("friendships").select("id", { count: "exact", head: true }).eq("status", "accepted").or(`user_id.eq.${userId},friend_id.eq.${userId}`);
          return (count || 0) >= 50;
        },
      },
      {
        type: "100_friends",
        check: async () => {
          const { count } = await supabase.from("friendships").select("id", { count: "exact", head: true }).eq("status", "accepted").or(`user_id.eq.${userId},friend_id.eq.${userId}`);
          return (count || 0) >= 100;
        },
      },
      {
        type: "first_story",
        check: async () => {
          const { count } = await supabase.from("stories").select("id", { count: "exact", head: true }).eq("user_id", userId);
          return (count || 0) >= 1;
        },
      },
      {
        type: "first_group",
        check: async () => {
          const { count } = await supabase.from("groups").select("id", { count: "exact", head: true }).eq("created_by", userId);
          return (count || 0) >= 1;
        },
      },
      {
        type: "7_day_streak",
        check: async () => {
          const { data } = await supabase.from("login_streaks").select("longest_streak").eq("user_id", userId).single();
          return (data?.longest_streak || 0) >= 7;
        },
      },
      {
        type: "30_day_streak",
        check: async () => {
          const { data } = await supabase.from("login_streaks").select("longest_streak").eq("user_id", userId).single();
          return (data?.longest_streak || 0) >= 30;
        },
      },
      {
        type: "verified",
        check: async () => {
          const { data } = await supabase.from("profiles").select("is_verified").eq("id", userId).single();
          return data?.is_verified === true;
        },
      },
    ];

    // Read what's already earned from the database; `earned` state may not have loaded yet.
    const { data: existing } = await supabase
      .from("user_achievements")
      .select("achievement_type")
      .eq("user_id", userId);
    const alreadyEarned = new Set((existing || []).map((a) => a.achievement_type));

    for (const { type, check } of checks) {
      if (alreadyEarned.has(type)) continue;
      const qualifies = await check();
      if (qualifies) {
        await supabase.from("user_achievements").insert({ user_id: userId, achievement_type: type }).select();
        setEarned((prev) => new Set(prev).add(type));
      }
    }
  });

  useEffect(() => {
    loadAchievements();
  }, [userId, loadAchievements]);

  // isOwnProfile can flip to true after the viewer's session loads, so re-check then.
  useEffect(() => {
    if (isOwnProfile) checkAndAwardAchievements();
  }, [userId, isOwnProfile, checkAndAwardAchievements]);

  const earnedList = ALL_ACHIEVEMENTS.filter((a) => earned.has(a.type));
  const unearnedList = ALL_ACHIEVEMENTS.filter((a) => !earned.has(a.type));

  if (earnedList.length === 0 && !isOwnProfile) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold font-display text-muted-foreground uppercase tracking-wider">
        Achievements {earnedList.length > 0 && `(${earnedList.length}/${ALL_ACHIEVEMENTS.length})`}
      </h3>
      <div className="flex flex-wrap gap-2">
        {earnedList.map((a, i) => (
          <Tooltip key={a.type}>
            <TooltipTrigger asChild>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.05, type: "spring", stiffness: 400 }}
                className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center cursor-default hover:scale-110 transition-transform"
                aria-label={a.label}
              >
                <a.icon className={cn("h-5 w-5", a.color)} />
              </motion.div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-semibold">{a.label}</p>
              <p className="text-xs text-muted-foreground">{a.description}</p>
            </TooltipContent>
          </Tooltip>
        ))}
        {isOwnProfile && unearnedList.map((a) => (
          <Tooltip key={a.type}>
            <TooltipTrigger asChild>
              <div className="h-10 w-10 rounded-xl bg-muted/50 border border-border/50 flex items-center justify-center opacity-40 cursor-default" aria-label={`${a.label} (locked)`}>
                <a.icon className="h-5 w-5 text-muted-foreground" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-semibold">{a.label}</p>
              <p className="text-xs text-muted-foreground">{a.description}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
};

export default ProfileAchievements;
