import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, User, LogOut, MessageCircle, Users, Film, Bell, UserPlus, Search, Menu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { lazy, Suspense, useState, useEffect } from "react";
import BottomNav from "./BottomNav";
import MobileMenu from "./MobileMenu";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
  const [userProfile, setUserProfile] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);

  useEffect(() => {
    if (currentUserId) {
      loadCounts();
      loadUserProfile();
      setupRealtimeSubscriptions();
    }
  }, [currentUserId]);

  const loadUserProfile = async () => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", currentUserId)
      .single();
    if (data) setUserProfile(data);
  };

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
      {/* Desktop Header - Facebook-style */}
      <nav className="bg-card border-b border-border shadow-sm sticky top-0 z-50 safe-area-top">
        <div className="container mx-auto px-4 lg:px-6">
          <div className="flex items-center h-14">
            {/* Left Section - Logo and Search */}
            <div className="flex items-center gap-2 flex-shrink-0 w-[280px]">
              <Link to="/" className="flex items-center">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary via-primary to-primary/60 bg-clip-text text-transparent">
                  AYO-CHAT
                </h1>
              </Link>
              
              {currentUserId && (
                <div className="hidden lg:block">
                  <Suspense fallback={<div className="w-10 h-10" />}>
                    <SearchUsers />
                  </Suspense>
                </div>
              )}
            </div>

            {/* Center Navigation - Facebook style tabs */}
            <div className="hidden md:flex items-center justify-center flex-1 max-w-[680px] mx-auto">
              {desktopNavItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "group flex-1 flex items-center justify-center h-14 mx-0.5 transition-all relative",
                    isActive(item.path)
                      ? "text-primary"
                      : "text-muted-foreground hover:bg-accent rounded-lg"
                  )}
                  title={item.label}
                >
                  <item.icon className={cn(
                    "h-6 w-6 transition-transform",
                    isActive(item.path) ? "scale-105" : "group-hover:scale-105"
                  )} />
                  {isActive(item.path) && (
                    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary" />
                  )}
                </button>
              ))}
            </div>

            {/* Right Side Icons */}
            <div className="flex items-center justify-end gap-2 w-[280px]">
              {currentUserId && (
                <>
                  {/* Mobile Search */}
                  <div className="lg:hidden">
                    <Suspense fallback={<div className="w-10 h-10" />}>
                      <SearchUsers />
                    </Suspense>
                  </div>

                  {/* Desktop icons */}
                  <div className="hidden md:flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-full bg-secondary hover:bg-secondary/80 relative"
                      onClick={() => navigate("/friends")}
                      title="Friend Requests"
                    >
                      <UserPlus className="h-5 w-5" />
                      {pendingRequests > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                          {pendingRequests > 9 ? "9+" : pendingRequests}
                        </span>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-full bg-secondary hover:bg-secondary/80 relative"
                      onClick={() => navigate("/notifications")}
                      title="Notifications"
                    >
                      <Bell className="h-5 w-5" />
                      {unreadNotifications > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                          {unreadNotifications > 9 ? "9+" : unreadNotifications}
                        </span>
                      )}
                    </Button>

                    {/* Profile Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-full p-0 overflow-hidden ring-2 ring-transparent hover:ring-primary/20 transition-all"
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={userProfile?.avatar_url || undefined} />
                            <AvatarFallback className="bg-secondary text-foreground">
                              {userProfile?.full_name?.[0]?.toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-80">
                        <DropdownMenuItem
                          className="p-3 cursor-pointer"
                          onClick={() => navigate(`/profile/${currentUserId}`)}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={userProfile?.avatar_url || undefined} />
                              <AvatarFallback>
                                {userProfile?.full_name?.[0]?.toUpperCase() || "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">{userProfile?.full_name || "User"}</p>
                              <p className="text-sm text-muted-foreground">See your profile</p>
                            </div>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="p-3 cursor-pointer text-destructive focus:text-destructive"
                          onClick={handleLogout}
                        >
                          <LogOut className="h-5 w-5 mr-3" />
                          Log Out
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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