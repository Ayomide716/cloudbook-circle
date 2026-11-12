import type { ReactNode } from "react";
import { Bell, Film, Home, MessageCircle, Plus, Search } from "@/components/icons";
import Wordmark from "@/components/Wordmark";
import { isSubPage } from "@/lib/sub-pages";

/**
 * Still copies of the phone's top bar and tab bar, shown around a page's skeleton in the moment
 * before the sign-in check finishes (the real bars only appear once it has). Without them the
 * skeleton started right under the status bar and ran down behind the gesture bar.
 */
const BootBars = ({ path, children }: { path: string; children: ReactNode }) => {
  // Pages without the ember. bar on phones (sub-pages, the profile's cover) still keep clear
  // of the status bar.
  const topBar = !isSubPage(path) && !path.startsWith("/profile/");
  return (
    <>
      <div className="safe-area-top md:hidden" aria-hidden="true">
        {topBar && (
          <div className="flex h-[var(--nav-height)] items-center justify-between border-b border-border/50 px-3">
            <Wordmark className="text-[28px]" />
            <div className="-mr-2 flex items-center text-foreground">
              {[Search, Bell].map((Icon, i) => (
                <span key={i} className="flex h-11 w-11 items-center justify-center"><Icon className="h-6 w-6" /></span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="max-md:pb-[calc(3.9rem+env(safe-area-inset-bottom,0px))]">{children}</div>
      <div
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background pb-[env(safe-area-inset-bottom,0px)] md:hidden"
        aria-hidden="true"
      >
        {/* The same five as the real tab bar: Home, Reels, Create, Chats, Menu. */}
        <div className="grid h-[52px] grid-cols-5 items-center px-1">
          {([[Home, "Home", "/"], [Film, "Reels", "/reels"]] as const).map(([Icon, label, to]) => (
            <span key={label} className={path === to ? "flex flex-col items-center gap-[3px] text-primary" : "flex flex-col items-center gap-[3px] text-muted-foreground"}>
              <Icon className="h-[22px] w-[22px]" fill={path === to ? "currentColor" : undefined} />
              <span className={path === to ? "text-[10px] font-bold leading-none" : "text-[10px] font-medium leading-none"}>{label}</span>
            </span>
          ))}
          <span className="flex items-center justify-center">
            <span className="flex h-[34px] w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Plus className="h-5 w-5" strokeWidth={2.4} /></span>
          </span>
          <span className={path === "/messages" ? "flex flex-col items-center gap-[3px] text-primary" : "flex flex-col items-center gap-[3px] text-muted-foreground"}>
            <MessageCircle className="h-[22px] w-[22px]" fill={path === "/messages" ? "currentColor" : undefined} />
            <span className={path === "/messages" ? "text-[10px] font-bold leading-none" : "text-[10px] font-medium leading-none"}>Chats</span>
          </span>
          <span className="flex flex-col items-center gap-[3px] text-muted-foreground">
            <span className="h-[22px] w-[22px] rounded-full bg-secondary" />
            <span className="text-[10px] font-medium leading-none">Menu</span>
          </span>
        </div>
      </div>
    </>
  );
};

export default BootBars;
