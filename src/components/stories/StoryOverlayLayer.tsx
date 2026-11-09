import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink } from "@/components/icons";
import { haptic } from "@/lib/haptics";
import type { StoryOverlay } from "@/lib/story-overlay";
import { cn } from "@/lib/utils";

interface StoryOverlayLayerProps {
  storyId: string;
  overlay: StoryOverlay | null;
  isOwn: boolean;
  /** Holds the story still while you vote. */
  onPause: (paused: boolean) => void;
  onOpen: (path: string) => void;
}

/**
 * What can be tapped on a story, laid exactly over the picture: a poll to vote on (then the
 * results), the people mentioned (open their profile), and the post it shares.
 */
const StoryOverlayLayer = ({ storyId, overlay, isOwn, onPause, onOpen }: StoryOverlayLayerProps) => {
  if (!overlay) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 [container-type:size]">
      {overlay.poll && (
        <div className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${overlay.poll.x * 100}%`, top: `${overlay.poll.y * 100}%` }}>
          <StoryPollCard storyId={storyId} question={overlay.poll.question} options={overlay.poll.options} isOwn={isOwn} onPause={onPause} />
        </div>
      )}
      {overlay.mentions?.map((m) => (
        // An invisible button over the mention sticker drawn on the picture.
        <button
          key={m.id}
          type="button"
          onClick={() => onOpen(`/profile/${m.id}`)}
          aria-label={`Open ${m.name}'s profile`}
          className="pointer-events-auto absolute h-10 w-32 -translate-x-1/2 -translate-y-1/2 rounded-xl"
          style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
        />
      ))}
      {overlay.post_id && (
        <button
          type="button"
          onClick={() => onOpen(`/post/${overlay.post_id}`)}
          className="pointer-events-auto absolute bottom-24 left-1/2 flex h-10 -translate-x-1/2 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-neutral-900 shadow-lg"
        >
          <ExternalLink className="h-4 w-4" /> View post
        </button>
      )}
    </div>
  );
};

const StoryPollCard = ({ storyId, question, options, isOwn, onPause }: {
  storyId: string; question: string; options: string[]; isOwn: boolean; onPause: (p: boolean) => void;
}) => {
  const [mine, setMine] = useState<number | null>(null);
  const [results, setResults] = useState<number[] | null>(null);

  const loadResults = async () => {
    const { data } = await supabase.rpc("story_poll_results", { _story: storyId });
    const counts = options.map((_, i) => Number((data ?? []).find((r) => r.option === i)?.votes ?? 0));
    setResults(counts);
  };

  useEffect(() => {
    let cancelled = false;
    setMine(null);
    setResults(null);
    (async () => {
      if (isOwn) { await loadResults(); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("story_poll_votes").select("option").eq("story_id", storyId).eq("user_id", user.id).maybeSingle();
      if (cancelled || !data) return;
      setMine(data.option);
      await loadResults();
    })();
    return () => { cancelled = true; };
  }, [storyId, isOwn]); // eslint-disable-line react-hooks/exhaustive-deps

  const vote = async (i: number) => {
    if (mine !== null || isOwn) return;
    haptic(12);
    setMine(i);
    onPause(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from("story_poll_votes").insert({ story_id: storyId, user_id: user.id, option: i });
    await loadResults();
    window.setTimeout(() => onPause(false), 1200);
  };

  const total = results?.reduce((a, b) => a + b, 0) ?? 0;
  return (
    <div className="w-[64cqw] max-w-[300px] rounded-2xl bg-white p-3 text-center text-neutral-900 shadow-xl" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <p className="mb-2 text-[16px] font-bold leading-snug">{question}</p>
      <div className="space-y-1.5">
        {options.map((o, i) => {
          const pct = results && total ? Math.round((results[i] / total) * 100) : 0;
          return (
            <button
              key={i}
              type="button"
              onClick={() => vote(i)}
              disabled={mine !== null || isOwn}
              className={cn("relative flex h-10 w-full items-center justify-between overflow-hidden rounded-xl bg-neutral-100 px-3 text-[15px] font-semibold", mine === i && "ring-2 ring-[#e8552b]")}
            >
              {results && <span className="absolute inset-y-0 left-0 bg-[#e8552b]/20 transition-[width] duration-500" style={{ width: `${pct}%` }} aria-hidden="true" />}
              <span className="relative">{o}</span>
              {results && <span className="relative tabular-nums text-neutral-600">{pct}%</span>}
            </button>
          );
        })}
      </div>
      {results && <p className="mt-2 text-xs text-neutral-500">{total} {total === 1 ? "vote" : "votes"}</p>}
    </div>
  );
};

export default StoryOverlayLayer;
