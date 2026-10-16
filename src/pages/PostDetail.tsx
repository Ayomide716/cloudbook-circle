import { useContext, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileQuestion } from "@/components/icons";
import { supabase } from "@/integrations/supabase/client";
import { SessionContext } from "@/lib/session-context";
import Navigation from "@/components/Navigation";
import PostCard, { type PostCardProps } from "@/components/PostCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSEO } from "@/hooks/useSEO";
import { fetchPostInteractions, usePostInteractions } from "@/hooks/use-post-interactions";

type Post = PostCardProps["post"];

/** One post with its comments open: where notifications and search results lead. */
const PostDetail = () => {
  const { postId } = useParams();
  const navigate = useNavigate();
  const userId = useContext(SessionContext)?.user.id ?? null;
  const [post, setPost] = useState<Post | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const { reactionsData, setReactionsData, commentsData, setCommentsData, toggleReaction, reloadComments } = usePostInteractions();

  useSEO({
    title: post ? `${post.profiles.full_name || "Someone"} on Ember` : "Post",
    description: post?.content.slice(0, 150) || "A post on Ember.",
  });

  useEffect(() => {
    if (!postId || !userId) return;
    let cancelled = false;
    setStatus("loading");
    (async () => {
      const [{ data }, { data: poll }, extras] = await Promise.all([
        supabase
          .from("posts")
          .select("id, content, image_url, image_urls, video_url, created_at, user_id, profiles:user_id (id, full_name, avatar_url, is_verified)")
          .eq("id", postId)
          .maybeSingle(),
        supabase.from("polls").select("id, question, options").eq("post_id", postId).maybeSingle(),
        fetchPostInteractions([postId], userId),
      ]);
      if (cancelled) return;
      if (!data || !data.profiles) {
        setStatus("missing");
        return;
      }
      setPost({
        ...data,
        image_urls: (data.image_urls as string[] | null) ?? null,
        poll: poll ? { id: poll.id, question: poll.question, options: poll.options as string[] } : null,
      });
      setReactionsData(extras.reactions);
      setCommentsData(extras.comments);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, userId, setReactionsData, setCommentsData]);

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Navigation currentUserId={userId ?? undefined} />
      <main className="max-w-2xl mx-auto px-0 py-2 sm:px-4 sm:py-6">
        {/* As on Facebook: "← Ada's post". */}
        <header className="mb-1 flex items-center gap-2 px-4 sm:mb-3 sm:px-0">
          <button type="button" onClick={goBack} aria-label="Back" className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-secondary">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 truncate font-display text-lg font-bold">
            {post ? `${post.profiles.full_name?.split(" ")[0] || "Someone"}'s post` : "Post"}
          </h1>
        </header>

        {status === "loading" && (
          <div className="rounded-2xl border bg-card p-4 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        )}

        {status === "missing" && (
          <div className="rounded-2xl border bg-card px-6 py-14 text-center">
            <FileQuestion className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold">This post isn't available</h2>
            <p className="text-sm text-muted-foreground mt-1">It may have been deleted, or you may not have permission to see it.</p>
            <Button onClick={() => navigate("/")} className="mt-6 rounded-full">
              Go to your feed
            </Button>
          </div>
        )}

        {status === "ready" && post && userId && (
          // Flat and edge to edge on phones, like the feed.
          <div className="feed-flush">
          <PostCard
            post={post}
            currentUserId={userId}
            reactions={reactionsData[post.id]?.reactions || {}}
            userReaction={reactionsData[post.id]?.userReaction || null}
            firstReactorName={reactionsData[post.id]?.firstReactor}
            comments={commentsData[post.id] || []}
            onReactionToggle={(type) => toggleReaction(post.id, type)}
            onCommentAdded={() => reloadComments(post.id)}
            onDelete={() => navigate("/", { replace: true })}
            defaultShowComments
            inlineComments
          />
          </div>
        )}
      </main>
    </div>
  );
};

export default PostDetail;
