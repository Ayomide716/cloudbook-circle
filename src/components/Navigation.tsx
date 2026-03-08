import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, LogOut, MessageCircle, Users, Film, Bell, UserPlus, CalendarDays, Bookmark, Settings, ShoppingBag, MonitorPlay } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import BottomNav from "./BottomNav";
import { cn } from "@/lib/utils";
import ThemeToggle from "./ThemeToggle";
import GlobalSearch from "./GlobalSearch";
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
import { usePushNotifications } from "@/hooks/usePushNotifications";
import logo from "@/assets/logo.png";

interface NavigationProps {
  currentUserId?: string;
}

const Navigation = ({ currentUserId }: NavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [userProfile, setUserProfile] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);
  
  usePushNotifications(currentUserId);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => loadCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => loadCounts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Logged out successfully" });
    navigate("/auth");
  };

  const isActive = (path: string) => location.pathname === path;

  const desktopNavItems = [
    { icon: Home, path: "/", label: "Home" },
    { icon: MonitorPlay, path: "/watch", label: "Watch" },
    { icon: Film, path: "/reels", label: "Reels" },
    { icon: Users, path: "/groups", label: "Groups" },
    { icon: MessageCircle, path: "/messages", label: "Messages" },
  ];

  return (
    <>
      {/* Desktop Navbar - Glassmorphism */}
      <nav className="glass-strong sticky top-0 z-50 safe-area-top border-b border-border/50">
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-[var(--nav-height)]">
            {/* Left - Logo + Search */}
            <div className="flex items-center gap-3 min-w-[220px]">
              <Link to="/" className="flex-shrink-0 group">
                <div className="relative">
                  <img 
                    src={logo} 
                    alt="AC" 
                    className="h-10 w-10 rounded-xl transition-transform duration-200 group-hover:scale-105 group-active:scale-95" 
                  />
                  <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 glow-primary" />
                </div>
              </Link>
              <GlobalSearch />
            </div>

            {/* Center - Navigation Tabs */}
            <div className="hidden md:flex items-center justify-center flex-1 max-w-[540px] mx-auto gap-1">
              {desktopNavItems.map((item) => (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => navigate(item.path)}
                      className={cn(
                        "relative flex items-center justify-center h-12 px-8 lg:px-10 rounded-xl transition-all duration-200",
                        isActive(item.path)
                          ? "text-primary"
                          : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground active:scale-95"
                      )}
                    >
                      <item.icon className={cn(
                        "h-[22px] w-[22px] transition-all duration-200",
                        isActive(item.path) && "text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.4)]"
                      )} />
                      {isActive(item.path) && (
                        <div className="nav-indicator" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs font-medium glass border-border/50">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            {/* Right - Action Icons */}
            <div className="flex items-center gap-1.5 min-w-[220px] justify-end">
              {currentUserId && (
                <div className="hidden md:flex items-center gap-1.5">
                  {/* Friend Requests */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-full bg-secondary/60 hover:bg-secondary hover:scale-105 active:scale-95 transition-all duration-200 relative"
                        onClick={() => navigate("/friends")}
                      >
                        <UserPlus className="h-5 w-5" />
                        {pendingRequests > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center badge-pulse">
                            {pendingRequests > 9 ? "9+" : pendingRequests}
                          </span>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs font-medium">Friends</TooltipContent>
                  </Tooltip>

                  {/* Notifications */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-full bg-secondary/60 hover:bg-secondary hover:scale-105 active:scale-95 transition-all duration-200 relative"
                        onClick={() => navigate("/notifications")}
                      >
                        <Bell className="h-5 w-5" />
                        {unreadNotifications > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center badge-pulse">
                            {unreadNotifications > 9 ? "9+" : unreadNotifications}
                          </span>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs font-medium">Notifications</TooltipContent>
                  </Tooltip>

                  {/* Profile Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-full p-0 overflow-hidden ring-2 ring-border/50 hover:ring-primary/40 hover:scale-105 active:scale-95 transition-all duration-200"
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={userProfile?.avatar_url || undefined} />
                          <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary-glow/20 text-foreground font-semibold">
                            {userProfile?.full_name?.[0]?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72 p-2 glass border-border/50 animate-scale-in">
                      <DropdownMenuItem
                        className="p-3 cursor-pointer rounded-xl focus:bg-accent/60"
                        onClick={() => navigate(`/profile/${currentUserId}`)}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-12 w-12 ring-2 ring-border/50">
                            <AvatarImage src={userProfile?.avatar_url || undefined} />
                            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary-glow/20 font-semibold">
                              {userProfile?.full_name?.[0]?.toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold font-display">{userProfile?.full_name || "User"}</p>
                            <p className="text-xs text-muted-foreground">View your profile</p>
                          </div>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="my-1.5 bg-border/50" />
                      <DropdownMenuItem className="p-3 cursor-pointer rounded-xl focus:bg-accent/60" onClick={() => navigate("/saved")}>
                        <Bookmark className="h-4 w-4 mr-3" />
                        Saved Posts
                      </DropdownMenuItem>
                      <DropdownMenuItem className="p-3 cursor-pointer rounded-xl focus:bg-accent/60" onClick={() => navigate("/events")}>
                        <CalendarDays className="h-4 w-4 mr-3" />
                        Events
                      </DropdownMenuItem>
                      <DropdownMenuItem className="p-3 cursor-pointer rounded-xl focus:bg-accent/60" onClick={() => navigate("/marketplace")}>
                        <ShoppingBag className="h-4 w-4 mr-3" />
                        Marketplace
                      </DropdownMenuItem>
                      <DropdownMenuItem className="p-3 cursor-pointer rounded-xl focus:bg-accent/60" onClick={() => navigate("/settings")}>
                        <Settings className="h-4 w-4 mr-3" />
                        Notification Settings
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="my-1.5 bg-border/50" />
                      <DropdownMenuItem
                        className="p-3 cursor-pointer rounded-xl text-destructive focus:text-destructive focus:bg-destructive/10"
                        onClick={handleLogout}
                      >
                        <LogOut className="h-4 w-4 mr-3" />
                        Log Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <ThemeToggle />
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      {currentUserId && <BottomNav currentUserId={currentUserId} />}
    </>
  );
};

export default Navigation;
