import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bookmark,
  CalendarDays,
  ChevronRight,
  Compass,
  FileText,
  LogOut,
  Megaphone,
  MonitorPlay,
  Settings,
  Shield,
  ShoppingBag,
  UserPlus,
  Users,
  type LucideIcon,
  Download,
  History,
  LayoutDashboard,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { cn } from "@/lib/utils";
import { features } from "@/lib/features";
import { motion } from "framer-motion";
import { disablePush } from "@/lib/web-push";
import InviteFriends from "@/components/InviteFriends";
import GroupShortcuts from "@/components/GroupShortcuts";

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

// Everything that isn't a bottom tab (Home, Friends, Reels, Groups, Notifications) or the Messenger button.
const SHORTCUTS: Shortcut[] = [
  { icon: CalendarDays, label: "Events", path: "/events", tile: "from-rose-400 to-rose-600" },
  { icon: Bookmark, label: "Saved", path: "/saved", tile: "from-violet-400 to-violet-600" },
  { icon: Compass, label: "Explore", path: "/explore", tile: "from-amber-300 to-amber-500" },
  { icon: History, label: "Story archive", path: "/story-archive", tile: "from-orange-400 to-primary" },
  { icon: Download, label: "Offline videos", path: "/offline-videos", tile: "from-emerald-400 to-emerald-600" },
  { icon: ShoppingBag, label: "Marketplace", path: "/marketplace", tile: "from-sky-400 to-sky-600", extra: true },
  { icon: MonitorPlay, label: "Watch", path: "/watch", tile: "from-pink-400 to-pink-600", extra: true },
  { icon: FileText, label: "Pages", path: "/pages", tile: "from-orange-300 to-orange-500", extra: true },
  { icon: Megaphone, label: "Ad Manager", path: "/ads", tile: "from-yellow-400 to-amber-600", extra: true },
];

/** The rows under the shortcuts. Messages isn't here: it's the Messenger button in the top bar. */
const ROWS: { icon: LucideIcon; label: string; path: string; adminOnly?: boolean }[] = [
  { icon: Settings, label: "Settings & privacy", path: "/settings" },
  { icon: FileText, label: "Terms of service", path: "/terms" },
  { icon: Shield, label: "Privacy policy", path: "/privacy" },
  { icon: LayoutDashboard, label: "Admin", path: "/admin", adminOnly: true },
];

/**
 * The Menu tab, as in Facebook's app: a full page (not a pop-up) with your profile,
 * a grid of shortcuts to every other section, then settings, help and log out.
 */
/** What the menu showed last time, so coming back to it doesn't flash "Your profile" and "–". */
let lastSeen: {
  userId: string;
  profile: { full_name: string | null; avatar_url: string | null } | null;
  friendCount: number | null;
  requestCount: number;
  isAdmin: boolean;
} | null = null;

const Menu = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  useSEO({ title: "Menu", description: "Shortcuts to everything on Ember." });
  const [userId, setUserId] = useState<string | null>(lastSeen?.userId ?? null);
  const [profile, setProfile] = useState(lastSeen?.profile ?? null);
  const [friendCount, setFriendCount] = useState<number | null>(lastSeen?.friendCount ?? null);
  const [requestCount, setRequestCount] = useState(lastSeen?.requestCount ?? 0);
  const [isAdmin, setIsAdmin] = useState(lastSeen?.isAdmin ?? false);

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
    lastSeen = {
      userId: id,
      profile: profileData ?? null,
      friendCount: friends.error ? null : friends.count ?? 0,
      requestCount: requests.error ? 0 : requests.count ?? 0,
      isAdmin: !!role,
    };
  });

  useEffect(() => {
    load();
  }, [load]);

  const handleLogout = async () => {
    // This phone stops getting the account's alerts once you've logged out.
    await disablePush();
    lastSeen = null;
    await supabase.auth.signOut();
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
              <AvatarFallback className={cn("font-bold", profile ? "gradient-brand text-primary-foreground" : "animate-pulse bg-muted text-transparent")}>{initial}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              {profile ? (
                <span className="block truncate text-[17px] font-semibold">{profile.full_name || "Your profile"}</span>
              ) : (
                <Skeleton className="mb-1 h-5 w-36" />
              )}
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
              {friendCount === null ? <Skeleton className="h-4 w-20" /> : <span><strong>{friendCount}</strong> {friendCount === 1 ? "friend" : "friends"}</span>}
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

        {userId && <GroupShortcuts userId={userId} />}

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

        {userId && <InviteFriends userId={userId} className="feed-section" />}

        {/* Settings and help (appearance is in Settings) */}
        <section className="feed-section divide-y divide-border rounded-2xl border border-border bg-card">
          {ROWS.filter((r) => !r.adminOnly || isAdmin).map((r) => (
            <button
              key={r.path}
              type="button"
              onClick={() => navigate(r.path)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/60"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"><r.icon className="h-5 w-5" /></span>
              <span className="flex-1 font-semibold">{r.label}</span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          ))}
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
