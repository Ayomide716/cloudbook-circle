import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  Bookmark,
  CalendarDays,
  ChevronRight,
  Compass,
  FileText,
  HelpCircle,
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
import Navigation from "@/components/Navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { cn } from "@/lib/utils";

interface Shortcut {
  icon: LucideIcon;
  label: string;
  path: string;
  /** Tile icon colour, so the grid scans quickly (Facebook colours each shortcut). */
  tint: string;
  adminOnly?: boolean;
}

// Everything that isn't a bottom tab (Home, Reels, Friends, Groups, Notifications).
const SHORTCUTS: Shortcut[] = [
  { icon: ShoppingBag, label: "Marketplace", path: "/marketplace", tint: "text-sky-600 dark:text-sky-400" },
  { icon: MonitorPlay, label: "Watch", path: "/watch", tint: "text-rose-600 dark:text-rose-400" },
  { icon: CalendarDays, label: "Events", path: "/events", tint: "text-red-600 dark:text-red-400" },
  { icon: Bookmark, label: "Saved", path: "/saved", tint: "text-violet-600 dark:text-violet-400" },
  { icon: FileText, label: "Pages", path: "/pages", tint: "text-orange-600 dark:text-orange-400" },
  { icon: Compass, label: "Explore", path: "/explore", tint: "text-primary" },
  { icon: Megaphone, label: "Ad Manager", path: "/ads", tint: "text-amber-600 dark:text-amber-400" },
  { icon: Shield, label: "Admin", path: "/admin", tint: "text-slate-600 dark:text-slate-300", adminOnly: true },
];

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
] as const;

/**
 * The Menu tab, as in Facebook's app: a full page (not a pop-up) with your profile,
 * a grid of shortcuts to every other section, then settings, help and log out.
 */
const Menu = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setTheme, theme } = useTheme();
  useSEO({ title: "Menu", description: "Shortcuts to everything on CloudBook." });
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    const id = session.user.id;
    setUserId(id);
    const [{ data: profileData }, { data: role }, friends, requests] = await Promise.all([
      supabase.from("profiles").select("full_name, avatar_url").eq("id", id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", id).eq("role", "admin").maybeSingle(),
      supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("status", "accepted")
        .or(`user_id.eq.${id},friend_id.eq.${id}`),
      supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("friend_id", id),
    ]);
    if (profileData) setProfile(profileData);
    setIsAdmin(!!role);
    if (!friends.error) setFriendCount(friends.count ?? 0);
    if (!requests.error) setRequestCount(requests.count ?? 0);
  });

  useEffect(() => {
    load();
  }, [load]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Logged out successfully" });
    navigate("/auth");
  };

  const initial = profile?.full_name?.[0]?.toUpperCase() || "U";

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={userId || undefined} />

      <div className="page-flush max-w-2xl mx-auto px-0 sm:px-4 pb-6 sm:py-6 space-y-2 sm:space-y-4">
        <PageHeader title="Menu" className="sm:mb-0" />

        {/* You */}
        <section className="feed-section rounded-2xl border border-border bg-card">
          <button
            type="button"
            onClick={() => userId && navigate(`/profile/${userId}`)}
            className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent/60 rounded-t-2xl"
          >
            <Avatar className="h-12 w-12">
              <AvatarImage src={profile?.avatar_url || undefined} alt="" />
              <AvatarFallback className="gradient-brand text-primary-foreground font-bold">{initial}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[17px] font-semibold">{profile?.full_name || "Your profile"}</span>
              <span className="block text-sm text-muted-foreground">View your profile</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </button>
          <div className="grid grid-cols-2 border-t border-border">
            <button
              type="button"
              onClick={() => navigate("/friends")}
              className="flex items-center gap-2 px-4 py-3 text-left text-sm transition-colors hover:bg-accent/60"
            >
              <Users className="h-4 w-4 text-primary" />
              <span><strong>{friendCount ?? "–"}</strong> {friendCount === 1 ? "friend" : "friends"}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/friends")}
              className="flex items-center gap-2 border-l border-border px-4 py-3 text-left text-sm transition-colors hover:bg-accent/60"
            >
              <UserPlus className="h-4 w-4 text-primary" />
              <span><strong className={cn(requestCount > 0 && "text-primary")}>{requestCount}</strong> {requestCount === 1 ? "request" : "requests"}</span>
            </button>
          </div>
        </section>

        {/* Shortcuts: Facebook's two-column grid of tiles */}
        <nav aria-label="Shortcuts" className="grid grid-cols-2 gap-2 px-3 py-1 sm:px-0">
          {SHORTCUTS.filter((s) => !s.adminOnly || isAdmin).map((s) => (
            <button
              key={s.path}
              type="button"
              onClick={() => navigate(s.path)}
              className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-colors hover:bg-accent/60"
            >
              <s.icon className={cn("h-6 w-6", s.tint)} />
              <span className="text-[15px] font-semibold">{s.label}</span>
            </button>
          ))}
        </nav>

        {/* Settings, help and appearance */}
        <section className="feed-section divide-y divide-border rounded-2xl border border-border bg-card">
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/60"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"><Settings className="h-5 w-5" /></span>
            <span className="flex-1 font-semibold">Settings &amp; privacy</span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"><HelpCircle className="h-5 w-5" /></span>
            <span className="flex-1 font-semibold">Help &amp; support</span>
            <span className="flex gap-3 text-sm">
              <button type="button" onClick={() => navigate("/terms")} className="text-primary hover:underline">Terms</button>
              <button type="button" onClick={() => navigate("/privacy")} className="text-primary hover:underline">Privacy</button>
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <span className="font-semibold">Appearance</span>
            <div className="flex rounded-xl bg-secondary p-1" role="radiogroup" aria-label="Appearance">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={theme === t.value}
                  onClick={() => setTheme(t.value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                    theme === t.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="px-3 sm:px-0">
          <Button variant="secondary" onClick={handleLogout} className="h-11 w-full rounded-xl font-semibold">
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Menu;
