import { Home, Film, Users } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import MobileProfileMenu from "./MobileProfileMenu";
import { prefetchRoute } from "@/lib/prefetch";
import { motion } from "framer-motion";

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
}

const BottomNav = ({ currentUserId, friendRequests = 0 }: BottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const navItems = [
    { icon: Home, path: "/", label: "Home", badge: 0 },
    { icon: Users, path: "/friends", label: "Friends", badge: friendRequests },
    { icon: Film, path: "/reels", label: "Reels", badge: 0 },
    { icon: GroupsIcon, path: "/groups", label: "Groups", badge: 0 },
  ];
  // A group's own page still counts as the Groups tab.
  const isActive = (path: string) => (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path));

  // A flat bar across the bottom, as in Facebook's app: the current tab is teal with a line on top.
  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      aria-label="Main"
      className="app-dock fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="grid grid-cols-5 h-14">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <motion.button
              key={item.label}
              onClick={() => navigate(item.path)}
              onTouchStart={() => prefetchRoute(item.path)}
              whileTap={{ scale: 0.9 }}
              aria-current={active ? "page" : undefined}
              aria-label={item.badge > 0 ? `${item.label}, ${item.badge} new` : item.label}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              {active && <span className="absolute top-0 inset-x-0 h-[3px] bg-primary" />}
              <span className="relative">
                <item.icon className="h-6 w-6" strokeWidth={active ? 2.4 : 2} />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] rounded-full bg-destructive px-1 text-[10px] font-bold leading-[18px] text-destructive-foreground text-center">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </span>
              <span className={cn("text-[11px] leading-none", active ? "font-semibold" : "font-medium")}>{item.label}</span>
            </motion.button>
          );
        })}

        {currentUserId && <MobileProfileMenu currentUserId={currentUserId} />}
      </div>
    </motion.nav>
  );
};

export default BottomNav;
