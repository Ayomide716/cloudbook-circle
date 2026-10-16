import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Bell, Bookmark, CalendarDays, Camera, Mail, MessageCircle, Search, Sparkles, Users, type IconProps } from "@/components/icons";
import { cn } from "@/lib/utils";

/** The app's own line icons for empty screens (no 3D stickers, per the design system). */
const ICONS: Record<string, React.ComponentType<IconProps>> = {
  bell: Bell,
  bookmark: Bookmark,
  calendar: CalendarDays,
  camera: Camera,
  chat: MessageCircle,
  mailbox: Mail,
  party: Sparkles,
  people: Users,
  search: Search,
};

interface EmptyStateProps {
  /** Which icon to show: calendar, bookmark, bell, chat, people, camera, mailbox, search or party. */
  emoji: string;
  title: string;
  text?: string;
  /** One clear next step, e.g. a "Create an event" button. */
  action?: ReactNode;
  className?: string;
}

/** What an empty screen shows: an icon in a grey circle, a short title and line, and one thing to do next. */
const EmptyState = ({ emoji, title, text, action, className }: EmptyStateProps) => {
  const Icon = ICONS[emoji] ?? Sparkles;
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
        className="mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-secondary"
      >
        <Icon className="h-8 w-8 text-foreground" />
      </motion.div>
      <p className="text-[17px] font-bold">{title}</p>
      {text && <p className="mt-1 max-w-[290px] text-[14px] leading-relaxed text-muted-foreground">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};

export default EmptyState;
