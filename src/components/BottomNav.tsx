import { Bell, FilmStrip, House, UsersFour, UsersThree } from "@phosphor-icons/react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/lib/prefetch";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
    { icon: UsersThree, path: "/friends", label: "Friends", badge: friendRequests },
    { icon: FilmStrip, path: "/reels", label: "Reels", badge: 0 },
    { icon: UsersFour, path: "/groups", label: "Groups", badge: 0 },
    { icon: Bell, path: "/notifications", label: "Notifications", badge: unreadNotifications },
  ];
  // A group's own page still counts as the Groups tab.
  const isActive = (path: string) => (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path));
  const profilePath = `/profile/${currentUserId ?? ""}`;
  const profileActive = !!currentUserId && location.pathname === profilePath;

  const tabClass = (active: boolean) =>
    cn("relative flex min-w-0 flex-col items-center justify-center gap-0.5 transition-colors", active ? "text-primary" : "text-muted-foreground");
  const label = (text: string, active: boolean) => (
    <span className={cn("max-w-full truncate text-[10px] tracking-tight leading-none", active ? "font-semibold" : "font-medium")}>{text}</span>
  );

  return (
    // Solid, and its colour runs on below the screen edge, so no strip of page shows under it
    // while the installed app settles into the space above the phone's gesture bar.
    <nav
      aria-label="Main"
      className="app-dock fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] after:absolute after:inset-x-0 after:top-full after:h-24 after:bg-card after:content-[''] md:hidden"
    >
      <div className="grid grid-cols-6 h-14">
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
              {active && <span className="absolute top-0 inset-x-0 h-[3px] bg-primary" />}
              <span className="relative">
                {/* As in Facebook's app: bold outlines, filled when selected. */}
                <tab.icon className="h-[26px] w-[26px]" weight={active ? "fill" : "bold"} aria-hidden="true" />
                {tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] rounded-full bg-destructive px-1 text-[10px] font-bold leading-[18px] text-destructive-foreground text-center">
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
          {profileActive && <span className="absolute top-0 inset-x-0 h-[3px] bg-primary" />}
          <Avatar className={cn("h-7 w-7", profileActive ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : "ring-1 ring-border")}>
            <AvatarImage src={avatarUrl || undefined} alt="" />
            <AvatarFallback className="text-[10px] font-bold">{name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
          </Avatar>
          {label("Profile", profileActive)}
        </motion.button>
      </div>
    </nav>
  );
};

export default BottomNav;
