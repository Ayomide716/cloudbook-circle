import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, User, LogOut, MessageCircle, Users, Film, Bell, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { lazy, Suspense, useState, useEffect } from "react";
import BottomNav from "./BottomNav";
import MobileMenu from "./MobileMenu";
import { cn } from "@/lib/utils";

const SearchUsers = lazy(() => import("./SearchUsers"));

interface NavigationProps {
  currentUserId?: string;
}

const Navigation = ({ currentUserId }: NavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    if (currentUserId) {
      loadCounts();
      setupRealtimeSubscriptions();
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

  const setupRealtimeSubscriptions = () => {
    const channel = supabase
      .channel("nav-counts")
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
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Logged out successfully" });
    navigate("/auth");
  };

  const isActive = (path: string) => location.pathname === path;

  const desktopNavItems = [
    { icon: Home, path: "/", label: "Home" },
    { icon: Users, path: "/groups", label: "Groups" },
    { icon: Film, path: "/reels", label: "Reels" },
    { icon: MessageCircle, path: "/messages", label: "Messages" },
  ];

  return (
    <>
      {/* Desktop Header */}
      <nav className="bg-card border-b border-border shadow-sm sticky top-0 z-50 safe-area-top">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-14 lg:h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center flex-shrink-0">
              <h1 className="text-xl md:text-2xl lg:text-[1.75rem] font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                AYO-CHAT
              </h1>
            </Link>

            {/* Desktop Center Navigation - Facebook style tabs */}
            <div className="hidden md:flex items-center justify-center flex-1 max-w-md lg:max-w-2xl mx-6 lg:mx-12">
              {desktopNavItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "group flex-1 flex items-center justify-center py-3 lg:py-4 mx-1 rounded-xl transition-all relative touch-target",
                    isActive(item.path)
                      ? "text-primary"
                      : "text-muted-foreground hover:bg-secondary/80"
                  )}
                  title={item.label}
                >
                  <item.icon className={cn(
                    "h-6 w-6 lg:h-7 lg:w-7 transition-transform",
                    isActive(item.path) ? "scale-110" : "group-hover:scale-105"
                  )} />
                  {isActive(item.path) && (
                    <div className="absolute bottom-0 left-2 right-2 h-[3px] bg-primary rounded-t-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Right Side Icons */}
            <div className="flex items-center gap-1 md:gap-2">
              {currentUserId && (
                <>
                  {/* Search - Always visible */}
                  <Suspense fallback={<div className="w-9 h-9 sm:w-10 sm:h-10" />}>
                    <SearchUsers />
                  </Suspense>

                  {/* Desktop only icons */}
                  <div className="hidden md:flex items-center gap-1.5 lg:gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 lg:h-11 lg:w-11 rounded-full bg-secondary hover:bg-secondary/70 transition-colors touch-target relative"
                      onClick={() => navigate("/friends")}
                      title="Friend Requests"
                    >
                      <UserPlus className="h-5 w-5 lg:h-[22px] lg:w-[22px]" />
                      {pendingRequests > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-xs rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                          {pendingRequests}
                        </span>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 lg:h-11 lg:w-11 rounded-full bg-secondary hover:bg-secondary/70 transition-colors touch-target relative"
                      onClick={() => navigate("/notifications")}
                      title="Notifications"
                    >
                      <Bell className="h-5 w-5 lg:h-[22px] lg:w-[22px]" />
                      {unreadNotifications > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-xs rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                          {unreadNotifications}
                        </span>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 lg:h-11 lg:w-11 rounded-full bg-secondary hover:bg-secondary/70 transition-colors touch-target"
                      onClick={() => navigate(`/profile/${currentUserId}`)}
                      title="Profile"
                    >
                      <User className="h-5 w-5 lg:h-[22px] lg:w-[22px]" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 lg:h-11 lg:w-11 rounded-full bg-secondary hover:bg-destructive/10 hover:text-destructive transition-colors touch-target"
                      onClick={handleLogout}
                      title="Logout"
                    >
                      <LogOut className="h-5 w-5 lg:h-[22px] lg:w-[22px]" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      {currentUserId && (
        <>
          <BottomNav
            currentUserId={currentUserId}
            onMenuClick={() => setMobileMenuOpen(true)}
          />
          <MobileMenu
            isOpen={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            currentUserId={currentUserId}
          />
        </>
      )}
    </>
  );
};

export default Navigation;