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

  useEffect(() => {
    if (currentUserId) {
      loadCounts();
      
      const channel = supabase
        .channel("bottom-nav-counts")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications" },
          () => loadCounts()
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "friendships" },
          () => loadCounts()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentUserId]);

  const loadCounts = async () => {
    if (!currentUserId) return;

    const [notifResult, requestsResult] = await Promise.all([
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", currentUserId)
        .eq("read", false),
      supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("friend_id", currentUserId)
        .eq("status", "pending"),
    ]);

    setUnreadNotifications(notifResult.count || 0);
    setPendingRequests(requestsResult.count || 0);
  };

  const navItems = [
    { icon: Home, path: "/", label: "Home", badge: 0 },
    { icon: Users, path: "/groups", label: "Groups", badge: 0 },
    { icon: Film, path: "/reels", label: "Reels", badge: 0 },
    { icon: MessageCircle, path: "/messages", label: "Chats", badge: 0 },
    { icon: Bell, path: "/notifications", label: "Alerts", badge: unreadNotifications },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border z-50 md:hidden">
      <div className="flex items-center justify-around h-14 px-1 safe-area-bottom">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full py-1 relative transition-colors active:scale-95",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
              )}
              <div className="relative">
                <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full h-4 min-w-4 px-0.5 flex items-center justify-center">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </div>
              <span className="text-[9px] mt-0.5 font-medium">{item.label}</span>
            </button>
          );
        })}
        
        {/* Profile Menu Button */}
        {currentUserId && (
          <div className="flex flex-col items-center justify-center px-2">
            <MobileProfileMenu currentUserId={currentUserId} pendingRequests={pendingRequests} />
            <span className="text-[9px] mt-0.5 font-medium text-muted-foreground">Menu</span>
          </div>
        )}
      </div>
    </nav>
  );
};

export default BottomNav;