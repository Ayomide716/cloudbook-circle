import { Bell, Home, Film, Users, Menu as MenuIcon } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/lib/prefetch";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/** Groups icon: three heads, so it reads differently from Friends. */
const GroupsIcon = ({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="12" cy="7" r="3" />
    <circle cx="5" cy="13" r="2.5" />
    <circle cx="19" cy="13" r="2.5" />
    <path d="M7 21a5 5 0 0 1 10 0" />
  </svg>
);

interface BottomNavProps {
  currentUserId?: string;
  /** Pending friend requests, shown on the Friends tab. */
  friendRequests?: number;
  /** Unread notifications, shown on the Notifications tab. */
  unreadNotifications?: number;
  /** Your photo for the Menu tab, as Facebook shows it. */
  avatarUrl?: string | null;
  name?: string | null;
}

/**
 * The tab bar, laid out like Facebook's app: Home, Reels, Friends, Groups, Notifications
 * and Menu along the bottom, the current tab in teal with a line on top.
 */
const BottomNav = ({ friendRequests = 0, unreadNotifications = 0, avatarUrl, name }: BottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = [
    { icon: Home, path: "/", label: "Home", badge: 0 },
    { icon: Film, path: "/reels", label: "Reels", badge: 0 },
    { icon: Users, path: "/friends", label: "Friends", badge: friendRequests },
    { icon: GroupsIcon, path: "/groups", label: "Groups", badge: 0 },
    { icon: Bell, path: "/notifications", label: "Notifications", badge: unreadNotifications },
  ];
  // A group's own page still counts as the Groups tab.
  const isActive = (path: string) => (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path));
  const menuActive = isActive("/menu");

  const tabClass = (active: boolean) =>
    cn("relative flex min-w-0 flex-col items-center justify-center gap-0.5 transition-colors", active ? "text-primary" : "text-muted-foreground");
  const label = (text: string, active: boolean) => (
    <span className={cn("max-w-full truncate text-[10px] tracking-tight leading-none", active ? "font-semibold" : "font-medium")}>{text}</span>
  );

  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      aria-label="Main"
      className="app-dock fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="grid grid-cols-6 h-14">
        {tabs.map((tab) => {
          const active = isActive(tab.path);
          return (
            <motion.button
              key={tab.label}
              onClick={() => navigate(tab.path)}
              onTouchStart={() => prefetchRoute(tab.path)}
              whileTap={{ scale: 0.9 }}
              aria-current={active ? "page" : undefined}
              aria-label={tab.badge > 0 ? `${tab.label}, ${tab.badge} new` : tab.label}
              className={tabClass(active)}
            >
              {active && <span className="absolute top-0 inset-x-0 h-[3px] bg-primary" />}
              <span className="relative">
                <tab.icon className="h-6 w-6" strokeWidth={active ? 2.4 : 2} />
                {tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] rounded-full bg-destructive px-1 text-[10px] font-bold leading-[18px] text-destructive-foreground text-center">
                    {tab.badge > 9 ? "9+" : tab.badge}
                  </span>
                )}
              </span>
              {label(tab.label, active)}
            </motion.button>
          );
        })}

        {/* Menu: your photo with a small menu badge, like Facebook's last tab. Opens the full Menu page. */}
        <motion.button
          onClick={() => navigate("/menu")}
          whileTap={{ scale: 0.9 }}
          aria-current={menuActive ? "page" : undefined}
          aria-label="Menu"
          className={tabClass(menuActive)}
        >
          {menuActive && <span className="absolute top-0 inset-x-0 h-[3px] bg-primary" />}
          <span className="relative">
            <Avatar className={cn("h-6 w-6", menuActive && "ring-2 ring-primary")}>
              <AvatarImage src={avatarUrl || undefined} alt="" />
              <AvatarFallback className="text-[10px] font-bold">{name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-1 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-card ring-1 ring-border">
              <MenuIcon className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
          </span>
          {label("Menu", menuActive)}
        </motion.button>
      </div>
    </motion.nav>
  );
};

export default BottomNav;
