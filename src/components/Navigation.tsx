import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Cloud, Home, LogOut, MessageCircle, Users, Film, Bell, UserPlus, CalendarDays, Bookmark, Settings, ShoppingBag, MonitorPlay, Search, Shield } from "lucide-react";
import { List, MagnifyingGlass, MessengerLogo, PlusCircle } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { NavShellContext } from "@/lib/nav-shell";
import { playSound } from "@/lib/sounds";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useContext, useLayoutEffect, useRef } from "react";
import BottomNav from "./BottomNav";
import { cn } from "@/lib/utils";
import ThemeToggle from "./ThemeToggle";
import GlobalSearch from "./GlobalSearch";
import MobileSearchOverlay from "./MobileSearchOverlay";
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
import { prefetchRoute } from "@/lib/prefetch";
import { motion } from "framer-motion";
import { useEffectEvent } from "@/hooks/use-effect-event";

interface NavigationProps {
  currentUserId?: string;
  /** Phones only: leave out the top bar (the profile draws its own over the cover photo). */
  hideMobileTopBar?: boolean;
}

export const AppNavigation = ({ currentUserId, hideMobileTopBar = false }: NavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [userProfile, setUserProfile] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  usePushNotifications(currentUserId);

  const checkAdmin = useEffectEvent(async () => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", currentUserId)
      .eq("role", "admin")
      .maybeSingle();
    setIsAdmin(!!data);
  });

  const loadUserProfile = useEffectEvent(async () => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", currentUserId)
      .single();
    if (data) setUserProfile(data);
  });

  // Last counts seen, so a new notification or message (not the first load) plays a chime.
  const lastCounts = useRef<{ notifications: number; messages: number; requests: number } | null>(null);

  const loadCounts = useEffectEvent(async () => {
    if (!currentUserId) return;
    const [notifResult, requestsResult, messagesResult] = await Promise.all([
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
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", currentUserId)
        .eq("read", false),
    ]);
    const next = { notifications: notifResult.count || 0, messages: messagesResult.count || 0, requests: requestsResult.count || 0 };
    const before = lastCounts.current;
    if (before && document.visibilityState === "visible") {
      // On the Messages page the chat itself is open, so stay quiet there.
      if (next.messages > before.messages && location.pathname !== "/messages") playSound("message");
      else if (next.notifications > before.notifications || next.requests > before.requests) playSound("notification");
    }
    lastCounts.current = next;
    setUnreadNotifications(next.notifications);
    setUnreadMessages(next.messages);
    setPendingRequests(next.requests);
  });

  const setupRealtimeSubscriptions = useEffectEvent(() => {
    const channel = supabase
      .channel("nav-counts")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => loadCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => loadCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `receiver_id=eq.${currentUserId}` }, () => loadCounts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  });

  useEffect(() => {
    if (currentUserId) {
      loadCounts();
      loadUserProfile();
      const cleanupRealtime = setupRealtimeSubscriptions();
      checkAdmin();
      
      // Global online status tracking
      updateOnlineStatus(currentUserId, true);
      const presenceInterval = setInterval(() => updateOnlineStatus(currentUserId, true), 30000);
      const handleUnload = () => updateOnlineStatus(currentUserId, false);
      const handleVisibility = () => {
        if (document.hidden) updateOnlineStatus(currentUserId, false);
        else updateOnlineStatus(currentUserId, true);
      };
      window.addEventListener("beforeunload", handleUnload);
      document.addEventListener("visibilitychange", handleVisibility);
      
      return () => {
        cleanupRealtime();
        clearInterval(presenceInterval);
        window.removeEventListener("beforeunload", handleUnload);
        document.removeEventListener("visibilitychange", handleVisibility);
        updateOnlineStatus(currentUserId, false);
      };
    }
  }, [currentUserId, checkAdmin, loadCounts, loadUserProfile, setupRealtimeSubscriptions]);

  const updateOnlineStatus = async (userId: string, isOnline: boolean) => {
    const { data: existing } = await supabase.from("user_status").select("id").eq("user_id", userId).maybeSingle();
    if (existing) {
      await supabase.from("user_status").update({ is_online: isOnline, last_seen: new Date().toISOString() }).eq("user_id", userId);
    } else {
      await supabase.from("user_status").insert({ user_id: userId, is_online: isOnline, last_seen: new Date().toISOString() });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Logged out successfully" });
    navigate("/auth");
  };

  const isActive = (path: string) => location.pathname === path;

  // Messages has its own full-height layout, and Reels plays full-screen behind the dock.
  const showDock = !!currentUserId && location.pathname !== "/messages" && location.pathname !== "/reels";
  useEffect(() => {
    document.body.classList.toggle("has-dock", showDock);
    return () => document.body.classList.remove("has-dock");
  }, [showDock]);

  const dockItems = [
    { icon: Home, path: "/", label: "Home" },
    { icon: MonitorPlay, path: "/watch", label: "Watch" },
    { icon: Film, path: "/reels", label: "Reels" },
    { icon: Users, path: "/groups", label: "Groups" },
    { icon: MessageCircle, path: "/messages", label: "Messages" },
  ];

  return (
    <>
      {/* Top bar - minimal brand + search + actions */}
      <header className={cn("sticky top-0 z-50 safe-area-top glass-strong border-b border-border/50 max-md:bg-card max-md:border-x-0 max-md:border-t-0", hideMobileTopBar && "max-md:hidden")}>
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-[var(--nav-height)]">
            {/* Left - Logo (phones: the Menu button sits before it, as in Facebook's app) */}
            <div className="flex items-center gap-1 shrink-0">
            {currentUserId && (
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden -ml-1.5 h-8 w-8 rounded-full [&_svg]:size-[22px] hover:bg-secondary"
                onClick={() => navigate("/menu")}
                aria-label="Menu"
                aria-current={location.pathname === "/menu" ? "page" : undefined}
              >
                <List className="h-[26px] w-[26px]" weight="regular" aria-hidden="true" />
              </Button>
            )}
            {/* Cloud mark, the name in a cyan-to-white gradient, and the tagline under it. */}
            <Link to="/" className="shrink-0 flex flex-col" aria-label="CloudBook home">
              <span className="flex items-center gap-1.5">
                <Cloud className="h-[22px] w-[22px] md:h-7 md:w-7 text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.6)]" strokeWidth={2.6} aria-hidden="true" />
                <span className="text-[19px] md:text-2xl font-display font-extrabold tracking-[-0.03em] leading-none bg-gradient-to-r from-primary to-foreground bg-clip-text text-transparent">CloudBook</span>
              </span>
              <span className="md:hidden mt-[3px] pl-1 text-[8.5px] leading-none tracking-[0.18em] text-muted-foreground">Connect · Share · Belong</span>
            </Link>
            </div>

            {/* Search: centred on tablets; on wide screens it sits by the logo so the main tabs can take the centre. */}
            <div className="hidden md:flex flex-1 justify-center mx-8 lg:flex-none lg:justify-start lg:mx-0 lg:ml-4 lg:w-52 xl:w-72">
              <div className="w-full max-w-lg">
                <GlobalSearch />
              </div>
            </div>

            {/* Wide screens: the main destinations as tabs in the top bar (the floating dock is for tablets) */}
            {currentUserId && (
              <nav aria-label="Main" className="hidden lg:flex flex-1 justify-center self-stretch gap-1 mx-2 xl:mx-4">
                {dockItems.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onMouseEnter={() => prefetchRoute(item.path)}
                      onFocus={() => prefetchRoute(item.path)}
                      aria-label={item.label}
                      aria-current={active ? "page" : undefined}
                      title={item.label}
                      className={cn(
                        "group relative flex items-center px-1 xl:px-2",
                        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className={cn(
                        "flex h-11 w-14 xl:w-24 items-center justify-center rounded-xl transition-colors",
                        !active && "group-hover:bg-secondary"
                      )}>
                        <item.icon className="h-6 w-6" />
                      </span>
                      {active && <span className="absolute inset-x-1 xl:inset-x-2 bottom-0 h-[3px] rounded-t-full bg-primary" />}
                    </Link>
                  );
                })}
              </nav>
            )}

            {/* Right - Action Icons */}
            <div className="flex items-center gap-1.5">
              {/* Mobile top bar, as in Facebook's app: plain create, search and Messenger icons.
                  Notifications and everything else live in the bottom tab bar. */}
              {currentUserId && (
                <div className="flex md:hidden items-center gap-1.5">
                  {/* Round, softly outlined buttons, as in the mockup. */}
                  {[
                    { label: "Create post", icon: <PlusCircle className="h-[17px] w-[17px]" aria-hidden="true" />, onClick: () => navigate("/?compose=1") },
                    { label: "Search", icon: <MagnifyingGlass className="h-[16px] w-[16px]" aria-hidden="true" />, onClick: () => setMobileSearchOpen(true) },
                    {
                      label: unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : "Messages",
                      icon: <MessengerLogo className="h-[17px] w-[17px]" aria-hidden="true" />,
                      onClick: () => navigate("/messages"),
                      dot: unreadMessages > 0,
                    },
                  ].map((b) => (
                    <button
                      key={b.label}
                      type="button"
                      onClick={b.onClick}
                      aria-label={b.label}
                      className="relative flex h-8 w-8 items-center justify-center rounded-full border border-border bg-secondary/60 text-foreground transition-colors active:bg-secondary"
                    >
                      {b.icon}
                      {b.dot && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-card" aria-hidden="true" />}
                    </button>
                  ))}
                  {/* Your photo: opens your profile. */}
                  <button
                    type="button"
                    onClick={() => navigate(`/profile/${currentUserId}`)}
                    aria-label="Your profile"
                    className="relative ml-0.5 rounded-full ring-2 ring-border"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={userProfile?.avatar_url || undefined} alt="" />
                      <AvatarFallback className="text-sm font-semibold">{userProfile?.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-card shadow-[0_0_6px_hsl(var(--primary))]" aria-hidden="true" />
                  </button>
                </div>
              )}
              {currentUserId && (
                <div className="hidden md:flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-full bg-secondary/60 hover:bg-secondary relative"
                          onClick={() => navigate("/friends")}
                          onMouseEnter={() => prefetchRoute("/friends")}
                        >
                          <UserPlus className="h-5 w-5" />
                          {pendingRequests > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 gradient-brand text-primary-foreground text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center badge-pulse">
                              {pendingRequests > 9 ? "9+" : pendingRequests}
                            </span>
                          )}
                        </Button>
                      </motion.div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs font-medium">Friends</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-full bg-secondary/60 hover:bg-secondary relative"
                          onClick={() => navigate("/notifications")}
                          onMouseEnter={() => prefetchRoute("/notifications")}
                        >
                          <Bell className="h-5 w-5" />
                          {unreadNotifications > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 gradient-brand text-primary-foreground text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center badge-pulse">
                              {unreadNotifications > 9 ? "9+" : unreadNotifications}
                            </span>
                          )}
                        </Button>
                      </motion.div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs font-medium">Notifications</TooltipContent>
                  </Tooltip>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }} transition={{ type: "spring", stiffness: 400, damping: 17 }}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 rounded-full p-0 overflow-hidden ring-2 ring-border/50 hover:ring-primary/40 transition-all duration-200"
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={userProfile?.avatar_url || undefined} />
                            <AvatarFallback className="gradient-brand-soft text-foreground font-semibold">
                              {userProfile?.full_name?.[0]?.toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                        </Button>
                      </motion.div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72 p-2 glass border-border/50 animate-scale-in">
                      <DropdownMenuItem
                        className="p-3 cursor-pointer rounded-xl focus:bg-accent/10"
                        onClick={() => navigate(`/profile/${currentUserId}`)}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-12 w-12 ring-2 ring-border/50">
                            <AvatarImage src={userProfile?.avatar_url || undefined} />
                            <AvatarFallback className="gradient-brand-soft font-semibold">
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
                      <DropdownMenuItem className="p-3 cursor-pointer rounded-xl focus:bg-accent/10" onClick={() => navigate("/saved")}>
                        <Bookmark className="h-4 w-4 mr-3" />
                        Saved Posts
                      </DropdownMenuItem>
                      <DropdownMenuItem className="p-3 cursor-pointer rounded-xl focus:bg-accent/10" onClick={() => navigate("/events")}>
                        <CalendarDays className="h-4 w-4 mr-3" />
                        Events
                      </DropdownMenuItem>
                      <DropdownMenuItem className="p-3 cursor-pointer rounded-xl focus:bg-accent/10" onClick={() => navigate("/marketplace")}>
                        <ShoppingBag className="h-4 w-4 mr-3" />
                        Marketplace
                      </DropdownMenuItem>
                      <DropdownMenuItem className="p-3 cursor-pointer rounded-xl focus:bg-accent/10" onClick={() => navigate("/settings")}>
                        <Settings className="h-4 w-4 mr-3" />
                        Notification Settings
                      </DropdownMenuItem>
                      {isAdmin && (
                        <DropdownMenuItem className="p-3 cursor-pointer rounded-xl focus:bg-accent/10" onClick={() => navigate("/admin")}>
                          <Shield className="h-4 w-4 mr-3" />
                          Admin Dashboard
                        </DropdownMenuItem>
                      )}
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
      </header>

      {/* Tablet Floating Dock - centered bottom (hidden on Reels; wide screens use the top-bar tabs) */}
      {currentUserId && location.pathname !== "/reels" && location.pathname !== "/messages" && (
        <div className="app-dock hidden md:flex lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <motion.nav
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.2 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl glass-strong dock-nav"
          >
            {dockItems.map((item) => {
              const active = isActive(item.path);
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>
                    <motion.button
                      onClick={() => navigate(item.path)}
                      onMouseEnter={() => prefetchRoute(item.path)}
                      onFocus={() => prefetchRoute(item.path)}
                      whileHover={{ scale: 1.2, y: -6 }}
                      whileTap={{ scale: 0.9 }}
                      transition={{ type: "spring", stiffness: 400, damping: 17 }}
                      className={cn(
                        "relative flex items-center justify-center h-12 w-12 rounded-xl transition-colors duration-200",
                        active
                          ? "gradient-brand text-primary-foreground shadow-lg"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                    </motion.button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs font-medium glass border-border/50">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </motion.nav>
        </div>
      )}

      <MobileSearchOverlay open={mobileSearchOpen} onClose={() => setMobileSearchOpen(false)} />

      {/* Mobile Bottom Navigation */}
      {currentUserId && location.pathname !== "/messages" && <BottomNav currentUserId={currentUserId} friendRequests={pendingRequests} unreadNotifications={unreadNotifications} avatarUrl={userProfile?.avatar_url} name={userProfile?.full_name} />}
    </>
  );
};

/**
 * What pages render. Inside the app shell it draws nothing and only passes its settings on
 * (the shell draws the one header and bottom bar); elsewhere it draws the bars itself.
 */
const Navigation = (props: NavigationProps) => {
  const shell = useContext(NavShellContext);
  const hideTop = !!props.hideMobileTopBar;
  // Before paint, so the profile's cover never flashes under a top bar.
  useLayoutEffect(() => {
    if (!shell) return;
    shell.setHideMobileTopBar(hideTop);
    return () => shell.setHideMobileTopBar(false);
  }, [shell, hideTop]);
  if (shell) return null;
  return <AppNavigation {...props} />;
};

export default Navigation;
