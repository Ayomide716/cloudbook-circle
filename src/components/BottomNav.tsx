import { Bell, House, Users, UsersThree } from "@phosphor-icons/react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/lib/prefetch";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
 * Profile, the current tab glowing teal.
 * (Facebook's fourth tab is Marketplace; CloudBook keeps Groups there. The Menu is the
 * ☰ button in the top bar.)
 */
const BottomNav = ({ currentUserId, friendRequests = 0, unreadNotifications = 0, avatarUrl, name }: BottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();
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
    cn("relative flex min-w-0 min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card", active ? "text-primary" : "text-muted-foreground hover:text-foreground");
  // The selected tab glows: a soft cyan disc behind the icon and a dot under its name.
  const iconWrap = (active: boolean) =>
    cn("relative flex h-[32px] w-[32px] items-center justify-center rounded-full transition-colors duration-200",
      active && "bg-primary/12");
  const label = (text: string, active: boolean) => (
    <span className="flex flex-col items-center gap-[3px]">
      <span className={cn("max-w-full truncate text-[10px] leading-none tracking-[-0.01em]", active ? "font-semibold" : "font-medium")}>{text}</span>
      <span className={cn("h-[3px] w-[3px] rounded-full", active ? "bg-primary shadow-[0_0_4px_hsl(var(--primary))]" : "bg-transparent")} aria-hidden="true" />
    </span>
  );

  return (
    // A floating pill above the bottom edge of the screen.
    <nav
      aria-label="Main"
      className="app-dock fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))] z-50 rounded-[1.35rem] border border-border/80 bg-card/95 shadow-[0_8px_28px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-[linear-gradient(180deg,hsl(214_45%_11%/0.97),hsl(218_50%_7.5%/0.97))] dark:shadow-[0_10px_30px_-14px_rgba(0,0,0,0.75)] md:hidden"
    >
      <div className="grid grid-cols-6 min-h-[64px] items-center px-1.5 py-1">
        {tabs.map((tab) => {
          const active = isActive(tab.path);
          return (
            <motion.button
              key={tab.label}
              onClick={() => (active ? reselect() : navigate(tab.path))}
              onTouchStart={() => prefetchRoute(tab.path)}
              whileTap={{ scale: 0.96 }}
              aria-current={active ? "page" : undefined}
              aria-label={tab.badge > 0 ? `${tab.label}, ${tab.badge} new` : tab.label}
              className={tabClass(active)}
            >
              <span className={iconWrap(active)}>
                {/* Light outlines, filled when selected. */}
                <tab.icon className="h-[22px] w-[22px]" weight={active ? "fill" : "regular"} aria-hidden="true" />
                {tab.badge > 0 && (
                  <span className="absolute -top-0.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-destructive px-1 text-[10px] font-bold leading-[18px] text-destructive-foreground text-center">
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
            <Avatar className={cn("h-[26px] w-[26px]", profileActive ? "ring-2 ring-primary" : "ring-1 ring-border")}>
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
