import { Flame } from "@/components/icons";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLoginStreak } from "@/hooks/use-login-streak";

interface LoginStreakBadgeProps {
  userId: string;
  className?: string;
}

const LoginStreakBadge = ({ userId, className }: LoginStreakBadgeProps) => {
  const { streak, showCelebration } = useLoginStreak(userId);

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
