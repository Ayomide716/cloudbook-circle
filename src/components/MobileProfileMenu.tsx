import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Bookmark,
  CalendarDays,
  ChevronRight,
  FileText,
  LogOut,
  Megaphone,
  Monitor,
  MonitorPlay,
  Moon,
  Settings,
  Shield,
  ShoppingBag,
  Sun,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useEffectEvent } from "@/hooks/use-effect-event";

interface MobileProfileMenuProps {
  currentUserId: string;
}

interface Shortcut {
  icon: LucideIcon;
  label: string;
  path: string;
  adminOnly?: boolean;
}

// Places that aren't in the bottom bar (Home, Explore, Reels, Chats).
const SHORTCUTS: Shortcut[] = [
  { icon: Users, label: "Communities", path: "/groups" },
  { icon: MonitorPlay, label: "Watch", path: "/watch" },
  { icon: CalendarDays, label: "Events", path: "/events" },
  { icon: ShoppingBag, label: "Marketplace", path: "/marketplace" },
  { icon: FileText, label: "Pages", path: "/pages" },
  { icon: Bookmark, label: "Saved", path: "/saved" },
  { icon: Megaphone, label: "Ad Manager", path: "/ads" },
  { icon: Settings, label: "Settings", path: "/settings" },
  { icon: Shield, label: "Admin", path: "/admin", adminOnly: true },
];

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
] as const;

/** Phone "Menu": a bottom sheet with your profile, friend counts and shortcuts to every section. */
const MobileProfileMenu = ({ currentUserId }: MobileProfileMenuProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setTheme, theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadProfile = useEffectEvent(async () => {
    const [{ data: profileData }, { data: role }] = await Promise.all([
      supabase.from("profiles").select("full_name, avatar_url").eq("id", currentUserId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", currentUserId).eq("role", "admin").maybeSingle(),
    ]);
    if (profileData) setProfile(profileData);
    setIsAdmin(!!role);
  });

  // Fresh numbers every time: accepted friendships either way round, and requests waiting for you.
  const loadCounts = useEffectEvent(async () => {
    const [friends, requests] = await Promise.all([
      supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("status", "accepted")
        .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`),
      supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("friend_id", currentUserId),
    ]);
    if (!friends.error) setFriendCount(friends.count ?? 0);
    if (!requests.error) setRequestCount(requests.count ?? 0);
  });

  useEffect(() => {
    loadProfile();
    loadCounts();
    const channel = supabase
      .channel(`mobile-menu-friendships-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => loadCounts())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, loadProfile, loadCounts]);

  useEffect(() => {
    if (open) loadCounts();
  }, [open, loadCounts]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const handleLogout = async () => {
    setOpen(false);
    await supabase.auth.signOut();
    toast({ title: "Logged out successfully" });
    navigate("/auth");
  };

  const initial = profile?.full_name?.[0]?.toUpperCase() || "U";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full p-0 ring-2 ring-border"
          aria-label={requestCount > 0 ? `Menu, ${requestCount} friend request${requestCount === 1 ? "" : "s"}` : "Menu"}
        >
          <Avatar className="h-9 w-9">
            <AvatarImage src={profile?.avatar_url || undefined} alt="" />
            <AvatarFallback className="text-sm">{initial}</AvatarFallback>
          </Avatar>
          {requestCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full gradient-brand ring-2 ring-background" />
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="rounded-t-3xl p-0 max-h-[calc(88dvh-var(--keyboard-inset,0px))] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-muted-foreground/25" aria-hidden />
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Your profile, friends and shortcuts to every section</SheetDescription>

        <div className="px-4 pt-3 pb-4 space-y-4">
          {/* Profile */}
          <button
            onClick={() => go(`/profile/${currentUserId}`)}
            className="w-full flex items-center gap-3 rounded-2xl p-3 bg-secondary/60 hover:bg-secondary transition-colors text-left"
          >
            <Avatar className="h-12 w-12 ring-2 ring-primary/20">
              <AvatarImage src={profile?.avatar_url || undefined} alt="" />
              <AvatarFallback className="gradient-brand text-primary-foreground font-bold">{initial}</AvatarFallback>
            </Avatar>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold truncate">{profile?.full_name || "Your profile"}</span>
              <span className="block text-xs text-muted-foreground">View your profile</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>

          {/* Friends */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => go("/friends")}
              className="flex items-center gap-3 rounded-2xl border border-border/70 p-3 hover:bg-accent transition-colors text-left"
            >
              <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Users className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-bold leading-tight">{friendCount ?? "–"}</span>
                <span className="block text-xs text-muted-foreground">{friendCount === 1 ? "Friend" : "Friends"}</span>
              </span>
            </button>
            <button
              onClick={() => go("/friends")}
              className={cn(
                "flex items-center gap-3 rounded-2xl border p-3 transition-colors text-left",
                requestCount > 0 ? "border-primary/40 bg-primary/5 hover:bg-primary/10" : "border-border/70 hover:bg-accent"
              )}
            >
              <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <UserPlus className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-bold leading-tight">{requestCount}</span>
                <span className="block text-xs text-muted-foreground">{requestCount === 1 ? "Request" : "Requests"}</span>
              </span>
            </button>
          </div>

          {/* Shortcuts */}
          <nav aria-label="Shortcuts" className="grid grid-cols-3 gap-2">
            {SHORTCUTS.filter((s) => !s.adminOnly || isAdmin).map((s) => (
              <button
                key={s.path}
                onClick={() => go(s.path)}
                className="flex flex-col items-center gap-2 rounded-2xl bg-secondary/50 hover:bg-accent py-3.5 px-1 transition-colors"
              >
                <span className="h-10 w-10 rounded-xl bg-card text-primary shadow-sm flex items-center justify-center">
                  <s.icon className="h-5 w-5" />
                </span>
                <span className="text-xs font-medium">{s.label}</span>
              </button>
            ))}
          </nav>

          {/* Appearance */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Appearance</span>
            <div className="flex rounded-xl bg-secondary/70 p-1" role="radiogroup" aria-label="Appearance">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  role="radio"
                  aria-checked={theme === t.value}
                  onClick={() => setTheme(t.value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                    theme === t.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="outline"
            onClick={handleLogout}
            className="w-full rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Log out
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileProfileMenu;
