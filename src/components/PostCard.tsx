import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Heart, MessageCircle, Loader2, Laugh, Frown, Angry, Sparkles, Trash2, MoreHorizontal, Share2, ThumbsUp } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface PostCardProps {
  post: {
    id: string;
    content: string;
    image_url: string | null;
    video_url?: string | null;
    created_at: string;
    profiles: {
      id: string;
      full_name: string | null;
      avatar_url: string | null;
    };
    user_id: string;
  };
  currentUserId: string;
  reactions: Record<string, number>;
  userReaction: string | null;
  comments: Comment[];
  onReactionToggle: (reactionType: string) => void;
  onCommentAdded: () => void;
  onDelete?: () => void;
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
}: PostCardProps) => {
  const [showComments, setShowComments] = useState(false);
  const [commentContent, setCommentContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const { toast } = useToast();

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

    setIsSubmitting(true);

    const { error } = await supabase
      .from("comments")
      .insert({
        post_id: post.id,
        user_id: currentUserId,
        content: commentContent.trim(),
      });

    setIsSubmitting(false);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setCommentContent("");
    setShowComments(true);
    onCommentAdded();
  };

  const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0);
  const currentReaction = REACTION_TYPES.find(r => r.type === userReaction);

  // Get top 3 reaction types for display
  const topReactions = Object.entries(reactions)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <Card className="shadow-sm overflow-hidden">
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
              <p className="font-semibold text-sm sm:text-base hover:underline">
                {post.profiles.full_name || "Anonymous"}
              </p>
            </Link>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
            </p>
          </div>

          {currentUserId === post.user_id && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDeletePost} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Post
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Content */}
        <p className="mt-3 text-sm sm:text-base whitespace-pre-wrap break-words">{post.content}</p>
      </div>

      {/* Media */}
      {post.video_url && (
        <div className="relative w-full bg-black">
          <video
            src={post.video_url}
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
      {!post.video_url && post.image_url && (
        <img
          src={post.image_url}
          alt="Post content"
          className="w-full max-h-[500px] object-cover"
        />
      )}

      {/* Reactions Summary & Comments Count */}
      <div className="px-3 sm:px-4 py-2 flex items-center justify-between text-sm text-muted-foreground border-b">
        <div className="flex items-center gap-1">
          {topReactions.length > 0 && (
            <>
              <div className="flex -space-x-1">
                {topReactions.map(([type]) => {
                  const reaction = REACTION_TYPES.find(r => r.type === type);
                  if (!reaction) return null;
                  const Icon = reaction.icon;
                  return (
                    <div
                      key={type}
                      className={cn("h-5 w-5 rounded-full flex items-center justify-center", reaction.bgColor)}
                    >
                      <Icon className="h-3 w-3 text-white" />
                    </div>
                  );
                })}
              </div>
              <span className="ml-1">{totalReactions}</span>
            </>
          )}
        </div>
        {comments.length > 0 && (
          <button
            onClick={() => setShowComments(!showComments)}
            className="hover:underline"
          >
            {comments.length} {comments.length === 1 ? "comment" : "comments"}
          </button>
        )}
      </div>

      {/* Action Buttons */}
      <div className="px-2 py-1 flex items-center border-b relative">
        <div 
          className="flex-1 relative"
          onMouseEnter={() => setShowReactions(true)}
          onMouseLeave={() => setShowReactions(false)}
        >
          {/* Reaction Picker */}
          {showReactions && (
            <div className="absolute bottom-full left-0 mb-2 bg-card border rounded-full shadow-lg p-1.5 flex gap-1 z-20 animate-in fade-in-0 zoom-in-95">
              {REACTION_TYPES.map(({ type, icon: Icon, label, color }) => (
                <button
                  key={type}
                  onClick={() => handleReaction(type)}
                  className="p-1.5 hover:scale-125 transition-transform rounded-full hover:bg-accent"
                  title={label}
                >
                  <Icon className={cn("h-6 w-6", color)} />
                </button>
              ))}
            </div>
          )}
          
          <Button
            variant="ghost"
            className="w-full gap-2 text-muted-foreground hover:bg-accent"
            onClick={() => handleReaction('like')}
          >
            {currentReaction ? (
              <>
                <currentReaction.icon className={cn("h-5 w-5", currentReaction.color)} />
                <span className={cn("hidden sm:inline", currentReaction.color)}>{currentReaction.label}</span>
              </>
            ) : (
              <>
                <ThumbsUp className="h-5 w-5" />
                <span className="hidden sm:inline">Like</span>
              </>
            )}
          </Button>
        </div>
        
        <Button
          variant="ghost"
          className="flex-1 gap-2 text-muted-foreground hover:bg-accent"
          onClick={() => setShowComments(!showComments)}
        >
          <MessageCircle className="h-5 w-5" />
          <span className="hidden sm:inline">Comment</span>
        </Button>

        <Button
          variant="ghost"
          className="flex-1 gap-2 text-muted-foreground hover:bg-accent"
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`);
            toast({ title: "Link copied!" });
          }}
        >
          <Share2 className="h-5 w-5" />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="p-3 sm:p-4 space-y-3 bg-accent/30">
          {/* Comment Input */}
          <form onSubmit={handleComment} className="flex gap-2">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarFallback className="bg-secondary text-xs">U</AvatarFallback>
            </Avatar>
            <div className="flex-1 flex gap-2">
              <Textarea
                placeholder="Write a comment..."
                value={commentContent}
                onChange={(e) => setCommentContent(e.target.value)}
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
          </form>

          {/* Comments List */}
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-2">
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
                  <p className="text-sm break-words">{comment.content}</p>
                  {comment.profiles.id === currentUserId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteComment(comment.id)}
                      className="absolute -right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 ml-3">
                  {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default PostCard;