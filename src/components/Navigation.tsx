import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, User, LogOut, MessageCircle, Users, Film, Bell, UserPlus, Search } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
      {/* Desktop Header - Sleek Glassmorphism Design */}
      <nav className="bg-card/80 backdrop-blur-xl border-b border-border/50 sticky top-0 z-50 safe-area-top">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Left Section - Logo */}
            <div className="flex items-center gap-3 min-w-[200px]">
              <Link to="/" className="flex items-center group">
                <div className="relative">
                  <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent group-hover:from-primary/80 group-hover:to-primary transition-all duration-300">
                    AYO-CHAT
                  </h1>
                  <div className="absolute -bottom-0.5 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
                </div>
              </Link>
              
              {/* Search */}
              {currentUserId && (
                <div className="hidden lg:block">
                  <Suspense fallback={<div className="w-10 h-10" />}>
                    <SearchUsers />
                  </Suspense>
                </div>
              )}
            </div>

            {/* Center Navigation - Clean Pill Style */}
            <div className="hidden md:flex items-center bg-secondary/50 rounded-full p-1">
              {desktopNavItems.map((item) => (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => navigate(item.path)}
                      className={cn(
                        "relative flex items-center justify-center h-10 px-6 rounded-full transition-all duration-200",
                        isActive(item.path)
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            {/* Right Side Icons */}
            <div className="flex items-center gap-2 min-w-[200px] justify-end">
              {currentUserId && (
                <>
                  {/* Mobile Search */}
                  <div className="lg:hidden">
                    <Suspense fallback={<div className="w-10 h-10" />}>
                      <SearchUsers />
                    </Suspense>
                  </div>

                  {/* Desktop icons */}
                  <div className="hidden md:flex items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-full bg-secondary/70 hover:bg-secondary relative group"
                          onClick={() => navigate("/friends")}
                        >
                          <UserPlus className="h-[18px] w-[18px] group-hover:scale-110 transition-transform" />
                          {pendingRequests > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center animate-pulse">
                              {pendingRequests > 9 ? "9+" : pendingRequests}
                            </span>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Friend Requests
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-full bg-secondary/70 hover:bg-secondary relative group"
                          onClick={() => navigate("/notifications")}
                        >
                          <Bell className="h-[18px] w-[18px] group-hover:scale-110 transition-transform" />
                          {unreadNotifications > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center animate-pulse">
                              {unreadNotifications > 9 ? "9+" : unreadNotifications}
                            </span>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Notifications
                      </TooltipContent>
                    </Tooltip>

                    {/* Profile Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-full p-0 overflow-hidden ring-2 ring-border hover:ring-primary/50 transition-all duration-200"
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={userProfile?.avatar_url || undefined} />
                            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-foreground font-medium">
                              {userProfile?.full_name?.[0]?.toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-72 p-2">
                        <DropdownMenuItem
                          className="p-3 cursor-pointer rounded-lg"
                          onClick={() => navigate(`/profile/${currentUserId}`)}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-12 w-12 ring-2 ring-border">
                              <AvatarImage src={userProfile?.avatar_url || undefined} />
                              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10">
                                {userProfile?.full_name?.[0]?.toUpperCase() || "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">{userProfile?.full_name || "User"}</p>
                              <p className="text-xs text-muted-foreground">View your profile</p>
                            </div>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="my-2" />
                        <DropdownMenuItem
                          className="p-3 cursor-pointer rounded-lg text-destructive focus:text-destructive focus:bg-destructive/10"
                          onClick={handleLogout}
                        >
                          <LogOut className="h-4 w-4 mr-3" />
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
