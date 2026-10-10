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
  MessageCircle,
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
import { features } from "@/lib/features";
import { motion } from "framer-motion";

interface Shortcut {
  icon: LucideIcon;
  label: string;
  path: string;
  /** The icon's tile colour, like an app icon on a phone's home screen. */
  tile: string;
  adminOnly?: boolean;
  /** Muted for now (see features.extras). */
  extra?: boolean;
}

// Everything that isn't a bottom tab (Home, Friends, Reels, Groups, Notifications).
const SHORTCUTS: Shortcut[] = [
  { icon: MessageCircle, label: "Messages", path: "/messages", tile: "from-orange-400 to-primary" },
  { icon: CalendarDays, label: "Events", path: "/events", tile: "from-rose-400 to-rose-600" },
  { icon: Bookmark, label: "Saved", path: "/saved", tile: "from-violet-400 to-violet-600" },
  { icon: Compass, label: "Explore", path: "/explore", tile: "from-amber-300 to-amber-500" },
  { icon: ShoppingBag, label: "Marketplace", path: "/marketplace", tile: "from-sky-400 to-sky-600", extra: true },
  { icon: MonitorPlay, label: "Watch", path: "/watch", tile: "from-pink-400 to-pink-600", extra: true },
  { icon: FileText, label: "Pages", path: "/pages", tile: "from-orange-300 to-orange-500", extra: true },
  { icon: Megaphone, label: "Ad Manager", path: "/ads", tile: "from-yellow-400 to-amber-600", extra: true },
  { icon: Shield, label: "Admin", path: "/admin", tile: "from-slate-400 to-slate-600", adminOnly: true },
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
  useSEO({ title: "Menu", description: "Shortcuts to everything on Ember." });
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

        {/* Shortcuts: rounded app-icon tiles, four to a row, as on a phone's home screen. */}
        <nav aria-label="Shortcuts" className="feed-section grid grid-cols-4 gap-y-4 rounded-2xl border border-border bg-card px-2 py-4">
          {SHORTCUTS.filter((s) => (!s.adminOnly || isAdmin) && (!s.extra || features.extras)).map((s, i) => (
            <motion.button
              key={s.path}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.25 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => navigate(s.path)}
              className="group flex flex-col items-center gap-1.5 text-center"
            >
              <span className={cn("flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-gradient-to-br text-white shadow-sm transition-transform duration-200 group-hover:-translate-y-0.5", s.tile)}>
                <s.icon className="h-6 w-6" strokeWidth={2.1} />
              </span>
              <span className="text-[12px] font-medium leading-tight">{s.label}</span>
            </motion.button>
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
