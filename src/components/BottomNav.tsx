import { Camera, Film, Home, Pencil, PlusCircle, Users } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/lib/prefetch";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useBottomSpace } from "@/hooks/use-bottom-space";

/** Sent when the current tab is tapped again while already at the top of the page. */
export const TAB_RESELECT_EVENT = "cloudbook:tab-reselect";

interface BottomNavProps {
  currentUserId?: string;
  /** Pending friend requests, shown on the Friends tab. */
  friendRequests?: number;
  /** Your photo for the Menu tab, as Facebook shows it. */
  avatarUrl?: string | null;
  name?: string | null;
}

/**
 * The tab bar, docked to the bottom edge: Home, Friends, Create (a post, story or reel), Reels
 * and Menu (your photo; your profile, Groups and the rest are in the menu). Icons only, in ink;
 * the tab you're on turns solid. Notifications are the bell in the top bar.
 */
const BottomNav = ({ currentUserId, friendRequests = 0, avatarUrl, name }: BottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  // Toasts sit just above the tab bar (phones only; it's hidden on bigger screens).
  useBottomSpace("--dock-space", typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? "4.25rem" : null);

  const tabs = [
    { icon: Home, path: "/", label: "Home", badge: 0 },
    { icon: Users, path: "/friends", label: "Friends", badge: friendRequests },
    { icon: Film, path: "/reels", label: "Reels", badge: 0 },
  ];
  const isActive = (path: string) => (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path));
  // The Menu tab also stands for your own profile, which you open from the menu.
  const menuActive = location.pathname === "/menu" || (!!currentUserId && location.pathname === `/profile/${currentUserId}`);

  // Tapping the tab you're on scrolls back to the top; at the top, it refreshes (the feed listens).
  const reselect = () => {
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "smooth" });
    else window.dispatchEvent(new CustomEvent(TAB_RESELECT_EVENT, { detail: location.pathname }));
  };

  const tabClass = "relative flex min-w-0 items-center justify-center text-foreground";

  const renderTab = (tab: (typeof tabs)[number]) => {
    const active = isActive(tab.path);
    return (
      <motion.button
        key={tab.label}
        onClick={() => (active ? reselect() : navigate(tab.path))}
        onTouchStart={() => prefetchRoute(tab.path)}
        whileTap={{ scale: 0.9 }}
        aria-current={active ? "page" : undefined}
        aria-label={tab.badge > 0 ? `${tab.label}, ${tab.badge} new` : tab.label}
        className={tabClass}
      >
        <span className="relative flex h-11 w-12 items-center justify-center">
          {/* Outlines, solid on the tab you're on. */}
          <tab.icon className="h-[27px] w-[27px]" fill={active ? "currentColor" : undefined} />
          {tab.badge > 0 && (
            <span className="absolute -top-1 right-0 min-w-[18px] h-[18px] rounded-full bg-destructive px-1 text-[10px] font-bold leading-[18px] text-destructive-foreground text-center ring-2 ring-card">
              {tab.badge > 9 ? "9+" : tab.badge}
            </span>
          )}
        </span>
      </motion.button>
    );
  };

  return (
    // Docked to the bottom edge, full width, as on Facebook and Instagram; the phone's gesture
    // bar gets its own room underneath.
    <nav
      aria-label="Main"
      className={cn(
        "app-dock fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background pb-[env(safe-area-inset-bottom,0px)] md:hidden",
        // Over full-screen reels it stays dark, as on Facebook's video tab (no white strip under the video).
        location.pathname.startsWith("/reels") && "dark"
      )}
    >
      <div className="grid h-[58px] grid-cols-5 px-1">
        {tabs.slice(0, 2).map(renderTab)}

        {/* Create, in the middle: a post, a story or a reel. */}
        <div className="flex items-center justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <motion.button
                whileTap={{ scale: 0.9 }}
                aria-label="Create"
                className="flex h-11 w-12 items-center justify-center text-foreground"
              >
                <PlusCircle className="h-[31px] w-[31px]" />
              </motion.button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="center" sideOffset={10} className="w-48 rounded-2xl p-1.5">
              <DropdownMenuItem className="gap-3 rounded-xl py-2.5 text-[15px]" onSelect={() => navigate("/?compose=1")}>
                <Pencil className="h-5 w-5" /> Post
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-3 rounded-xl py-2.5 text-[15px]" onSelect={() => navigate("/?story=1")}>
                <Camera className="h-5 w-5" /> Story
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-3 rounded-xl py-2.5 text-[15px]" onSelect={() => navigate("/reels?create=1")}>
                <Film className="h-5 w-5" /> Reel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {tabs.slice(2).map(renderTab)}

        {/* Menu: your photo, as Facebook's last tab. */}
        <motion.button
          onClick={() => (location.pathname === "/menu" ? reselect() : navigate("/menu"))}
          onTouchStart={() => prefetchRoute("/menu")}
          whileTap={{ scale: 0.9 }}
          aria-current={menuActive ? "page" : undefined}
          aria-label="Menu"
          className={tabClass}
        >
          <span className="relative flex h-11 w-12 items-center justify-center">
            <Avatar className={cn("h-7 w-7 transition-shadow", menuActive ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "ring-1 ring-border")}>
              <AvatarImage src={avatarUrl || undefined} alt="" />
              <AvatarFallback className="text-[10px] font-bold">{name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
            </Avatar>
          </span>
        </motion.button>
      </div>
    </nav>
  );
};

export default BottomNav;
