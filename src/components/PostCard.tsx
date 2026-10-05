import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMyProfile } from "@/hooks/use-my-profile";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Heart, MessageCircle, Loader2, Laugh, Frown, Angry, Sparkles, Trash2, MoreHorizontal, Share2, ThumbsUp, Bookmark, BookmarkCheck, Pencil, X, Globe, Clock, Flag, Undo2, Ban } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { compactCount, shortTime } from "@/lib/time";
import { hidePost, snoozePerson, unhidePost, SNOOZE_DAYS } from "@/lib/hidden-posts";
import { Link } from "react-router-dom";
import { cn, toDate } from "@/lib/utils";
import SharePostDialog from "./SharePostDialog";
import PollDisplay from "./PollDisplay";
import PostContent from "./PostContent";
import VerifiedBadge from "./VerifiedBadge";
import ReportDialog from "./ReportDialog";
import ConfirmDialog from "./ConfirmDialog";
import BlockDialog from "./BlockDialog";
import { explainError } from "@/lib/blocking";
import PhotoCollage from "./PhotoCollage";
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
     poll?: {
       id: string;
       question: string;
       options: string[];
     } | null;
  };
  currentUserId: string;
  reactions: Record<string, number>;
  userReaction: string | null;
  comments: PostComment[];
  onReactionToggle: (reactionType: string) => void;
  onCommentAdded: () => void;
  onDelete?: () => void;
  /** Narrow card (e.g. half-width in the feed grid). The action row is icons and counts either way. */
  compact?: boolean;
  /** Open the comments straight away (the single post page). */
  defaultShowComments?: boolean;
}

const REACTION_TYPES = [
  { type: 'like', icon: ThumbsUp, label: 'Like', color: 'text-primary', bgColor: 'bg-primary' },
  { type: 'love', icon: Heart, label: 'Love', color: 'text-red-500', bgColor: 'bg-red-500' },
  { type: 'haha', icon: Laugh, label: 'Haha', color: 'text-yellow-500', bgColor: 'bg-yellow-500' },
  { type: 'wow', icon: Sparkles, label: 'Wow', color: 'text-yellow-500', bgColor: 'bg-yellow-500' },
  { type: 'sad', icon: Frown, label: 'Sad', color: 'text-yellow-600', bgColor: 'bg-yellow-600' },
  { type: 'angry', icon: Angry, label: 'Angry', color: 'text-orange-500', bgColor: 'bg-orange-500' },
];

const PostCard = ({
  post,
  currentUserId,
  reactions,
  userReaction,
  comments,
  onReactionToggle,
  onCommentAdded,
  onDelete,
  defaultShowComments = false,
}: PostCardProps) => {
  const [showComments, setShowComments] = useState(defaultShowComments);
  const myProfile = useMyProfile();
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  const [showReactions, setShowReactions] = useState(false);
  const [replyingTo, setReplyingTo] = useState<PostComment | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [editLoading, setEditLoading] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentContent, setEditCommentContent] = useState("");
  const { toast } = useToast();

  const handleEditComment = async (commentId: string) => {
    if (!editCommentContent.trim()) return;
    const { error } = await supabase
      .from("comments")
      .update({ content: editCommentContent.trim() })
      .eq("id", commentId);
    if (error) {
      toast({ title: "Error updating comment", variant: "destructive" });
    } else {
      setEditingCommentId(null);
      toast({ title: "Comment updated" });
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
       toast({ title: "Post unsaved" });
     } else {
       await supabase
         .from("saved_posts")
         .insert({ post_id: post.id, user_id: currentUserId });
       setIsSaved(true);
       toast({ title: "Post saved!" });
     }
   };

  const handleReaction = async (reactionType: string) => {
    setShowReactions(false);
    onReactionToggle(reactionType);

    if (userReaction === reactionType) {
      const { error } = await supabase
        .from("reactions")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", currentUserId);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        onReactionToggle(reactionType);
      }
    } else if (userReaction) {
      const { error } = await supabase
        .from("reactions")
        .update({ reaction_type: reactionType })
        .eq("post_id", post.id)
        .eq("user_id", currentUserId);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        onReactionToggle(userReaction);
      }
    } else {
      const { error } = await supabase
        .from("reactions")
        .insert({ post_id: post.id, user_id: currentUserId, reaction_type: reactionType });

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        onReactionToggle(reactionType);
      }
    }
  };

  const handleDeletePost = async () => {
    const { error } = await supabase
      .from("posts")
      .delete()
      .eq("id", post.id);

    if (error) {
      toast({ title: "Error deleting post", variant: "destructive" });
    } else {
      toast({ title: "Post deleted" });
      onDelete?.();
    }
  };

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

  const handleComment = async (e: React.FormEvent) => {
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
    }

    // Refresh real data from server
    onCommentAdded();
  };

  const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0);
  const currentReaction = REACTION_TYPES.find(r => r.type === userReaction);

  // Get top 3 reaction types for display
  const topReactions = Object.entries(reactions)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const authorFirstName = post.profiles.full_name?.split(" ")[0] || "them";

  if (blocked) return null;

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
      <div className="p-3 sm:p-4">
        <div className="flex items-start gap-2 sm:gap-3">
          <Link to={`/profile/${post.profiles.id}`}>
            <Avatar className="h-10 w-10">
              <AvatarImage src={post.profiles.avatar_url || undefined} />
              <AvatarFallback className="bg-secondary">
                {post.profiles.full_name?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
          </Link>
          
          <div className="flex-1 min-w-0">
            <Link to={`/profile/${post.profiles.id}`}>
              <p className="font-semibold text-sm sm:text-base hover:underline inline-flex items-center gap-1">
                {post.profiles.full_name || "Anonymous"}
                {post.profiles.is_verified && <VerifiedBadge size="sm" />}
              </p>
            </Link>
            {/* As in Facebook: "Lekki, Lagos · 2h · 🌐" (CloudBook posts are public). */}
            <p className="flex items-center gap-1 text-[13px] text-muted-foreground min-w-0">
              {post.location && <><span className="truncate">{post.location}</span><span aria-hidden="true">·</span></>}
              <time dateTime={toDate(post.created_at).toISOString()} title={formatDistanceToNow(toDate(post.created_at), { addSuffix: true })} className="shrink-0">
                {shortTime(post.created_at)}
              </time>
              <span aria-hidden="true">·</span>
              <Globe className="h-3 w-3 shrink-0" aria-label="Public" />
            </p>
          </div>

           <DropdownMenu>
             <DropdownMenuTrigger asChild>
               <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="Post options">
                 <MoreHorizontal className="h-5 w-5" />
               </Button>
             </DropdownMenuTrigger>
             <DropdownMenuContent align="end">
               <DropdownMenuItem onClick={handleSavePost}>
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
               </DropdownMenuItem>
                {currentUserId === post.user_id && (
                  <>
                    <DropdownMenuItem onClick={() => { setIsEditing(true); setEditContent(post.content); }}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit Post
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-destructive focus:text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Post
                    </DropdownMenuItem>
                  </>
                 )}
                {currentUserId !== post.user_id && (
                  <>
                    <DropdownMenuSeparator />
                    <ReportDialog
                      reportedType="post"
                      reportedId={post.id}
                      currentUserId={currentUserId}
                    />
                    <DropdownMenuItem onSelect={() => setBlockOpen(true)} className="text-destructive focus:text-destructive">
                      <Ban className="h-4 w-4 mr-2" />
                      Block {post.profiles.full_name || "this person"}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
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
                    toast({ title: "Post updated!" });
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
          <PostContent content={post.content} />
        )}
      </div>

      {/* Media */}
      {post.video_url && (
        <div className="relative w-full bg-black">
          <video
            // "#t=0.1" makes phones (iOS especially) show the first frame instead of a black box.
            src={post.video_url.includes("#") ? post.video_url : `${post.video_url}#t=0.1`}
            controls
            playsInline
            preload="metadata"
            crossOrigin="anonymous"
            onError={() => console.log("Post video failed to load:", post.video_url)}
            className="w-full max-h-[600px] object-contain"
            style={{ aspectRatio: '16/9' }}
          />
        </div>
      )}
      {!post.video_url && photos.length > 0 && (
        <>
          <div className="relative">
            <PhotoCollage
              images={photos}
              onOpen={setViewerIndex}
              // Double-tap likes (never un-likes), with a heart that pops over the photo.
              onDoubleTap={() => {
                if (!userReaction) handleReaction("like");
                setHeartBurst((n) => n + 1);
              }}
            />
            {heartBurst > 0 && (
              <span key={heartBurst} className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <Heart className="h-24 w-24 fill-white text-white drop-shadow-lg animate-heart-pop" />
              </span>
            )}
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

      {/* Actions, as in Facebook: 👍 99 · 💬 12 · ↪ on the left, the reactions people used on the right. */}
      <div className="px-1.5 sm:px-2 py-1 flex items-center relative">
        <div
          className="relative"
          onMouseEnter={() => setShowReactions(true)}
          onMouseLeave={() => setShowReactions(false)}
        >
          {/* Reaction Picker */}
          {showReactions && (
            <div className="absolute bottom-full left-0 pb-2 z-20">
              <div className="bg-card border rounded-full shadow-lg p-1.5 flex gap-1 animate-in fade-in-0 zoom-in-95">
                {REACTION_TYPES.map(({ type, icon: Icon, label, color }) => (
                  <button
                    key={type}
                    onClick={() => handleReaction(type)}
                    className="p-1.5 hover:scale-125 transition-transform rounded-full hover:bg-accent"
                    title={label}
                    aria-label={label}
                  >
                    <Icon className={cn("h-6 w-6", color)} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button
            variant="ghost"
            className={cn("h-10 gap-1.5 px-3 text-muted-foreground hover:bg-accent", currentReaction?.color)}
            // Tapping removes your reaction, whichever it is; with none it's a like.
            onClick={() => handleReaction(userReaction ?? 'like')}
            aria-pressed={!!userReaction}
            aria-label={`${currentReaction?.label ?? "Like"}${totalReactions ? `, ${totalReactions} ${totalReactions === 1 ? "reaction" : "reactions"}` : ""}`}
          >
            {currentReaction ? (
              <currentReaction.icon className={cn("h-[22px] w-[22px]", currentReaction.color)} />
            ) : (
              <ThumbsUp className="h-[22px] w-[22px]" />
            )}
            {totalReactions > 0 && <span className="text-[15px] font-medium">{compactCount(totalReactions)}</span>}
          </Button>
        </div>

        <Button
          variant="ghost"
          className="h-10 gap-1.5 px-3 text-muted-foreground hover:bg-accent"
          onClick={() => setShowComments(!showComments)}
          aria-expanded={showComments}
          aria-label={`Comment${comments.length ? `, ${comments.length} ${comments.length === 1 ? "comment" : "comments"}` : ""}`}
        >
          <MessageCircle className="h-[22px] w-[22px]" />
          {comments.length > 0 && <span className="text-[15px] font-medium">{compactCount(comments.length)}</span>}
        </Button>

        <Button
          variant="ghost"
          className="h-10 gap-1.5 px-3 text-muted-foreground hover:bg-accent"
          onClick={() => setShowShareDialog(true)}
          aria-label="Share"
        >
          <Share2 className="h-[22px] w-[22px]" />
        </Button>

        <TipButton postId={post.id} receiverId={post.user_id} currentUserId={currentUserId} compact />

        {topReactions.length > 0 && (
          <div className="ml-auto flex -space-x-1 pr-2" aria-hidden="true">
            {topReactions.map(([type]) => {
              const reaction = REACTION_TYPES.find(r => r.type === type);
              if (!reaction) return null;
              const Icon = reaction.icon;
              return (
                <div key={type} className={cn("h-[18px] w-[18px] rounded-full flex items-center justify-center ring-2 ring-card", reaction.bgColor)}>
                  <Icon className="h-2.5 w-2.5 text-white" />
                </div>
              );
            })}
          </div>
        )}
      </div>

       {/* Share Dialog */}
       <SharePostDialog
         postId={post.id}
         open={showShareDialog}
         onOpenChange={setShowShareDialog}
         currentUserId={currentUserId}
       />

      {/* Comments Section */}
      {showComments && (
        <div className="p-3 sm:p-4 space-y-3 bg-accent/30">
          {/* Comment Input */}
          <form onSubmit={handleComment} className="flex flex-col gap-2">
            {replyingTo && (
              <div className="flex items-center gap-2 ml-10 text-xs text-muted-foreground">
                <span>Replying to <strong>{replyingTo.profiles.full_name || "Anonymous"}</strong></span>
                <button
                  type="button"
                  onClick={() => { setReplyingTo(null); setCommentContent(""); }}
                  className="text-primary hover:underline"
                >
                  Cancel
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarImage src={myProfile?.avatar_url || undefined} alt="" />
                <AvatarFallback className="bg-secondary text-xs">{myProfile?.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
              </Avatar>
              <div className="flex-1 flex gap-2">
                <Textarea
                  placeholder={replyingTo ? `Reply to ${replyingTo.profiles.full_name || "Anonymous"}...` : "Write a comment..."}
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  // Enter sends, Shift+Enter adds a line (and never mid-composition on IME keyboards).
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  aria-label={replyingTo ? "Write a reply" : "Write a comment"}
                  className="min-h-[36px] h-9 py-2 resize-none rounded-full bg-secondary border-0"
                  disabled={isSubmitting}
                  rows={1}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting || !commentContent.trim()}
                  className="rounded-full px-4"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Post"
                  )}
                </Button>
              </div>
            </div>
          </form>

          {/* Comments List - Top-level comments */}
          {comments.filter(c => !c.parent_id).map((comment) => {
            const replies = comments.filter(c => c.parent_id === comment.id);
            return (
              <div key={comment.id}>
                {/* Parent comment */}
                <div className="flex gap-2">
                  <Link to={`/profile/${comment.profiles.id}`}>
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={comment.profiles.avatar_url || undefined} />
                      <AvatarFallback className="bg-secondary text-xs">
                        {comment.profiles.full_name?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  
                  <div className="flex-1 min-w-0">
                    <div className="bg-secondary rounded-2xl px-3 py-2 relative group inline-block max-w-full">
                      <Link to={`/profile/${comment.profiles.id}`}>
                        <p className="font-semibold text-xs sm:text-sm hover:underline">
                          {comment.profiles.full_name || "Anonymous"}
                        </p>
                      </Link>
                      {editingCommentId === comment.id ? (
                        <div className="mt-1">
                          <Textarea
                            value={editCommentContent}
                            onChange={(e) => setEditCommentContent(e.target.value)}
                            className="min-h-[36px] h-9 py-1 text-sm resize-none"
                            autoFocus
                          />
                          <div className="flex gap-1 mt-1">
                            <Button size="sm" className="h-6 text-xs px-2" disabled={!editCommentContent.trim()} onClick={() => handleEditComment(comment.id)}>Save</Button>
                            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm break-words">{comment.content}</p>
                      )}
                      {comment.profiles.id === currentUserId && editingCommentId !== comment.id && (
                        <div className="absolute -right-16 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingCommentId(comment.id); setEditCommentContent(comment.content); }} className="h-6 w-6">
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteComment(comment.id)} className="h-6 w-6">
                            <Trash2 className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 ml-3">
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(toDate(comment.created_at), { addSuffix: true })}
                      </p>
                      <button
                        onClick={() => { setReplyingTo(comment); setCommentContent(""); }}
                        className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                      >
                        Reply
                      </button>
                    </div>
                  </div>
                </div>

                {/* Replies */}
                {replies.length > 0 && (
                  <div className="ml-10 mt-2 space-y-2 border-l-2 border-border pl-3">
                    {replies.map((reply) => (
                      <div key={reply.id} className="flex gap-2">
                        <Link to={`/profile/${reply.profiles.id}`}>
                          <Avatar className="h-7 w-7 flex-shrink-0">
                            <AvatarImage src={reply.profiles.avatar_url || undefined} />
                            <AvatarFallback className="bg-secondary text-[10px]">
                              {reply.profiles.full_name?.[0]?.toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                        
                        <div className="flex-1 min-w-0">
                          <div className="bg-secondary rounded-2xl px-3 py-2 relative group inline-block max-w-full">
                            <Link to={`/profile/${reply.profiles.id}`}>
                              <p className="font-semibold text-xs hover:underline">
                                {reply.profiles.full_name || "Anonymous"}
                              </p>
                            </Link>
                            <p className="text-sm break-words">{reply.content}</p>
                            {reply.profiles.id === currentUserId && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteComment(reply.id)}
                                className="absolute -right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                              >
                                <Trash2 className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 ml-3">
                            {formatDistanceToNow(toDate(reply.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {currentUserId !== post.user_id && (
        <BlockDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          userId={post.user_id}
          name={post.profiles.full_name}
          onBlocked={() => setBlocked(true)}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this post?"
        description="It will be removed with its reactions and comments."
        onConfirm={handleDeletePost}
      />
    </Card>
  );
};

export default PostCard;