import { useState } from "react";
import { Loader2, RefreshCw } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * When a list couldn't load: say so (instead of an empty list that looks like "nothing here"),
 * with a Try again that shows it's working.
 */
const LoadErrorCard = ({ what, onRetry, className }: { what: string; onRetry: () => Promise<unknown> | void; className?: string }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div role="alert" className={cn("feed-section flex flex-col items-center gap-3 border border-border/60 bg-card px-6 py-10 text-center sm:rounded-2xl", className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        <RefreshCw className="h-5 w-5 text-muted-foreground" />
      </span>
      <div>
        <p className="text-[15px] font-semibold">Couldn't load {what}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">Check your connection, then try again.</p>
      </div>
      <Button
        variant="secondary"
        className="rounded-full px-5"
        disabled={busy}
        onClick={async () => { setBusy(true); try { await onRetry(); } finally { setBusy(false); } }}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Try again
      </Button>
    </div>
  );
};

export default LoadErrorCard;
