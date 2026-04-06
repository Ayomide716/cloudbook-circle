import { Home, Users, Film, MessageCircle, Compass } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import MobileProfileMenu from "./MobileProfileMenu";
import { prefetchRoute } from "@/lib/prefetch";
import { prefetchRoute } from "@/lib/prefetch";
import { motion } from "framer-motion";

interface BottomNavProps {
  currentUserId?: string;
}

const BottomNav = ({ currentUserId }: BottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    if (currentUserId) {
      loadCounts();
      
      const channel = supabase
        .channel("bottom-nav-counts")
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => loadCounts())
        .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => loadCounts())
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [currentUserId]);

  const loadCounts = async () => {
    if (!currentUserId) return;
    const [notifResult, requestsResult] = await Promise.all([
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", currentUserId).eq("read", false),
      supabase.from("friendships").select("id", { count: "exact", head: true }).eq("friend_id", currentUserId).eq("status", "pending"),
    ]);
    setUnreadNotifications(notifResult.count || 0);
    setPendingRequests(requestsResult.count || 0);
  };

  const navItems = [
    { icon: Home, path: "/", label: "Home", badge: unreadNotifications, action: undefined as (() => void) | undefined },
    { icon: Compass, path: "/explore", label: "Explore", badge: 0, action: undefined as (() => void) | undefined },
    { icon: Film, path: "/reels", label: "Reels", badge: 0, action: undefined as (() => void) | undefined },
    { icon: MessageCircle, path: "/messages", label: "Chats", badge: 0, action: undefined as (() => void) | undefined },
  ];

  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="fixed bottom-4 left-4 right-4 glass-strong dock-nav rounded-2xl z-50 md:hidden"
    >
      <div className="flex items-center justify-around h-[3.5rem] px-1">
        {navItems.map((item) => {
          const isActive = item.path ? location.pathname === item.path : false;
          return (
            <motion.button
              key={item.label}
              onClick={() => item.action ? item.action() : navigate(item.path)}
              onTouchStart={() => item.path && prefetchRoute(item.path)}
              whileTap={{ scale: 0.85 }}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full py-1 relative transition-colors duration-200",
                isActive ? "text-primary-foreground" : "text-muted-foreground"
              )}
            >
              <div className={cn(
                "relative flex items-center justify-center h-9 w-9 rounded-xl transition-all duration-200",
                isActive && "gradient-brand shadow-md"
              )}>
                <item.icon className="h-5 w-5" />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 gradient-brand text-primary-foreground text-[9px] font-bold rounded-full h-4 min-w-4 px-0.5 flex items-center justify-center badge-pulse">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </div>
              <span className={cn(
                "text-[9px] mt-0.5 font-medium transition-all duration-200",
                isActive ? "text-primary font-semibold" : "text-muted-foreground"
              )}>{item.label}</span>
            </motion.button>
          );
        })}
        
        {currentUserId && (
          <div className="flex flex-col items-center justify-center px-2">
            <MobileProfileMenu currentUserId={currentUserId} pendingRequests={pendingRequests} />
            <span className="text-[9px] mt-0.5 font-medium text-muted-foreground">Menu</span>
          </div>
        )}
      </div>
      
      <MobileSearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </motion.nav>
  );
};

export default BottomNav;