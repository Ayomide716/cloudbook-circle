import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Heart, MessageCircle, Loader2 } from "lucide-react";
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
    created_at: string;
    profiles: {
      id: string;
      full_name: string | null;
      avatar_url: string | null;
    };
  };
  currentUserId: string;
  likesCount: number;
  isLiked: boolean;
  comments: Comment[];
  onLikeToggle: () => void;
  onCommentAdded: () => void;
}

const PostCard = ({
  post,
  currentUserId,
  likesCount,
  isLiked,
  comments,
  onLikeToggle,
  onCommentAdded,
}: PostCardProps) => {
  const [showComments, setShowComments] = useState(false);
  const [commentContent, setCommentContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleLike = async () => {
    if (isLiked) {
      const { error } = await supabase
        .from("likes")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", currentUserId);

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
    } else {
      const { error } = await supabase
        .from("likes")
        .insert({
          post_id: post.id,
          user_id: currentUserId,
        });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
    }
    
    onLikeToggle();
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

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3 mb-3">
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
      </div>

      <p className="mb-3 whitespace-pre-wrap">{post.content}</p>

      {post.image_url && (
        <img
          src={post.image_url}
          alt="Post content"
          className="w-full rounded-lg mb-3"
        />
      )}

      <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3 border-b pb-2">
        {likesCount > 0 && (
          <span>{likesCount} {likesCount === 1 ? "like" : "likes"}</span>
        )}
        {comments.length > 0 && likesCount > 0 && <span>•</span>}
        {comments.length > 0 && (
          <span>{comments.length} {comments.length === 1 ? "comment" : "comments"}</span>
        )}
      </div>

      <div className="flex gap-2 mb-3">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          onClick={handleLike}
        >
          <Heart
            className={`h-5 w-5 mr-2 ${isLiked ? "fill-red-500 text-red-500" : ""}`}
          />
          Like
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          onClick={() => setShowComments(!showComments)}
        >
          <MessageCircle className="h-5 w-5 mr-2" />
          Comment
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
                <div className="bg-secondary rounded-lg p-2">
                  <Link to={`/profile/${comment.profiles.id}`}>
                    <p className="font-semibold text-sm hover:underline">
                      {comment.profiles.full_name || "Anonymous"}
                    </p>
                  </Link>
                  <p className="text-sm">{comment.content}</p>
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