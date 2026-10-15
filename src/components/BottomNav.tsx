import { Bell, House, Users, UsersThree } from "@phosphor-icons/react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/lib/prefetch";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useBottomSpace } from "@/hooks/use-bottom-space";

/** Reels: a rounded screen with a play button, filled when selected. */
const ReelsIcon = ({ className, weight }: { className?: string; weight?: "fill" | "regular" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" fill={weight === "fill" ? "currentColor" : "none"} fillOpacity={0.18} />
    <path d="M3.5 8h17M9 3.5 11 8M15 3.5 17 8" />
    <path d="M10.2 11.3v5.4l4.6-2.7z" fill="currentColor" stroke="none" />
  </svg>
);

/** Sent when the current tab is tapped again while already at the top of the page. */
export const TAB_RESELECT_EVENT = "cloudbook:tab-reselect";

interface BottomNavProps {
  currentUserId?: string;
  /** Pending friend requests, shown on the Friends tab. */
  friendRequests?: number;
  /** Unread notifications, shown on the Notifications tab. */
  unreadNotifications?: number;
  /** Your photo for the Profile tab, as Facebook shows it. */
  avatarUrl?: string | null;
  name?: string | null;
}

/**
 * The tab bar, a floating pill: Home, Friends, Reels, Groups, Notifications and your
 * Profile, the current tab filled in tangerine on a soft tinted pill.
 * (Facebook's fourth tab is Marketplace; Ember keeps Groups there. The Menu is the
 * ☰ button in the top bar.)
 */
const BottomNav = ({ currentUserId, friendRequests = 0, unreadNotifications = 0, avatarUrl, name }: BottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  // Toasts sit just above the tab bar (phones only; it's hidden on bigger screens).
  useBottomSpace("--dock-space", typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? "5rem" : null);

  const tabs = [
    { icon: House, path: "/", label: "Home", badge: 0 },
    { icon: Users, path: "/friends", label: "Friends", badge: friendRequests },
    { icon: ReelsIcon, path: "/reels", label: "Reels", badge: 0 },
    { icon: UsersThree, path: "/groups", label: "Groups", badge: 0 },
    { icon: Bell, path: "/notifications", label: "Notifications", badge: unreadNotifications },
  ];
  // A group's own page still counts as the Groups tab.
  const isActive = (path: string) => (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path));
  const profilePath = `/profile/${currentUserId ?? ""}`;
  const profileActive = !!currentUserId && location.pathname === profilePath;

  // Tapping the tab you're on scrolls back to the top; at the top, it refreshes (the feed listens).
  const reselect = () => {
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "smooth" });
    else window.dispatchEvent(new CustomEvent(TAB_RESELECT_EVENT, { detail: location.pathname }));
  };

  const tabClass = (active: boolean) =>
    cn("relative flex min-w-0 flex-col items-center justify-center gap-0.5 transition-colors", active ? "text-primary" : "text-muted-foreground");
  // The selected tab sits on a soft tangerine pill, as on iOS and Android.
  const iconWrap = (active: boolean) =>
    cn("relative flex h-[30px] w-[46px] items-center justify-center rounded-full transition-all duration-300 ease-out",
      active ? "bg-primary/15 scale-100" : "scale-95");
  const label = (text: string, active: boolean) => (
    <span className="flex flex-col items-center gap-[3px]">
      <span className={cn("max-w-full truncate text-[10px] tracking-tight leading-none", active ? "font-semibold" : "font-medium")}>{text}</span>
    </span>
  );

  return (
    // A floating pill above the bottom edge of the screen.
    <nav
      aria-label="Main"
      className="app-dock fixed inset-x-3 bottom-[calc(0.625rem+env(safe-area-inset-bottom,0px))] z-50 rounded-[28px] border border-border/80 bg-card/85 shadow-[var(--shadow-dock)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
    >
      <div className="grid grid-cols-6 h-[62px] px-1">
        {tabs.map((tab) => {
          const active = isActive(tab.path);
          return (
            <motion.button
              key={tab.label}
              onClick={() => (active ? reselect() : navigate(tab.path))}
              onTouchStart={() => prefetchRoute(tab.path)}
              whileTap={{ scale: 0.9 }}
              aria-current={active ? "page" : undefined}
              aria-label={tab.badge > 0 ? `${tab.label}, ${tab.badge} new` : tab.label}
              className={tabClass(active)}
            >
              <span className={iconWrap(active)}>
                {/* Light outlines, filled when selected. */}
                <tab.icon className="h-[23px] w-[23px]" weight={active ? "fill" : "regular"} aria-hidden="true" />
                {tab.badge > 0 && (
                  <span className="absolute -top-1 right-0 min-w-[18px] h-[18px] rounded-full bg-destructive px-1 text-[10px] font-bold leading-[18px] text-destructive-foreground text-center ring-2 ring-card">
                    {tab.badge > 9 ? "9+" : tab.badge}
                  </span>
                )}
              </span>
              {label(tab.label, active)}
            </motion.button>
          );
        })}

        {/* Profile: your photo, as Facebook's last tab. */}
        <motion.button
          onClick={() => (profileActive ? reselect() : currentUserId && navigate(profilePath))}
          whileTap={{ scale: 0.9 }}
          aria-current={profileActive ? "page" : undefined}
          aria-label="Profile"
          className={tabClass(profileActive)}
        >
          <span className={iconWrap(profileActive)}>
            <Avatar className={cn("h-[26px] w-[26px] transition-shadow", profileActive ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : "ring-1 ring-border")}>
              <AvatarImage src={avatarUrl || undefined} alt="" />
              <AvatarFallback className="text-[10px] font-bold">{name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
            </Avatar>
          </span>
          {label("Profile", profileActive)}
        </motion.button>
      </div>
    </nav>
  );
};

export default BottomNav;
