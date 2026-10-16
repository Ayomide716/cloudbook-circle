import { useEffect, useRef, useState } from "react";
import { WifiOff } from "@/components/icons";
import { toast } from "@/hooks/use-toast";
import { useBottomSpace } from "@/hooks/use-bottom-space";

/**
 * "No internet connection" while the phone is offline, as in Facebook's and Instagram's apps, so
 * a post or message that won't send isn't a mystery. "Back online" when it returns.
 */
const ConnectionBar = () => {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  const barRef = useRef<HTMLDivElement>(null);
  useBottomSpace("--offline-space", offline ? barRef : null);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline((was) => {
        if (was) toast({ title: "Back online" });
        return false;
      });
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      ref={barRef}
      role="status"
      className="pointer-events-none fixed inset-x-3 z-[90] mx-auto flex max-w-md items-center gap-3 rounded-xl bg-[#1c1e21] px-4 py-3 text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)] dark:bg-[#3a3b3c] bottom-[calc(var(--dock-space,0px)+var(--posting-space,0px)+0.5rem+env(safe-area-inset-bottom,0px))] md:left-6 md:right-auto md:bottom-6 md:mx-0 md:w-80"
    >
      <WifiOff className="h-5 w-5 shrink-0 text-white/80" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[15px] font-medium leading-snug">No internet connection</p>
        <p className="text-[13px] leading-snug text-white/70">You can still look around. Things you send will need a connection.</p>
      </div>
    </div>
  );
};

export default ConnectionBar;
