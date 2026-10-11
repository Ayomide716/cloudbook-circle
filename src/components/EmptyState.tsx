import type { ReactNode } from "react";
import { motion } from "framer-motion";
import ReactionEmoji from "@/components/reactions/ReactionEmoji";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** A 3D emoji name from lib/reaction-emoji (calendar, bookmark, bell, chat, people…). */
  emoji: string;
  title: string;
  text?: string;
  /** One clear next step, e.g. a "Create an event" button. */
  action?: ReactNode;
  className?: string;
}

/** What an empty screen shows: a 3D emoji, a short title and line, and one thing to do next. */
const EmptyState = ({ emoji, title, text, action, className }: EmptyStateProps) => (
  <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
    <motion.div
      initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 18 }}
      className="mb-4"
    >
      <ReactionEmoji type={emoji} className="h-20 w-20 drop-shadow-lg" />
    </motion.div>
    <p className="font-display text-lg font-bold">{title}</p>
    {text && <p className="mt-1 max-w-[290px] text-sm leading-relaxed text-muted-foreground">{text}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;
