import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 10;

interface FeedPost {
  id: string;
  content: string;
  image_url: string | null;
  image_urls: string[] | null;
  video_url: string | null;
  created_at: string;
  user_id: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  poll?: {
    id: string;
    question: string;
    options: string[];
  } | null;
  engagement_score?: number;
}

interface FeedPage {
  posts: FeedPost[];
  nextCursor: { score: number; id: string } | null;
}

async function fetchFeedPage(
  userId: string,
  feedFilter: "all" | "friends" | "digest",
  cursor: { score: number; id: string } | null
): Promise<FeedPage> {
  const isDigest = feedFilter === "digest";
  const { data: rankedData, error } = await supabase.rpc("get_ranked_posts", {
    _user_id: userId,
    _feed_filter: isDigest ? "all" : feedFilter,
    _cursor_score: isDigest ? null : (cursor?.score ?? null),
    _cursor_id: isDigest ? null : (cursor?.id ?? null),
    _page_size: isDigest ? 15 : PAGE_SIZE,
  });

  if (error) throw error;

  const posts: FeedPost[] = (rankedData || []).map((r: any) => ({
    id: r.id,
    content: r.content,
    image_url: r.image_url,
    image_urls: null, // Will be fetched separately
    video_url: r.video_url,
    created_at: r.created_at,
    user_id: r.user_id,
    profiles: {
      id: r.profile_id,
      full_name: r.profile_full_name,
      avatar_url: r.profile_avatar_url,
      is_verified: r.profile_is_verified,
    },
    engagement_score: r.engagement_score,
    poll: null,
  }));

  // Fetch image_urls for posts
  if (posts.length > 0) {
    const postIds = posts.map((p) => p.id);
    const { data: postsData } = await supabase
      .from("posts")
      .select("id, image_urls")
      .in("id", postIds);

    if (postsData) {
      posts.forEach((post) => {
        const pd = postsData.find((p) => p.id === post.id);
        if (pd && pd.image_urls && (pd.image_urls as string[]).length > 0) {
          post.image_urls = pd.image_urls as string[];
        }
      });
    }
  }

  // Load polls for these posts
  if (posts.length > 0) {
    const postIds = posts.map((p) => p.id);
    const { data: pollsData } = await supabase
      .from("polls")
      .select("id, post_id, question, options")
      .in("post_id", postIds);

    if (pollsData) {
      posts.forEach((post) => {
        const poll = pollsData.find((p) => p.post_id === post.id);
        if (poll) {
          post.poll = {
            id: poll.id,
            question: poll.question,
            options: poll.options as string[],
          };
        }
      });
    }
  }

  const lastPost = rankedData?.[rankedData.length - 1];
  const nextCursor =
    rankedData && rankedData.length === PAGE_SIZE && lastPost
      ? { score: Number(lastPost.engagement_score), id: lastPost.id }
      : null;

  return { posts, nextCursor };
}

export function useFeedQuery(userId: string | null, feedFilter: "all" | "friends" | "digest") {
  return useInfiniteQuery({
    queryKey: ["feed", userId, feedFilter],
    queryFn: ({ pageParam }) => fetchFeedPage(userId!, feedFilter, pageParam),
    initialPageParam: null as { score: number; id: string } | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!userId,
    staleTime: 30_000, // 30s before refetch
    refetchOnWindowFocus: true,
  });
}

export function useFeedReactions(userId: string | null) {
  const queryClient = useQueryClient();

  const fetchReactions = async (postIds: string[]) => {
    if (!userId || postIds.length === 0) return {};

    const { data: reactionsData } = await supabase
      .from("reactions")
      .select("post_id, user_id, reaction_type")
      .in("post_id", postIds);

    const reactionsMap: Record<string, { reactions: Record<string, number>; userReaction: string | null }> = {};
    postIds.forEach((id) => {
      const postReactions = reactionsData?.filter((r) => r.post_id === id) || [];
      const reactionCounts: Record<string, number> = {};
      postReactions.forEach((r) => {
        reactionCounts[r.reaction_type] = (reactionCounts[r.reaction_type] || 0) + 1;
      });
      const userReaction = postReactions.find((r) => r.user_id === userId);
      reactionsMap[id] = {
        reactions: reactionCounts,
        userReaction: userReaction?.reaction_type || null,
      };
    });
    return reactionsMap;
  };

  const fetchComments = async (postIds: string[]) => {
    if (postIds.length === 0) return {};

    const { data: commentsData } = await supabase
      .from("comments")
      .select(`*, profiles:user_id (id, full_name, avatar_url)`)
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    const commentsMap: Record<string, any[]> = {};
    postIds.forEach((id) => {
      commentsMap[id] = commentsData?.filter((c) => c.post_id === id) || [];
    });
    return commentsMap;
  };

  return { fetchReactions, fetchComments };
}
