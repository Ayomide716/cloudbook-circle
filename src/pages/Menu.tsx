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
  Pencil,
  Users,
  type LucideIcon,
  Download,
  History,
  LayoutDashboard,
} from "@/components/icons";
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
import { disablePush } from "@/lib/web-push";
import InviteFriends from "@/components/InviteFriends";
import GroupShortcuts from "@/components/GroupShortcuts";

interface Shortcut {
  icon: LucideIcon;
  label: string;
  path: string;
  adminOnly?: boolean;
  /** Muted for now (see features.extras). */
  extra?: boolean;
}

// Everything that isn't a bottom tab (Home, Friends, Reels) or in the top bar (notifications, Messenger).
const SHORTCUTS: Shortcut[] = [
  { icon: Users, label: "Groups", path: "/groups" },
  { icon: CalendarDays, label: "Events", path: "/events" },
  { icon: Bookmark, label: "Saved", path: "/saved" },
  { icon: Compass, label: "Explore", path: "/explore" },
  { icon: History, label: "Story archive", path: "/story-archive" },
  { icon: Download, label: "Offline videos", path: "/offline-videos" },
  { icon: ShoppingBag, label: "Marketplace", path: "/marketplace", extra: true },
  { icon: MonitorPlay, label: "Watch", path: "/watch", extra: true },
  { icon: FileText, label: "Pages", path: "/pages", extra: true },
  { icon: Megaphone, label: "Ad Manager", path: "/ads", extra: true },
];

/** One row of the menu: an icon, its name and a chevron. */
const MenuRow = ({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/60 active:bg-accent"
  >
    <Icon className="h-6 w-6 shrink-0 text-foreground" />
    <span className="flex-1 text-[15px] font-medium">{label}</span>
    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/70" />
  </button>
);

/** The rows under the shortcuts. Messages isn't here: it's the Messenger button in the top bar. */
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

  const load = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    const id = session.user.id;
    setUserId(id);
    const [{ data: profileData }, { data: role }, friends, requests] = await Promise.all([
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

        {/* You: cover, avatar, name and counts, with Edit profile */}
        <section className="feed-section overflow-hidden rounded-2xl border border-border bg-card">
          <button
            type="button"
            onClick={() => userId && navigate(`/profile/${userId}`)}
            aria-label="View your profile"
            className="block h-24 w-full bg-secondary bg-cover bg-center"
            style={profile?.cover_url ? { backgroundImage: `url(${profile.cover_url})` } : undefined}
          />
          <div className="flex items-end gap-3 px-4 pb-4">
            <button type="button" onClick={() => userId && navigate(`/profile/${userId}`)} className="-mt-8 shrink-0 rounded-full">
              <Avatar className="h-[72px] w-[72px] ring-4 ring-card">
                <AvatarImage src={profile?.avatar_url || undefined} alt="" />
                <AvatarFallback className={cn("text-xl font-bold", profile ? "bg-secondary text-foreground" : "animate-pulse bg-muted text-transparent")}>{initial}</AvatarFallback>
              </Avatar>
            </button>
            <button type="button" onClick={() => userId && navigate(`/profile/${userId}`)} className="min-w-0 flex-1 pt-2 text-left">
              {profile ? (
                <span className="block truncate text-[17px] font-semibold">{profile.full_name || "Your profile"}</span>
              ) : (
                <Skeleton className="mb-1 h-5 w-32" />
              )}
              {friendCount === null ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <span className="block truncate text-[13px] text-muted-foreground">
                  {friendCount} {friendCount === 1 ? "friend" : "friends"}
                  {requestCount > 0 && <span className="text-primary"> · {requestCount} {requestCount === 1 ? "request" : "requests"}</span>}
                </span>
              )}
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => userId && navigate(`/profile/${userId}`, { state: { edit: true } })}
              aria-label="Edit profile"
              className="h-8 shrink-0 rounded-lg px-3 text-[13px] font-semibold"
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        </section>

        {userId && <GroupShortcuts userId={userId} />}

        {/* Shortcuts: one simple list, an icon, a name and a chevron per row. */}
        <nav aria-label="Shortcuts" className="feed-section divide-y divide-border/60 rounded-2xl border border-border bg-card">
          {SHORTCUTS.filter((s) => (!s.adminOnly || isAdmin) && (!s.extra || features.extras)).map((s) => (
            <MenuRow key={s.path} icon={s.icon} label={s.label} onClick={() => navigate(s.path)} />
          ))}
        </nav>

        {userId && <InviteFriends userId={userId} className="feed-section" />}

        {/* Settings and help (appearance is in Settings) */}
        <section className="feed-section divide-y divide-border/60 rounded-2xl border border-border bg-card">
          {ROWS.filter((r) => !r.adminOnly || isAdmin).map((r) => (
            <MenuRow key={r.path} icon={r.icon} label={r.label} onClick={() => navigate(r.path)} />
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
