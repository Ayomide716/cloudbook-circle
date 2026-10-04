import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Bookmark, CalendarDays, FileText, Film, Megaphone, MessageCircle, MonitorPlay,
  Shield, ShoppingBag, UserPlus, Users, type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface FeedSidebarProps {
  currentUser: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

// Same icon set as the header and dock, so a destination always looks the same.
const sidebarLinks: { href: string; icon: LucideIcon; label: string; adminOnly?: boolean }[] = [
  { href: "/friends", icon: UserPlus, label: "Friends" },
  { href: "/messages", icon: MessageCircle, label: "Messages" },
  { href: "/groups", icon: Users, label: "Communities" },
  { href: "/pages", icon: FileText, label: "Pages" },
  { href: "/watch", icon: MonitorPlay, label: "Watch" },
  { href: "/reels", icon: Film, label: "Reels" },
  { href: "/saved", icon: Bookmark, label: "Saved" },
  { href: "/events", icon: CalendarDays, label: "Events" },
  { href: "/marketplace", icon: ShoppingBag, label: "Marketplace" },
  { href: "/ads", icon: Megaphone, label: "Ad Manager" },
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
            className="flex items-center gap-3 p-3 rounded-2xl hover:bg-secondary/80 transition-all duration-200 group"
          >
            <Avatar className="w-10 h-10 rounded-xl ring-2 ring-border/50 group-hover:ring-primary/30 transition-all">
              <AvatarImage src={currentUser.avatar_url || undefined} alt="" className="object-cover" />
              <AvatarFallback className="rounded-xl text-sm">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <span className="text-sm font-semibold font-display block">{currentUser.full_name}</span>
              <span className="text-xs text-muted-foreground">View profile</span>
            </div>
          </Link>
        </motion.div>
        
        {sidebarLinks.filter((link) => !link.adminOnly || isAdmin).map((link) => (
          <motion.div key={link.href} variants={item}>
            <Link
              to={link.href}
              className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-secondary/80 transition-all duration-200 group"
            >
              <span className="w-8 h-8 flex items-center justify-center rounded-xl bg-secondary/60 text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors duration-200">
                <link.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="text-sm font-medium">{link.label}</span>
            </Link>
          </motion.div>
        ))}

      </motion.div>
    </aside>
  );
};

export default FeedSidebar;