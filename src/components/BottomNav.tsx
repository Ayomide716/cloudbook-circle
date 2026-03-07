import { Home, Users, Film, MessageCircle, Search } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import MobileProfileMenu from "./MobileProfileMenu";
import MobileSearchOverlay from "./MobileSearchOverlay";

interface BottomNavProps {
  currentUserId?: string;
}

const BottomNav = ({ currentUserId }: BottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

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
    { icon: Home, path: "/", label: "Home", badge: 0, action: undefined as (() => void) | undefined },
    { icon: Users, path: "/groups", label: "Groups", badge: 0, action: undefined as (() => void) | undefined },
    { icon: Search, path: "", label: "Search", badge: 0, action: () => setSearchOpen(true) },
    { icon: Film, path: "/reels", label: "Reels", badge: 0, action: undefined as (() => void) | undefined },
    { icon: MessageCircle, path: "/messages", label: "Chats", badge: 0, action: undefined as (() => void) | undefined },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 glass-strong border-t border-border/30 z-50 md:hidden">
      <div className="flex items-center justify-around h-[3.5rem] px-1 safe-area-bottom">
        {navItems.map((item) => {
          const isActive = item.path ? location.pathname === item.path : false;
          return (
            <button
              key={item.label}
              onClick={() => item.action ? item.action() : navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full py-1 relative transition-all duration-200 active:scale-90",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full bg-gradient-to-r from-primary to-primary-glow shadow-[0_2px_8px_hsl(var(--primary)/0.4)]" />
              )}
              <div className="relative">
                <item.icon className={cn(
                  "h-5 w-5 transition-all duration-200",
                  isActive && "text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.4)]"
                )} />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full h-4 min-w-4 px-0.5 flex items-center justify-center badge-pulse">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </div>
              <span className={cn(
                "text-[9px] mt-0.5 font-medium transition-all duration-200",
                isActive && "font-semibold"
              )}>{item.label}</span>
            </button>
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
    </nav>
  );
};

export default BottomNav;
