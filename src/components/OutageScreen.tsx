import { useEffect, useState } from "react";
import { Flame, Loader2 } from "@/components/icons";
import Wordmark from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { useOutage, watchedFetch } from "@/lib/outage";
import { features } from "@/lib/features";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Asks the server if it's back (any answer but 402 / 5xx counts). */
const probe = () => watchedFetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: KEY } }).then((r) => r.ok).catch(() => false);

/**
 * "We'll be right back": covers the app while Ember's server isn't answering (lib/outage), and
 * checks again every 30 seconds. Nothing is lost; it reloads once the server answers.
 */
const OutageScreen = () => {
  const outage = useOutage();
  // A 402 is certain; a run of errors is only a guess, so that one has its own switch.
  const shown = features.outageScreen && (outage === "paused" || (outage === "down" && features.outageScreenOnErrors));
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    const ok = await probe();
    setChecking(false);
    if (ok) window.location.reload();
  };

  useEffect(() => {
    if (!shown) return;
    const timer = window.setInterval(() => void check(), 30_000);
    return () => window.clearInterval(timer);
  }, [shown]);

  if (!shown) return null;

  return (
    <div role="alertdialog" aria-labelledby="outage-title" className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background px-8 text-center">
      <Wordmark className="mb-10 text-[34px]" />
      <span className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-secondary">
        <Flame className="h-8 w-8 text-foreground" />
      </span>
      <h1 id="outage-title" className="text-[22px] font-bold">We'll be right back</h1>
      <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
        {outage === "paused"
          ? "Ember is taking a short break. Your posts, photos and messages are safe, and we'll be back soon."
          : "Ember can't reach its servers right now. Your posts, photos and messages are safe."}
      </p>
      <Button onClick={() => void check()} disabled={checking} className="mt-6 h-11 rounded-xl px-6">
        {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Try again"}
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">We'll keep checking every 30 seconds.</p>
    </div>
  );
};

export default OutageScreen;
