import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Bookmark, CalendarDays, FileText, Film, Megaphone, MonitorPlay, Send,
  Shield, ShoppingBag, Users, UsersRound, type LucideIcon,
} from "@/components/icons";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { features } from "@/lib/features";

interface FeedSidebarProps {
  currentUser: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

// Same icon set as the header and dock, so a destination always looks the same.
const sidebarLinks: { href: string; icon: LucideIcon; label: string; adminOnly?: boolean; extra?: boolean }[] = [
  { href: "/friends", icon: Users, label: "Friends" },
  { href: "/messages", icon: Send, label: "Messages" },
  { href: "/groups", icon: UsersRound, label: "Groups" },
  { href: "/pages", icon: FileText, label: "Pages", extra: true },
  { href: "/watch", icon: MonitorPlay, label: "Watch", extra: true },
  { href: "/reels", icon: Film, label: "Reels" },
  { href: "/saved", icon: Bookmark, label: "Saved" },
  { href: "/events", icon: CalendarDays, label: "Events" },
  { href: "/marketplace", icon: ShoppingBag, label: "Marketplace", extra: true },
  { href: "/ads", icon: Megaphone, label: "Ad Manager", extra: true },
  { href: "/admin", icon: Shield, label: "Admin", adminOnly: true },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
};

const item = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0 },
};

const FeedSidebar = ({ currentUser }: FeedSidebarProps) => {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", currentUser.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [currentUser.id]);

  const initials = (currentUser.full_name || "U").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <aside className="hidden lg:block space-y-2">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="sticky top-20 space-y-1"
      >
        <motion.div variants={item}>
          <Link
            to={`/profile/${currentUser.id}`}
            className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-secondary"
          >
            <Avatar className="h-10 w-10">
              <AvatarImage src={currentUser.avatar_url || undefined} alt="" className="object-cover" />
              <AvatarFallback className="text-sm">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <span className="block text-[15px] font-semibold">{currentUser.full_name}</span>
              <span className="text-xs text-muted-foreground">View profile</span>
            </div>
          </Link>
        </motion.div>
        
        {sidebarLinks.filter((link) => (!link.adminOnly || isAdmin) && (!link.extra || features.extras)).map((link) => (
          <motion.div key={link.href} variants={item}>
            <Link
              to={link.href}
              className="flex items-center gap-3.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary"
            >
              <link.icon className="h-6 w-6 shrink-0 text-foreground" />
              <span className="text-[15px] font-medium">{link.label}</span>
            </Link>
          </motion.div>
        ))}

      </motion.div>
    </aside>
  );
};

export default FeedSidebar;