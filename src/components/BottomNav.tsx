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
 * The tab bar, laid out like Facebook's app: Home, Friends, Reels, Groups, Notifications
 * and your Profile along the bottom, the current tab in teal with a line on top.
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

  const tabClass = (active: boolean) =>
    cn("relative flex min-w-0 flex-col items-center justify-center gap-0.5 transition-colors", active ? "text-primary" : "text-muted-foreground");
  // The selected tab glows: a soft cyan disc behind the icon and a dot under its name.
  const iconWrap = (active: boolean) =>
    cn("relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200",
      active && "bg-primary/15 shadow-[0_0_22px_hsl(var(--primary)/0.45)]");
  const label = (text: string, active: boolean) => (
    <span className="flex flex-col items-center gap-[3px]">
      <span className={cn("max-w-full truncate text-[11px] tracking-tight leading-none", active ? "font-semibold" : "font-medium")}>{text}</span>
      <span className={cn("h-1 w-1 rounded-full", active ? "bg-primary" : "bg-transparent")} aria-hidden="true" />
    </span>
  );

  return (
    // Solid, and its colour runs on below the screen edge, so no strip of page shows under it
    // while the installed app settles into the space above the phone's gesture bar.
    <nav
      aria-label="Main"
      className="app-dock fixed bottom-0 inset-x-0 z-50 rounded-t-[26px] border border-b-0 border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.45)] after:absolute after:inset-x-0 after:top-full after:h-24 after:bg-card after:content-[''] md:hidden"
    >
      <div className="grid grid-cols-6 h-[70px] pt-1">
        {tabs.map((tab) => {
          const active = isActive(tab.path);
          return (
            <motion.button
              key={tab.label}
              onClick={() => navigate(tab.path)}
              onTouchStart={() => prefetchRoute(tab.path)}
              whileTap={{ scale: 0.9 }}
              aria-current={active ? "page" : undefined}
              aria-label={tab.badge > 0 ? `${tab.label}, ${tab.badge} new` : tab.label}
              className={tabClass(active)}
            >
              <span className={iconWrap(active)}>
                {/* Light outlines, filled when selected. */}
                <tab.icon className="h-[26px] w-[26px]" weight={active ? "fill" : "regular"} aria-hidden="true" />
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
          onClick={() => currentUserId && navigate(profilePath)}
          whileTap={{ scale: 0.9 }}
          aria-current={profileActive ? "page" : undefined}
          aria-label="Profile"
          className={tabClass(profileActive)}
        >
          <span className={iconWrap(profileActive)}>
            <Avatar className={cn("h-8 w-8", profileActive ? "ring-2 ring-primary" : "ring-1 ring-border")}>
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
