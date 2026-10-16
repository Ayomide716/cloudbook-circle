import { useState, useEffect, useMemo, useRef } from "react";
import { cancelDelete, deleteLater, deleteNow, hideEverywhere, showAgain, useHiddenEverywhere } from "@/lib/pending-deletes";
import { useSingleFlight } from "@/hooks/use-single-flight";
import { haptic } from "@/lib/haptics";
import { playSound } from "@/lib/sounds";
import { features } from "@/lib/features";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMyProfile } from "@/hooks/use-my-profile";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Trash2, MoreHorizontal, Bookmark, BookmarkCheck, Pencil, X, Globe, Clock, Flag, Undo2, Ban } from "lucide-react";
import { ChatCircle, ShareFat, ThumbsUp as PhThumbsUp } from "@phosphor-icons/react";
import { ActionMenu, ActionMenuContent, ActionMenuItem, ActionMenuSeparator, ActionMenuTrigger } from "@/components/ui/action-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { formatDistanceToNow } from "date-fns";
import { compactCount, shortTime } from "@/lib/time";
import { hidePost, snoozePerson, unhidePost, SNOOZE_DAYS } from "@/lib/hidden-posts";
import { Link } from "react-router-dom";
import { cn, toDate } from "@/lib/utils";
import SharePostDialog from "./SharePostDialog";
import LinkPreview from "./LinkPreview";
import HeartBurst from "./HeartBurst";
import ReactionEmoji from "./reactions/ReactionEmoji";
import { motion } from "framer-motion";
import FeedVideo from "./FeedVideo";
import { CommentThread } from "./comments/CommentThread";
import { firstLink } from "@/lib/links";
import { backgroundCss } from "@/lib/post-backgrounds";
import { sendOnEnter, useAutoGrow } from "@/lib/enter-key";
import PollDisplay from "./PollDisplay";
import PostContent from "./PostContent";
import VerifiedBadge from "./VerifiedBadge";
import ReportDialog from "./ReportDialog";
import BlockDialog from "./BlockDialog";
import { explainError } from "@/lib/blocking";
import PhotoCollage from "./PhotoCollage";
import { usePostTags } from "@/lib/post-tags";
import { useCommentLikes } from "@/lib/comment-likes";
import PhotoViewer from "./PhotoViewer";
import { postImages } from "@/lib/post-images";
import TipButton from "./TipButton";
import { isPostSaved } from "@/lib/saved-posts";
import type { TablesInsert } from "@/integrations/supabase/types";

export interface PostComment {
  id: string;
  content: string;
  created_at: string | null;
  parent_id?: string | null;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface PostCardProps {
  post: {
    id: string;
    content: string;
    image_url: string | null;
    image_urls?: string[] | null;
    /** Blurred previews of the photos (see lib/photo-previews). */
    image_previews?: string[] | null;
    video_url?: string | null;
    created_at: string | null;
    profiles: {
      id: string;
      full_name: string | null;
      avatar_url: string | null;
      is_verified?: boolean;
    };
    user_id: string;
    /** Where it was posted, shown as "Lekki, Lagos · 2h". */
    location?: string | null;
    /** A coloured background for a short text post (see lib/post-backgrounds). */
    background?: string | null;
     poll?: {
       id: string;
       question: string;
       options: string[];
     } | null;
  };
  currentUserId: string;
  reactions: Record<string, number>;
  userReaction: string | null;
  /** Someone else who reacted, for "Ada Obi and 12 others". */
  firstReactorName?: string | null;
  comments: PostComment[];
  onReactionToggle: (reactionType: string) => void;
  onCommentAdded: () => void;
  onDelete?: () => void;
  /** Narrow card (e.g. half-width in the feed grid). The action row is icons and counts either way. */
  compact?: boolean;
  /** Open the comments straight away (the single post page). */
  defaultShowComments?: boolean;
  /** Comments always under the post, even on phones (the single post page). */
  inlineComments?: boolean;
}

// Facebook's six reactions, each a 3D emoji (see ReactionEmoji) with its label colour.
const REACTION_TYPES = [
  { type: 'like', label: 'Like', color: 'text-primary' },
  { type: 'love', label: 'Love', color: 'text-rose-500' },
  { type: 'haha', label: 'Haha', color: 'text-amber-500' },
  { type: 'wow', label: 'Wow', color: 'text-amber-500' },
  { type: 'sad', label: 'Sad', color: 'text-amber-500' },
  { type: 'angry', label: 'Angry', color: 'text-orange-600' },
];

const PostCard = ({
  post,
  currentUserId,
  reactions,
  userReaction,
  firstReactorName,
  comments,
  onReactionToggle,
  onCommentAdded,
  onDelete,
  defaultShowComments = false,
  inlineComments = false,
}: PostCardProps) => {
  const [showComments, setShowComments] = useState(defaultShowComments);
  // Friends tagged in the post ("is with Tolu and 2 others").
  const tags = usePostTags(post.id);
  // Likes on the comments, loaded once the comments are open.
  const commentLikes = useCommentLikes(
    showComments ? comments.filter((c) => !c.id.startsWith("temp-")).map((c) => c.id) : [],
    currentUserId,
    post.user_id,
  );
  const myProfile = useMyProfile();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [heartBurst, setHeartBurst] = useState(0);
  // Hidden with ✕: the card turns into Facebook's "Why aren't you interested?" panel.
  const [hidden, setHidden] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [hideReason, setHideReason] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const photos = postImages(post);
  const [commentContent, setCommentContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const postBackground = !post.image_url && !post.video_url && !post.poll ? backgroundCss(post.background) : null;
  const postLink = useMemo(() => firstLink(post.content ?? ""), [post.content]);
  const [showReactions, setShowReactions] = useState(false);
  const likeAreaRef = useRef<HTMLDivElement>(null);
  const pressTimerRef = useRef<number>();
  const longPressedRef = useRef(false);
  const isTouchRef = useRef(false);

  // A picker opened by a long press closes when you tap anywhere else.
  useEffect(() => {
    if (!showReactions || !isTouchRef.current) return;
    const close = (e: PointerEvent) => {
      if (!likeAreaRef.current?.contains(e.target as Node)) setShowReactions(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [showReactions]);
  useEffect(() => () => window.clearTimeout(pressTimerRef.current), []);
  const [replyingTo, setReplyingTo] = useState<PostComment | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [editLoading, setEditLoading] = useState(false);
  // The thread you just replied in stays open.
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const { toast } = useToast();

  const handleEditComment = async (commentId: string, text: string) => {
    if (!text.trim()) return;
    const { error } = await supabase
      .from("comments")
      .update({ content: text.trim() })
      .eq("id", commentId);
    if (error) {
      toast({ title: "Couldn't update the comment", variant: "destructive" });
    } else {
      onCommentAdded();
    }
  };
 
   // Check if post is saved
   useEffect(() => {
     let cancelled = false;
     isPostSaved(post.id, currentUserId).then((saved) => {
       if (!cancelled) setIsSaved(saved);
     });
     return () => {
       cancelled = true;
     };
   }, [post.id, currentUserId]);
 
   const handleSavePost = async () => {
     if (isSaved) {
       await supabase
         .from("saved_posts")
         .delete()
         .eq("post_id", post.id)
         .eq("user_id", currentUserId);
       setIsSaved(false);
     } else {
       await supabase
         .from("saved_posts")
         .insert({ post_id: post.id, user_id: currentUserId });
       setIsSaved(true);
     }
   };

  /** Double tap on a photo or video: likes (never un-likes), with the heart popping over it. */
  const likeWithHeart = () => {
    if (!userReaction) handleReaction("like");
    else haptic(12);
    setHeartBurst((n) => n + 1);
  };

  // One reaction change at a time: a fast double tap (or a tap during a long press) would
  // otherwise race two writes for the same post.
  const reactionBusy = useRef(false);
  const commentBoxRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(commentBoxRef, commentContent, 120);

  const handleReaction = async (reactionType: string) => {
    setShowReactions(false);
    if (reactionBusy.current) return;
    reactionBusy.current = true;
    const previous = userReaction;
    const removing = previous === reactionType;
    // A pop when you like or react (not when you take it back), as on Facebook.
    if (!removing) { playSound("like"); haptic(); }
    onReactionToggle(reactionType);

    try {
      // Adding or changing is one "insert or update", so it can't trip over a reaction that
      // is already saved (from another tab, or before this page had loaded it).
      const { error } = removing
        ? await supabase.from("reactions").delete().eq("post_id", post.id).eq("user_id", currentUserId)
        : await supabase
            .from("reactions")
            .upsert({ post_id: post.id, user_id: currentUserId, reaction_type: reactionType }, { onConflict: "post_id,user_id" });

      if (error) {
        toast({ title: "Couldn't save your reaction", description: await explainError(error, post.user_id), variant: "destructive" });
        // Put the button back how it was.
        onReactionToggle(previous ?? reactionType);
      }
    } finally {
      reactionBusy.current = false;
    }
  };

  const handleDeletePost = async () => {
    const { error } = await supabase
      .from("posts")
      .delete()
      .eq("id", post.id);

    if (error) {
      showAgain(post.id);
      setRemoved(false);
      toast({ title: "Couldn't delete the post", variant: "destructive" });
    } else {
      onDelete?.();
    }
  };

  // Deleting hides the post at once (on every screen) with "Post deleted · Undo"; it's really
  // deleted 5 seconds later, or straight away if the card goes away or the app is closed first.
  const [removed, setRemoved] = useState(false);
  const hiddenEverywhere = useHiddenEverywhere(post.id);
  const deleteWithUndo = async () => {
    setRemoved(true);
    hideEverywhere(post.id);
    const { data: { session } } = await supabase.auth.getSession();
    deleteLater(post.id, 5000, {
      run: () => void handleDeletePost(),
      url: `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(post.id)}`,
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session?.access_token ?? ""}` },
    });
    toast({
      title: "Post deleted",
      duration: 5000,
      action: (
        <ToastAction
          altText="Undo delete"
          onClick={() => {
            cancelDelete(post.id);
            showAgain(post.id);
            setRemoved(false);
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  };
  useEffect(() => () => deleteNow(post.id), [post.id]);

  const handleDeleteComment = async (commentId: string) => {
    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId);

    if (error) {
      toast({ title: "Error deleting comment", variant: "destructive" });
    } else {
      onCommentAdded();
    }
  };

  // Extra taps while this is saving do nothing (no double posts on a slow network).
  const onceHandleComment = useSingleFlight();
  const handleComment = onceHandleComment(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!commentContent.trim()) return;

    const optimisticComment = {
      id: `temp-${Date.now()}`,
      content: commentContent.trim(),
      created_at: new Date().toISOString(),
      parent_id: replyingTo?.id || null,
      post_id: post.id,
      user_id: currentUserId,
      profiles: {
        id: currentUserId,
        full_name: "You",
        avatar_url: null,
      },
    };

    // Optimistic: show comment instantly
    setCommentContent("");
    if (replyingTo) setOpenThreadId(replyingTo.id);
    setReplyingTo(null);
    setShowComments(true);

    setIsSubmitting(true);

    const insertData: TablesInsert<"comments"> = {
      post_id: post.id,
      user_id: currentUserId,
      content: optimisticComment.content,
    };
    if (optimisticComment.parent_id) {
      insertData.parent_id = optimisticComment.parent_id;
    }

    const { error } = await supabase
      .from("comments")
      .insert(insertData);

    setIsSubmitting(false);

    if (error) {
      toast({
        title: "Couldn't post comment",
        description: await explainError(error, post.user_id),
        variant: "destructive",
      });
    } else {
      playSound("comment");
    }

    // Refresh real data from server
    onCommentAdded();
  });

  // Replying to a reply stays in the same thread, starting with "@Name" (as on Instagram).
  const startReply = (parent: PostComment, mention: string | null) => {
    setReplyingTo(parent);
    setCommentContent(mention ? `@${mention.replace(/\s+/g, "")} ` : "");
    setShowComments(true);
    requestAnimationFrame(() => commentBoxRef.current?.focus());
  };

  // Comment opens the comments under the post and puts you in the box, ready to type;
  // tapping it again closes them.
  const toggleComments = () => {
    if (showComments) { setShowComments(false); return; }
    setShowComments(true);
    requestAnimationFrame(() => commentBoxRef.current?.focus({ preventScroll: false }));
  };

  const commentForm = (
    <form onSubmit={handleComment} className="flex flex-col gap-1.5">
      {replyingTo && (
        <div className="ml-10 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Replying to <strong>{replyingTo.profiles.full_name || "Anonymous"}</strong></span>
          <button type="button" onClick={() => { setReplyingTo(null); setCommentContent(""); }} className="text-primary hover:underline">
            Cancel
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <Avatar className="mb-0.5 h-8 w-8 flex-shrink-0">
          <AvatarImage src={myProfile?.avatar_url || undefined} alt="" />
          <AvatarFallback className="bg-secondary text-xs">{myProfile?.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
        </Avatar>
        <Textarea
          placeholder={replyingTo ? `Reply to ${replyingTo.profiles.full_name || "Anonymous"}...` : "Write a comment..."}
          value={commentContent}
          ref={commentBoxRef}
          onChange={(e) => setCommentContent(e.target.value)}
          // Phones: Enter adds a line. Keyboards: Enter sends, Shift+Enter adds a line.
          onKeyDown={sendOnEnter}
          aria-label={replyingTo ? "Write a reply" : "Write a comment"}
          className="min-h-[36px] flex-1 resize-none rounded-[18px] border-0 bg-secondary py-2 leading-5"
          disabled={isSubmitting}
          rows={1}
        />
        <Button type="submit" size="sm" disabled={isSubmitting || !commentContent.trim()} className="h-9 rounded-full px-4">
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
        </Button>
      </div>
    </form>
  );

  const commentList = (initialCount: number) => (
    <CommentThread
      latest
      comments={comments}
      currentUserId={currentUserId}
      onReply={startReply}
      onDelete={handleDeleteComment}
      onEdit={(id, text) => handleEditComment(id, text)}
      initialCount={initialCount}
      openThreadId={openThreadId}
      likes={commentLikes}
    />
  );

  const latestComment = [...comments].reverse().find((c) => !c.parent_id && !c.id.startsWith("temp-")) ?? null;
  const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0);
  // "You and 12 others", "Ada Obi and 3 others", or just the count, as Facebook shows it.
  const reactionSummary = (() => {
    const others = totalReactions - 1;
    const tail = others > 0 ? ` and ${compactCount(others)} ${others === 1 ? "other" : "others"}` : "";
    if (userReaction) return `You${tail}`;
    if (firstReactorName) return `${firstReactorName}${tail}`;
    return compactCount(totalReactions);
  })();
  const currentReaction = REACTION_TYPES.find(r => r.type === userReaction);

  // Get top 3 reaction types for display
  const topReactions = Object.entries(reactions)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const authorFirstName = post.profiles.full_name?.split(" ")[0] || "them";

  if (blocked || removed || hiddenEverywhere) return null;

  if (hidden) {
    const reasons = ["This post", `Too much from ${authorFirstName}`, "Seen it before", "Not relevant to me"];
    return (
      <Card className="feed-section shadow-sm overflow-hidden rounded-2xl border-border/60">
        <section aria-label="Post hidden" className="p-3 sm:p-4">
          <div className="rounded-2xl bg-secondary/70 p-3">
            <p className="font-semibold text-[15px] mb-2.5">
              {hideReason ? "Thanks. You'll see fewer posts like this." : "Why aren't you interested?"}
            </p>
            <div className="flex flex-wrap gap-2">
              {reasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={hideReason === r}
                  onClick={() => setHideReason(r)}
                  className={cn(
                    "h-9 rounded-full px-3.5 text-sm font-medium transition-colors",
                    hideReason === r ? "bg-primary text-primary-foreground" : "bg-muted-foreground/15 hover:bg-muted-foreground/25"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 divide-y divide-border/0">
            <button
              type="button"
              onClick={() => {
                snoozePerson(post.user_id);
                toast({ title: `Snoozed ${post.profiles.full_name || "this person"}`, description: `You won't see their posts for ${SNOOZE_DAYS} days.` });
              }}
              className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left text-[15px] hover:bg-accent/60"
            >
              <Clock className="h-5 w-5" /> Snooze {post.profiles.full_name || "this person"} for {SNOOZE_DAYS} days
            </button>
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left text-[15px] hover:bg-accent/60"
            >
              <Flag className="h-5 w-5" /> Report post
            </button>
            <button
              type="button"
              onClick={() => { unhidePost(post.id); setHidden(false); }}
              className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left text-[15px] hover:bg-accent/60"
            >
              <Undo2 className="h-5 w-5" /> Unhide post
            </button>
          </div>
        </section>
        <ReportDialog reportedType="post" reportedId={post.id} currentUserId={currentUserId} open={reportOpen} onOpenChange={setReportOpen} />
      </Card>
    );
  }

  return (
    <Card className="feed-section shadow-sm overflow-hidden rounded-2xl border-border/60">
      {/* Header */}
      <div className="p-3 pb-2 sm:p-4">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <Link to={`/profile/${post.profiles.id}`}>
            <Avatar className="h-9 w-9 sm:h-10 sm:w-10">
              <AvatarImage src={post.profiles.avatar_url || undefined} />
              <AvatarFallback className="bg-secondary">
                {post.profiles.full_name?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
          </Link>
          
          <div className="flex-1 min-w-0">
            <Link to={`/profile/${post.profiles.id}`} className="flex max-w-full">
              {/* A long name shortens with "…" instead of pushing the menu button off the card. */}
              <p className="flex min-w-0 items-center gap-1 text-[14px] font-semibold leading-tight hover:underline sm:text-base">
                <span className="truncate">{post.profiles.full_name || "Anonymous"}</span>
                {post.profiles.is_verified && <span className="shrink-0"><VerifiedBadge size="sm" /></span>}
              </p>
            </Link>
            {tags.length > 0 && (
              <p className="text-[13px] leading-snug text-muted-foreground">
                is with{" "}
                <Link to={`/profile/${tags[0].id}`} className="font-semibold text-foreground hover:underline">{tags[0].full_name || "a friend"}</Link>
                {tags.length === 2 && <> and <Link to={`/profile/${tags[1].id}`} className="font-semibold text-foreground hover:underline">{tags[1].full_name || "a friend"}</Link></>}
                {tags.length > 2 && <> and <span className="font-semibold text-foreground" title={tags.slice(1).map((t) => t.full_name).join(", ")}>{tags.length - 1} others</span></>}
              </p>
            )}
            {/* As in Facebook: "Lekki, Lagos · 2h · 🌐" (Ember posts are public). */}
            <p className="flex items-center gap-1 text-[11.5px] sm:text-[13px] text-muted-foreground min-w-0">
              {post.location && <><span className="truncate">{post.location}</span><span aria-hidden="true">·</span></>}
              <time dateTime={toDate(post.created_at).toISOString()} title={formatDistanceToNow(toDate(post.created_at), { addSuffix: true })} className="shrink-0">
                {shortTime(post.created_at)}
              </time>
              <span aria-hidden="true">·</span>
              <Globe className="h-3 w-3 shrink-0" aria-label="Public" />
            </p>
          </div>

           <ActionMenu>
             <ActionMenuTrigger asChild>
               <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="Post options">
                 <MoreHorizontal className="h-5 w-5" />
               </Button>
             </ActionMenuTrigger>
             <ActionMenuContent align="end" title="Post options">
               <ActionMenuItem onClick={handleSavePost}>
                 {isSaved ? (
                   <>
                     <BookmarkCheck className="h-4 w-4 mr-2 text-primary" />
                     Unsave Post
                   </>
                 ) : (
                   <>
                     <Bookmark className="h-4 w-4 mr-2" />
                     Save Post
                   </>
                 )}
               </ActionMenuItem>
                {currentUserId === post.user_id && (
                  <>
                    <ActionMenuItem onClick={() => { setIsEditing(true); setEditContent(post.content); }}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit Post
                    </ActionMenuItem>
                    <ActionMenuItem onSelect={deleteWithUndo} className="text-destructive focus:text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Post
                    </ActionMenuItem>
                  </>
                 )}
                {currentUserId !== post.user_id && (
                  <>
                    <ActionMenuSeparator />
                    <ActionMenuItem onSelect={() => setReportOpen(true)}>
                      <Flag className="h-4 w-4 mr-2" />
                      Report post
                    </ActionMenuItem>
                    {features.blocking && (
                      <ActionMenuItem onSelect={() => setBlockOpen(true)} className="text-destructive focus:text-destructive">
                        <Ban className="h-4 w-4 mr-2" />
                        Block {post.profiles.full_name || "this person"}
                      </ActionMenuItem>
                    )}
                  </>
                )}
              </ActionMenuContent>
            </ActionMenu>
            {currentUserId !== post.user_id && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                aria-label="Hide post"
                onClick={() => { hidePost(post.id); setHidden(true); setHideReason(null); }}
              >
                <X className="h-5 w-5" />
              </Button>
            )}
        </div>

        {/* Content */}
        {isEditing ? (
          <div className="mt-2 space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[80px]"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={editLoading || !editContent.trim()}
                onClick={async () => {
                  setEditLoading(true);
                  const { error } = await supabase
                    .from("posts")
                    .update({ content: editContent.trim() })
                    .eq("id", post.id);
                  setEditLoading(false);
                  if (error) {
                    toast({ title: "Error updating post", variant: "destructive" });
                  } else {
                    setIsEditing(false);
                    onDelete?.(); // triggers refetch
                  }
                }}
              >
                {editLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          postBackground ? (
            // Short text on a colour, big and centred, as on Facebook.
            <div
              className="mt-2.5 flex min-h-[230px] items-center justify-center rounded-2xl px-6 py-8 text-center"
              style={{ backgroundImage: postBackground }}
            >
              <p className="whitespace-pre-wrap break-words text-2xl font-bold leading-snug text-white drop-shadow-sm">{post.content}</p>
            </div>
          ) : (
            <PostContent content={post.content} />
          )
        )}
      </div>

      {/* A card for the first link, when the post has no photo or video of its own */}
      {!isEditing && !post.image_url && !post.video_url && postLink && (
        <LinkPreview url={postLink} className="mx-2.5 mt-1" />
      )}

      {/* Media */}
      {post.video_url && (
        <div className="relative mx-2.5 overflow-hidden rounded-2xl bg-black">
          <FeedVideo src={post.video_url} onDoubleTap={likeWithHeart} />
          {heartBurst > 0 && <HeartBurst key={heartBurst} />}
        </div>
      )}
      {!post.video_url && photos.length > 0 && (
        <>
          <div className="relative mx-2.5 overflow-hidden rounded-2xl">
            <PhotoCollage
              images={photos}
              previews={post.image_previews}
              onOpen={setViewerIndex}
              // Double-tap likes (never un-likes), with a heart that pops over the photo.
              onDoubleTap={likeWithHeart}
            />
            {heartBurst > 0 && <HeartBurst key={heartBurst} />}
          </div>
          <PhotoViewer
            images={photos}
            index={viewerIndex}
            onIndexChange={setViewerIndex}
            caption={
              <>
                <span className="font-semibold text-white">{post.profiles.full_name || "Anonymous"}</span>
                {post.content && <span className="line-clamp-2"> {post.content}</span>}
              </>
            }
          />
        </>
      )}
 
       {/* Poll */}
       {post.poll && (
         <div className="px-3 sm:px-4">
           <PollDisplay
             pollId={post.poll.id}
             question={post.poll.question}
             options={post.poll.options as string[]}
             currentUserId={currentUserId}
           />
         </div>
       )}

      {/* Summary: the reactions people used and how many, then the comment count (as in the mockup). */}
      {(totalReactions > 0 || comments.length > 0) && (
        <div className="flex min-h-[26px] items-center gap-2 px-3 pt-2 text-[12.5px] text-muted-foreground sm:px-4">
          {totalReactions > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="flex -space-x-1" aria-hidden="true">
                {topReactions.map(([type]) => (
                  <span key={type} className="flex h-[19px] w-[19px] items-center justify-center rounded-full bg-card ring-2 ring-card">
                    <ReactionEmoji type={type} className="h-[19px] w-[19px]" />
                  </span>
                ))}
              </span>
              {reactionSummary}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1">
            {comments.length > 0 && (
              <button type="button" className="hover:underline" onClick={() => setShowComments((v) => !v)} aria-expanded={showComments}>
                {compactCount(comments.length)} {comments.length === 1 ? "comment" : "comments"}
              </button>
            )}
            <TipButton postId={post.id} receiverId={post.user_id} currentUserId={currentUserId} compact />
          </span>
        </div>
      )}

      {/* Like · Comment · Share in one outlined pill; Like turns blue and filled once you've liked. */}
      <div className="px-2.5 pt-2 pb-2.5">
        <div className="grid grid-cols-3 items-center rounded-full border border-border">
          <div
            ref={likeAreaRef}
            className="relative flex justify-center select-none [-webkit-touch-callout:none]"
            onMouseEnter={() => { if (!isTouchRef.current) setShowReactions(true); }}
            onMouseLeave={() => { if (!isTouchRef.current) setShowReactions(false); }}
            // Phones: press and hold Like to pick a reaction, as in Facebook's app.
            onPointerDown={(e) => {
              isTouchRef.current = e.pointerType !== "mouse";
              if (!isTouchRef.current) return;
              longPressedRef.current = false;
              window.clearTimeout(pressTimerRef.current);
              pressTimerRef.current = window.setTimeout(() => {
                longPressedRef.current = true;
                setShowReactions(true);
                haptic(15);
              }, 420);
            }}
            onPointerUp={() => window.clearTimeout(pressTimerRef.current)}
            onPointerCancel={() => window.clearTimeout(pressTimerRef.current)}
            onPointerLeave={() => window.clearTimeout(pressTimerRef.current)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* Reaction Picker */}
            {showReactions && (
              <div className="absolute bottom-full left-0 pb-2 z-20">
                {/* The faces pop in one after another and grow under your finger, as on Facebook. */}
                <div className="flex w-max gap-0.5 rounded-full border border-border/70 bg-card p-1.5 shadow-xl animate-in fade-in-0 zoom-in-90 slide-in-from-bottom-2 duration-200">
                  {REACTION_TYPES.map(({ type, label }, i) => (
                    <motion.button
                      key={type}
                      initial={{ opacity: 0, y: 14, scale: 0.4 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: i * 0.035, type: "spring", stiffness: 520, damping: 22 }}
                      whileHover={{ scale: 1.32, y: -6 }}
                      whileTap={{ scale: 1.2 }}
                      onClick={() => { handleReaction(type); setShowReactions(false); }}
                      className="group relative shrink-0 rounded-full p-1"
                      title={label}
                      aria-label={label}
                    >
                      <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded-full bg-foreground/85 px-2 py-0.5 text-[10.5px] font-semibold text-background opacity-0 transition-opacity group-hover:opacity-100">{label}</span>
                      <ReactionEmoji type={type} className="h-9 w-9 max-sm:h-10 max-sm:w-10" />
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
            <Button
              variant="ghost"
              className={cn("h-9 w-full gap-1.5 rounded-full text-[13px] font-semibold text-muted-foreground hover:bg-accent [&_svg]:size-[18px]", currentReaction?.color)}
              // Tapping removes your reaction, whichever it is; with none it's a like.
              onClick={() => {
                // Letting go after a long press keeps the picker open instead of liking.
                if (longPressedRef.current) { longPressedRef.current = false; return; }
                handleReaction(userReaction ?? 'like');
              }}
              aria-pressed={!!userReaction}
              aria-label={`${currentReaction?.label ?? "Like"}${totalReactions ? `, ${totalReactions} ${totalReactions === 1 ? "reaction" : "reactions"}` : ""}`}
            >
              {currentReaction ? (
                <motion.span key={currentReaction.type} initial={{ scale: 0.3, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 600, damping: 14 }} className="flex">
                  <ReactionEmoji type={currentReaction.type} className="h-[21px] w-[21px]" />
                </motion.span>
              ) : (
                <PhThumbsUp className="h-[21px] w-[21px]" weight={currentReaction ? "fill" : "regular"} aria-hidden="true" />
              )}
              {currentReaction?.label ?? "Like"}
            </Button>
          </div>

          <Button
            variant="ghost"
            className="h-9 w-full gap-1.5 rounded-full text-[13px] font-semibold text-muted-foreground hover:bg-accent [&_svg]:size-[18px]"
            onClick={toggleComments}
            aria-expanded={showComments}
            aria-label={`Comment${comments.length ? `, ${comments.length} ${comments.length === 1 ? "comment" : "comments"}` : ""}`}
          >
            <ChatCircle className="h-[21px] w-[21px]" weight="regular" aria-hidden="true" />
            Comment
          </Button>

          <Button
            variant="ghost"
            className="h-9 w-full gap-1.5 rounded-full text-[13px] font-semibold text-muted-foreground hover:bg-accent [&_svg]:size-[18px]"
            onClick={() => setShowShareDialog(true)}
            aria-label="Share"
          >
            <ShareFat className="h-[21px] w-[21px]" weight="regular" aria-hidden="true" />
            Share
          </Button>
        </div>
      </div>

      {/* A taste of the conversation, as on Instagram: the latest comment and a link to the rest. */}
      {latestComment && !showComments && (
        <button
          type="button"
          onClick={() => setShowComments(true)}
          className="block w-full px-3 pb-3 -mt-0.5 text-left text-[13.5px] leading-snug sm:px-4"
        >
          <span className="line-clamp-2">
            <span className="font-semibold">{latestComment.profiles.full_name || "Someone"}</span>{" "}
            <span className="text-foreground/85">{latestComment.content}</span>
          </span>
          {comments.length > 1 && (
            <span className="mt-0.5 block text-muted-foreground">View all {compactCount(comments.length)} comments</span>
          )}
        </button>
      )}

       {/* Share Dialog */}
       <SharePostDialog
         postId={post.id}
         open={showShareDialog}
         onOpenChange={setShowShareDialog}
         currentUserId={currentUserId}
       />

      {/* Comments open right under the post, as on Facebook: the conversation first, then your
          box at the bottom. "View more comments" brings in more without leaving the feed. */}
      {showComments && (
        <div className="space-y-3 border-t border-border/60 px-3 pb-3 pt-2.5 sm:px-4">
          {comments.length === 0 ? (
            <p className="py-1 text-center text-sm text-muted-foreground">No comments yet. Be the first to comment.</p>
          ) : (
            commentList(inlineComments ? 50 : 3)
          )}
          {commentForm}
        </div>
      )}
      {currentUserId !== post.user_id && (
        <ReportDialog reportedType="post" reportedId={post.id} currentUserId={currentUserId} open={reportOpen} onOpenChange={setReportOpen} />
      )}
      {features.blocking && currentUserId !== post.user_id && (
        <BlockDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          userId={post.user_id}
          name={post.profiles.full_name}
          onBlocked={() => setBlocked(true)}
        />
      )}
    </Card>
  );
};

export default PostCard;