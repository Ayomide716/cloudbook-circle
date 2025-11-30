import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Heart, MessageCircle, Loader2, Laugh, Frown, Angry, Sparkles, Trash2, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";

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
  { type: 'like', icon: Heart, label: 'Like', color: 'text-blue-500' },
  { type: 'love', icon: Heart, label: 'Love', color: 'text-red-500' },
  { type: 'haha', icon: Laugh, label: 'Haha', color: 'text-yellow-500' },
  { type: 'wow', icon: Sparkles, label: 'Wow', color: 'text-purple-500' },
  { type: 'sad', icon: Frown, label: 'Sad', color: 'text-gray-500' },
  { type: 'angry', icon: Angry, label: 'Angry', color: 'text-orange-500' },
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
    onCommentAdded();
  };

  const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0);
  const currentReaction = REACTION_TYPES.find(r => r.type === userReaction);

  return (
    <Card className="p-3 sm:p-4">
      <div className="flex items-start gap-2 sm:gap-3 mb-3">
        <Link to={`/profile/${post.profiles.id}`}>
          <Avatar className="h-10 w-10">
            <AvatarImage src={post.profiles.avatar_url || undefined} />
            <AvatarFallback>
              {post.profiles.full_name?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
        </Link>
        
        <div className="flex-1">
          <Link to={`/profile/${post.profiles.id}`}>
            <p className="font-semibold hover:underline">
              {post.profiles.full_name || "Anonymous"}
            </p>
          </Link>
          <p className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
          </p>
        </div>

        {currentUserId === post.user_id && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleDeletePost} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Post
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <p className="mb-3 whitespace-pre-wrap text-sm sm:text-base break-words">{post.content}</p>

      {post.video_url && (
        <video
          src={post.video_url}
          controls
          className="w-full rounded-lg mb-3 max-h-96 sm:max-h-[500px] object-cover"
        />
      )}

      {post.image_url && (
        <img
          src={post.image_url}
          alt="Post content"
          className="w-full rounded-lg mb-3 max-h-96 sm:max-h-[500px] object-cover"
        />
      )}

      <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground mb-3 border-b pb-2">
        {totalReactions > 0 && (
          <div className="flex items-center gap-1">
            {Object.entries(reactions).filter(([_, count]) => count > 0).map(([type, count]) => {
              const reaction = REACTION_TYPES.find(r => r.type === type);
              if (!reaction) return null;
              const Icon = reaction.icon;
              return (
                <div key={type} className="flex items-center">
                  <Icon className={`h-3 w-3 ${reaction.color}`} />
                </div>
              );
            })}
            <span>{totalReactions}</span>
          </div>
        )}
        {comments.length > 0 && totalReactions > 0 && <span>•</span>}
        {comments.length > 0 && (
          <span>{comments.length} {comments.length === 1 ? "comment" : "comments"}</span>
        )}
      </div>

      <div className="flex gap-1 sm:gap-2 mb-3 relative">
        <div 
          className="relative flex-1"
          onMouseEnter={() => setShowReactions(true)}
          onMouseLeave={() => setShowReactions(false)}
        >
          {showReactions && (
            <div className="absolute bottom-full left-0 mb-2 bg-background border rounded-full shadow-lg p-2 flex gap-2 z-10">
              {REACTION_TYPES.map(({ type, icon: Icon, label, color }) => (
                <button
                  key={type}
                  onClick={() => handleReaction(type)}
                  className="hover:scale-125 transition-transform"
                  title={label}
                >
                  <Icon className={`h-6 w-6 ${color}`} />
                </button>
              ))}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs sm:text-sm"
            onClick={() => handleReaction('like')}
          >
            {currentReaction ? (
              <>
                <currentReaction.icon className={`h-4 w-4 sm:h-5 sm:w-5 sm:mr-2 ${currentReaction.color}`} />
                <span className={`hidden sm:inline ${currentReaction.color}`}>{currentReaction.label}</span>
              </>
            ) : (
              <>
                <Heart className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
                <span className="hidden sm:inline">Like</span>
              </>
            )}
          </Button>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 text-xs sm:text-sm"
          onClick={() => setShowComments(!showComments)}
        >
          <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
          <span className="hidden sm:inline">Comment</span>
        </Button>
      </div>

      {showComments && (
        <div className="space-y-3 border-t pt-3">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-2">
              <Link to={`/profile/${comment.profiles.id}`}>
                <Avatar className="h-8 w-8">
                  <AvatarImage src={comment.profiles.avatar_url || undefined} />
                  <AvatarFallback>
                    {comment.profiles.full_name?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </Link>
              
              <div className="flex-1">
                <div className="bg-secondary rounded-lg p-2 relative group">
                  <Link to={`/profile/${comment.profiles.id}`}>
                    <p className="font-semibold text-sm hover:underline">
                      {comment.profiles.full_name || "Anonymous"}
                    </p>
                  </Link>
                  <p className="text-sm">{comment.content}</p>
                  {comment.profiles.id === currentUserId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteComment(comment.id)}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 ml-2">
                  {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}

          <form onSubmit={handleComment} className="flex gap-2">
            <Textarea
              placeholder="Write a comment..."
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              className="min-h-[60px] resize-none"
              disabled={isSubmitting}
            />
            <Button
              type="submit"
              disabled={isSubmitting || !commentContent.trim()}
              size="sm"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Post"
              )}
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
};

export default PostCard;