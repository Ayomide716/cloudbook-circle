import type { ReactNode } from "react";
import { Bell, Film, Home, PlusCircle, Search, Send, Users } from "@/components/icons";
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
              {[Search, Bell, Send].map((Icon, i) => (
                <span key={i} className="flex h-11 w-11 items-center justify-center"><Icon className="h-6 w-6" /></span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="max-md:pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]">{children}</div>
      <div
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background pb-[env(safe-area-inset-bottom,0px)] md:hidden"
        aria-hidden="true"
      >
        <div className="grid h-[58px] grid-cols-5 items-center px-1 text-foreground">
          {([[Home, "Home"], [Users, "Friends"], [PlusCircle, "Create"], [Film, "Reels"]] as const).map(([Icon, label], i) => (
            <span key={label} className="flex flex-col items-center gap-0.5">
              <Icon className="h-[25px] w-[25px]" fill={i === 0 && path === "/" ? "currentColor" : undefined} />
              <span className={i === 0 && path === "/" ? "text-[11px] font-bold leading-none" : "text-[11px] font-medium leading-none text-muted-foreground"}>{label}</span>
            </span>
          ))}
          <span className="flex flex-col items-center gap-0.5">
            <span className="h-[25px] w-[25px] rounded-full bg-secondary" />
            <span className="text-[11px] font-medium leading-none text-muted-foreground">Menu</span>
          </span>
        </div>
      </div>
    </>
  );
};

export default BootBars;
