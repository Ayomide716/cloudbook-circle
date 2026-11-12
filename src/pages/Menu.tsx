import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bookmark,
  ScanLine,
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
  Users,
  UsersRound,
  type LucideIcon,
  Download,
  History,
  LayoutDashboard,
} from "@/components/icons";
import Navigation from "@/components/Navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { cn } from "@/lib/utils";
import { features } from "@/lib/features";
import { disablePush } from "@/lib/web-push";
import InviteFriends from "@/components/InviteFriends";
import GroupShortcuts from "@/components/GroupShortcuts";
import QrScanner from "@/components/QrScanner";

interface Shortcut {
  icon: LucideIcon;
  label: string;
  path: string;
  adminOnly?: boolean;
  /** Muted for now (see features.extras). */
  extra?: boolean;
  group: "discover" | "yours";
}

/** The four at the top of the menu: one tap to the things you open most. */
const QUICK: { icon: LucideIcon; label: string; path: string; tint: string }[] = [
  { icon: Users, label: "Friends", path: "/friends", tint: "bg-primary/10 text-primary" },
  { icon: UsersRound, label: "Groups", path: "/groups", tint: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  { icon: Bookmark, label: "Saved", path: "/saved", tint: "bg-violet-500/10 text-violet-700 dark:text-violet-400" },
  { icon: CalendarDays, label: "Events", path: "/events", tint: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
];

// The rest, in two short lists. (Home, Reels and Chats are tabs; notifications are the bell.)
const SHORTCUTS: Shortcut[] = [
  { icon: Compass, label: "Explore", path: "/explore", group: "discover" },
  { icon: MonitorPlay, label: "Watch", path: "/watch", extra: true, group: "discover" },
  { icon: ShoppingBag, label: "Marketplace", path: "/marketplace", extra: true, group: "discover" },
  { icon: FileText, label: "Pages", path: "/pages", extra: true, group: "discover" },
  { icon: History, label: "Story archive", path: "/story-archive", group: "yours" },
  { icon: Download, label: "Offline videos", path: "/offline-videos", group: "yours" },
  { icon: Megaphone, label: "Ad Manager", path: "/ads", extra: true, group: "yours" },
];

/** One row of the menu: an icon, its name and a chevron. */
const MenuRow = ({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex h-[54px] w-full items-center gap-3.5 pl-4 pr-3 text-left transition-colors first:rounded-t-[20px] last:rounded-b-[20px] hover:bg-accent/60 active:bg-accent"
  >
    <Icon className="h-6 w-6 shrink-0 text-foreground" />
    <span className="flex-1 text-base font-medium">{label}</span>
    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/70" />
  </button>
);

/** Settings, the legal pages and (for admins) the admin page. */
const ROWS: { icon: LucideIcon; label: string; path: string; adminOnly?: boolean }[] = [
  { icon: Settings, label: "Settings & privacy", path: "/settings" },
  { icon: FileText, label: "Terms of service", path: "/terms" },
  { icon: Shield, label: "Privacy policy", path: "/privacy" },
  { icon: LayoutDashboard, label: "Admin", path: "/admin", adminOnly: true },
];

/**
 * The Menu tab, as in Facebook's app: a full page (not a pop-up) with your profile,
 * a simple list of shortcuts to every other section, then settings, help and log out.
 */
/** What the menu showed last time, so coming back to it doesn't flash "Your profile" and "–". */
let lastSeen: {
  userId: string;
  profile: { full_name: string | null; avatar_url: string | null; cover_url: string | null } | null;
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
  // The header couldn't load (patchy data): show a retry instead of placeholders that never fill.
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    const id = session.user.id;
    setUserId(id);
    setLoadFailed(false);
    const [{ data: profileData, error: profileError }, { data: role }, friends, requests] = await Promise.all([
      supabase.from("profiles").select("full_name, avatar_url, cover_url").eq("id", id).maybeSingle(),
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
    if (profileError || friends.error) setLoadFailed(true);
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
    // Back online after a failed load: fill the header in without a tap.
    const retry = () => load();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [load]);

  const [scanning, setScanning] = useState(false);
  const closeScanner = useCallback(() => setScanning(false), []);

  const handleLogout = async () => {
    // This phone stops getting the account's alerts once you've logged out.
    await disablePush();
    lastSeen = null;
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const initial = profile?.full_name?.[0]?.toUpperCase() || "U";

  const card = "rounded-[20px] bg-card dark:border dark:border-border";
  const sectionLabel = "px-1 pb-2 pt-3 text-[13px] font-bold uppercase tracking-wide text-muted-foreground";
  const visible = (s: Shortcut) => (!s.adminOnly || isAdmin) && (!s.extra || features.extras);

  return (
    // A soft grey page with white cards on it, so each group of things reads as one block.
    <div className="min-h-screen bg-secondary dark:bg-background">
      <Navigation currentUserId={userId || undefined} />

      <div className="mx-auto max-w-2xl px-4 pb-6 sm:py-4">
        <div className="flex h-12 items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight">Menu</h1>
          <button type="button" onClick={() => navigate("/settings")} aria-label="Settings and privacy" className="-mr-2.5 flex h-11 w-11 items-center justify-center rounded-full text-foreground active:bg-card">
            <Settings className="h-6 w-6" />
          </button>
        </div>

        {/* You: photo and name open your profile; the square on the right scans a friend's code. */}
        <section className={cn(card, "overflow-hidden")}>
          <div className="flex items-center gap-3 p-3.5">
            <button type="button" onClick={() => userId && navigate(`/profile/${userId}`)} aria-label="View your profile" className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <Avatar className="h-14 w-14 shrink-0">
                <AvatarImage src={profile?.avatar_url || undefined} alt="" />
                <AvatarFallback className={cn("text-lg font-bold", profile ? "bg-secondary text-foreground" : "animate-pulse bg-muted text-transparent")}>{initial}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                {profile || loadFailed ? (
                  <span className="block truncate text-[18px] font-bold leading-6">{profile?.full_name || "Your profile"}</span>
                ) : (
                  <Skeleton className="mb-1 h-5 w-32" />
                )}
                {friendCount === null && loadFailed ? (
                  <span className="block truncate text-sm text-muted-foreground">Couldn't load. Check your connection.</span>
                ) : (
                  <span className="block truncate text-sm text-muted-foreground">View your profile</span>
                )}
              </span>
            </button>
            <button type="button" onClick={() => setScanning(true)} aria-label="Scan a QR code" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground active:bg-muted">
              <ScanLine className="h-[22px] w-[22px]" />
            </button>
          </div>
          {loadFailed && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
              <span className="text-[13px] text-muted-foreground">Some details didn't load.</span>
              <Button variant="secondary" size="sm" onClick={() => load()} className="h-8 rounded-lg px-3 text-[13px] font-semibold">
                Try again
              </Button>
            </div>
          )}
        </section>
        <QrScanner open={scanning} onClose={closeScanner} />

        {/* The four you open most, one tap each. Friends shows how many requests are waiting. */}
        <nav aria-label="Shortcuts" className={cn(card, "mt-3 grid grid-cols-4 px-1 pb-3 pt-3.5")}>
          {QUICK.map((q) => {
            const count = q.path === "/friends" ? requestCount : 0;
            return (
              <button
                key={q.path}
                type="button"
                onClick={() => navigate(q.path)}
                aria-label={count > 0 ? `${q.label}, ${count} ${count === 1 ? "request" : "requests"}` : q.label}
                className="relative flex flex-col items-center gap-1.5 rounded-xl py-0.5 text-[13px] font-semibold active:opacity-70"
              >
                <span className={cn("flex h-[46px] w-[46px] items-center justify-center rounded-[15px]", q.tint)}>
                  <q.icon className="h-6 w-6" />
                </span>
                {q.label}
                {count > 0 && (
                  <span className="absolute -top-1 left-1/2 ml-3 h-[18px] min-w-[18px] rounded-full bg-badge px-1 text-center text-[11px] font-bold leading-[18px] text-white ring-2 ring-card">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {userId && <div className="mt-3 empty:hidden [&>section]:rounded-[20px] [&>section]:border-0 dark:[&>section]:border">
          <GroupShortcuts userId={userId} />
        </div>}

        {SHORTCUTS.some((s) => s.group === "discover" && visible(s)) && (
          <>
            <h2 className={sectionLabel}>Discover</h2>
            <section className={cn(card, "divide-y divide-border/60")}>
              {SHORTCUTS.filter((s) => s.group === "discover" && visible(s)).map((s) => (
                <MenuRow key={s.path} icon={s.icon} label={s.label} onClick={() => navigate(s.path)} />
              ))}
            </section>
          </>
        )}

        <h2 className={sectionLabel}>Your stuff</h2>
        <section className={cn(card, "divide-y divide-border/60")}>
          {SHORTCUTS.filter((s) => s.group === "yours" && visible(s)).map((s) => (
            <MenuRow key={s.path} icon={s.icon} label={s.label} onClick={() => navigate(s.path)} />
          ))}
        </section>

        {userId && <div className="mt-3 [&>*]:rounded-[20px] [&>*]:border-0 dark:[&>*]:border">
          <InviteFriends userId={userId} />
        </div>}

        {/* Settings and help (appearance is in Settings) */}
        <h2 className={sectionLabel}>Settings and help</h2>
        <section className={cn(card, "divide-y divide-border/60")}>
          {ROWS.filter((r) => !r.adminOnly || isAdmin).map((r) => (
            <MenuRow key={r.path} icon={r.icon} label={r.label} onClick={() => navigate(r.path)} />
          ))}
        </section>

        <Button variant="ghost" onClick={handleLogout} className={cn(card, "mt-3 h-[52px] w-full text-base font-semibold text-destructive hover:bg-card hover:text-destructive")}>
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </Button>
      </div>
    </div>
  );
};

export default Menu;
