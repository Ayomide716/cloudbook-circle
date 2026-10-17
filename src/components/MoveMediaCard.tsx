import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

// The tables most people see, and their media columns, checked for files still in Supabase Storage.
const CHECKED: { table: "posts" | "profiles" | "reels" | "stories"; columns: string[] }[] = [
  { table: "posts", columns: ["image_url", "video_url"] },
  { table: "profiles", columns: ["avatar_url", "cover_url"] },
  { table: "reels", columns: ["video_url", "thumbnail_url"] },
  { table: "stories", columns: ["media_url"] },
];

/** How many posts, profiles, reels and stories still show a file from Supabase Storage (null if unknown). */
async function countOnSupabase(): Promise<number | null> {
  const counts = await Promise.all(
    CHECKED.map(async ({ table, columns }) => {
      const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .or(columns.map((c) => `${c}.like.*/storage/v1/object/public/*`).join(","));
      return error ? null : count ?? 0;
    }),
  );
  return counts.some((c) => c === null) ? null : counts.reduce<number>((a, c) => a + (c ?? 0), 0);
}

/**
 * Admin: move photos and videos uploaded before Cloudflare R2 from Supabase Storage to R2, so
 * they load free and phones keep them for a year. Runs in batches; keep the page open.
 */
const MoveMediaCard = () => {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    void countOnSupabase().then(setLeft).catch(() => setLeft(null));
  }, []);

  const run = async () => {
    setRunning(true);
    let total = 0;
    const skip: string[] = [];
    try {
      for (;;) {
        setStatus(`Moving… ${total} moved so far`);
        const { data, error } = await supabase.functions.invoke<{ moved: number; failed: { url: string; reason: string }[]; remaining: number }>("media-upload", { body: { migrate: true, skip } });
        if (error || !data) throw new Error("The media-upload function failed. Make sure the latest version is deployed.");
        total += data.moved;
        skip.push(...data.failed.map((f) => f.url));
        if (data.remaining - data.failed.length <= 0 || (data.moved === 0 && data.failed.length === 0)) {
          setStatus(`Done: ${total} moved.${skip.length ? ` ${skip.length} couldn't be moved and still load from Supabase.` : ""}`);
          break;
        }
      }
    } catch (e) {
      setStatus(`${(e as Error).message} (${total} moved; tap again to carry on)`);
    }
    setRunning(false);
    void countOnSupabase().then(setLeft).catch(() => setLeft(null));
  };

  return (
    <Card className="p-4">
      <p className="font-semibold">Move old media to Cloudflare</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Photos and videos from before the switch still load from Supabase. This copies them to Cloudflare and updates the links. Safe to run again.
      </p>
      {!!left && (
        <div role="alert" className="mt-3 flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {left} {left === 1 ? "post, profile, reel or story still loads" : "posts, profiles, reels and stories still load"} from Supabase Storage. Every view counts against Supabase's free 5 GB a month, and going over it blocks the whole app. Move them now.
          </span>
        </div>
      )}
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={run} disabled={running} className="rounded-full">
          {running && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {running ? "Moving…" : "Move old media"}
        </Button>
        {status && <p className="text-sm text-muted-foreground" role="status">{status}</p>}
      </div>
    </Card>
  );
};

export default MoveMediaCard;
