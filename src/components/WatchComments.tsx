import { useState, useEffect } from "react";
import { useSingleFlight } from "@/hooks/use-single-flight";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useEffectEvent } from "@/hooks/use-effect-event";

interface WatchComment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface WatchCommentsProps {
  videoId: string;
  currentUserId: string;
}

const WatchComments = ({ videoId, currentUserId }: WatchCommentsProps) => {
  const [comments, setComments] = useState<WatchComment[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  const loadCount = useEffectEvent(async () => {
    const { count } = await supabase
      .from("watch_comments")
      .select("id", { count: "exact", head: true })
      .eq("video_id", videoId);
    setCommentCount(count || 0);
  });

  useEffect(() => {
    loadCount();
  }, [videoId, loadCount]);

  const loadComments = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("watch_comments")
      .select(`*, profiles:user_id (id, full_name, avatar_url)`)
      .eq("video_id", videoId)
      .order("created_at", { ascending: false })
      .limit(50);
    setComments(data || []);
    setIsLoading(false);
  };

  const handleToggle = () => {
    const willOpen = !isOpen;
    setIsOpen(willOpen);
    if (willOpen && comments.length === 0) loadComments();
  };

  // Extra taps while this is saving do nothing (no double posts on a slow network).
  const onceHandleSubmit = useSingleFlight();
  const handleSubmit = onceHandleSubmit(async () => {
    if (!newComment.trim()) return;
    setIsSending(true);
    const { error } = await supabase.from("watch_comments").insert({
      video_id: videoId,
      user_id: currentUserId,
      content: newComment.trim(),
    });
    if (!error) {
      setNewComment("");
      setCommentCount(prev => prev + 1);
      loadComments();
    }
    setIsSending(false);
  });

  const handleDelete = async (commentId: string) => {
    await supabase.from("watch_comments").delete().eq("id", commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
    setCommentCount(prev => Math.max(0, prev - 1));
  };

  return (
    <div className="border-t border-border/50">
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-muted-foreground hover:bg-secondary/50 transition-colors"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        <span>{commentCount} comment{commentCount !== 1 ? "s" : ""}</span>
        {isOpen ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 space-y-2">
          {/* Input */}
          <div className="flex gap-2">
            <Input
              placeholder="Write a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="h-8 text-xs"
            />
            <Button size="icon" className="h-8 w-8 flex-shrink-0" onClick={handleSubmit} disabled={!newComment.trim() || isSending}>
              {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">No comments yet. Be the first!</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {comments.map(c => (
                <div key={c.id} className="flex gap-2 group">
                  <Avatar className="h-6 w-6 flex-shrink-0">
                    <AvatarImage src={c.profiles?.avatar_url || undefined} />
                    <AvatarFallback className="text-[9px]">{c.profiles?.full_name?.[0] || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="bg-secondary rounded-xl px-2.5 py-1.5 inline-block max-w-full">
                      <p className="text-[11px] font-semibold">{c.profiles?.full_name || "User"}</p>
                      <p className="text-xs break-words">{c.content}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </span>
                      {c.user_id === currentUserId && (
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="text-[10px] text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WatchComments;
