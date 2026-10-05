import { Home, Film, MessageCircle, Compass } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import MobileProfileMenu from "./MobileProfileMenu";
import { prefetchRoute } from "@/lib/prefetch";
import { motion } from "framer-motion";

interface BottomNavProps {
  currentUserId?: string;
}

const BottomNav = ({ currentUserId }: BottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const navItems = [
    { icon: Home, path: "/", label: "Home", badge: 0, action: undefined as (() => void) | undefined },
    { icon: Compass, path: "/explore", label: "Explore", badge: 0, action: undefined as (() => void) | undefined },
    { icon: Film, path: "/reels", label: "Reels", badge: 0, action: undefined as (() => void) | undefined },
    { icon: MessageCircle, path: "/messages", label: "Chats", badge: 0, action: undefined as (() => void) | undefined },
  ];

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
          const isActive = item.path ? location.pathname === item.path : false;
          return (
            <motion.button
              key={item.label}
              onClick={() => item.action ? item.action() : navigate(item.path)}
              onTouchStart={() => item.path && prefetchRoute(item.path)}
              whileTap={{ scale: 0.9 }}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              {isActive && <span className="absolute top-0 inset-x-3 h-[3px] rounded-b-full bg-primary" />}
              <span className="relative">
                <item.icon className="h-6 w-6" strokeWidth={isActive ? 2.4 : 2} />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 gradient-brand text-primary-foreground text-[9px] font-bold rounded-full h-4 min-w-4 px-0.5 flex items-center justify-center">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </span>
              <span className={cn("text-[11px] leading-none", isActive ? "font-semibold" : "font-medium")}>{item.label}</span>
            </motion.button>
          );
        })}

        {currentUserId && (
          <div className="flex flex-col items-center justify-center gap-0.5">
            <MobileProfileMenu currentUserId={currentUserId} />
            <span className="text-[11px] leading-none font-medium text-muted-foreground">Menu</span>
          </div>
        )}
      </div>
    </motion.nav>
  );
};

export default BottomNav;