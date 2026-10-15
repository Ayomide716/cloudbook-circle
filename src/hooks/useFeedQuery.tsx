import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { features } from "@/lib/features";
import { supabase } from "@/integrations/supabase/client";
import type { PostComment } from "@/components/PostCard";

const PAGE_SIZE = 10;

/** "foryou": everyone's posts, best first; "friends": friends and you, newest first. */
export type FeedFilter = "all" | "friends" | "digest" | "foryou";

interface FeedPost {
  id: string;
  content: string;
  image_url: string | null;
  image_urls: string[] | null;
  image_previews?: string[] | null;
  video_url: string | null;
  location?: string | null;
  background?: string | null;
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
  feedFilter: FeedFilter,
  cursor: { score: number; id: string } | null
): Promise<FeedPage> {
  const isDigest = feedFilter === "digest";
  const { data: rankedData, error } = await supabase.rpc("get_ranked_posts", {
    _user_id: userId,
    _feed_filter: feedFilter,
    _cursor_score: isDigest ? undefined : cursor?.score,
    _cursor_id: isDigest ? undefined : cursor?.id,
    _page_size: isDigest ? 15 : PAGE_SIZE,
  });

  if (error) throw error;

  const posts: FeedPost[] = (rankedData || []).map((r) => ({
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
    background: (r as { background?: string | null }).background ?? null,
    poll: null,
  }));

  // Your own posts from the last few hours go first, as on Facebook: a new post has no likes
  // yet, so the ranking alone could put it below older, busier posts.
  if (!cursor && !isDigest) {
    const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const [{ data: mine }, { data: me }] = await Promise.all([
      supabase
        .from("posts")
        .select("*")
        .eq("user_id", userId)
        .gt("created_at", since)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase.from("profiles").select("id, full_name, avatar_url, is_verified").eq("id", userId).maybeSingle(),
    ]);
    const fresh = (mine ?? []).filter((p) => !p.expires_at || new Date(p.expires_at) > new Date());
    if (fresh.length && me) {
      const freshIds = new Set(fresh.map((p) => p.id));
      const own: FeedPost[] = fresh.map((p) => ({
        id: p.id,
        content: p.content,
        image_url: p.image_url,
        image_urls: null,
        video_url: p.video_url,
        created_at: p.created_at ?? new Date().toISOString(),
        user_id: p.user_id,
        profiles: me,
        background: (p as { background?: string | null }).background ?? null,
        poll: null,
      }));
      posts.splice(0, posts.length, ...own, ...posts.filter((p) => !freshIds.has(p.id)));
    }
  }

  // Photos and place for these posts (the ranking function returns the basics only)
  if (posts.length > 0) {
    const postIds = posts.map((p) => p.id);
    const { data: postsData } = await supabase
      .from("posts")
      // Without the place column on the live database yet, ask only for photos (place stays empty).
      .select((features.postLocation ? "id, image_urls, location" : "id, image_urls") as "id, image_urls, location")
      .in("id", postIds);

    // Blurred photo previews: asked separately, so a database without them still loads photos.
    const { data: previewData } = await supabase.from("posts").select("id, image_previews").in("id", postIds);
    for (const row of previewData ?? []) {
      const post = posts.find((p) => p.id === row.id);
      if (post && row.image_previews?.length) post.image_previews = row.image_previews;
    }

    if (postsData) {
      posts.forEach((post) => {
        const pd = postsData.find((p) => p.id === post.id);
        if (pd && pd.image_urls && (pd.image_urls as string[]).length > 0) {
          post.image_urls = pd.image_urls as string[];
        }
        if (pd?.location) post.location = pd.location;
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
    isDigest ? null :
    (rankedData && rankedData.length === PAGE_SIZE && lastPost
      ? { score: Number(lastPost.engagement_score), id: lastPost.id }
      : null);

  return { posts, nextCursor };
}

/** A post never shows twice, even if a page boundary shifts while you scroll. */
export function dedupeFeedPages<D extends { pages: { posts: { id: string }[] }[] }>(data: D): D {
  const seen = new Set<string>();
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      posts: page.posts.filter((p) => !seen.has(p.id) && !!seen.add(p.id)),
    })),
  };
}

export function useFeedQuery(userId: string | null, feedFilter: FeedFilter) {
  return useInfiniteQuery({
    queryKey: ["feed", userId, feedFilter],
    queryFn: ({ pageParam }) => fetchFeedPage(userId!, feedFilter, pageParam),
    select: dedupeFeedPages,
    initialPageParam: null as { score: number; id: string } | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!userId,
    // Switching For you / Friends keeps the current posts up until the other list arrives,
    // instead of blanking the page to a loading skeleton.
    placeholderData: (previous) => previous,
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

    // One other person per post to name ("Ada Obi and 12 others"), in a single query.
    const firstOther = new Map<string, string>();
    for (const r of reactionsData ?? []) {
      if (r.user_id !== userId && !firstOther.has(r.post_id)) firstOther.set(r.post_id, r.user_id);
    }
    const otherIds = [...new Set(firstOther.values())];
    const { data: people } = otherIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", otherIds)
      : { data: [] };
    const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));

    const reactionsMap: Record<string, { reactions: Record<string, number>; userReaction: string | null; firstReactor: string | null }> = {};
    postIds.forEach((id) => {
      const postReactions = reactionsData?.filter((r) => r.post_id === id) || [];
      const reactionCounts: Record<string, number> = {};
      postReactions.forEach((r) => {
        reactionCounts[r.reaction_type] = (reactionCounts[r.reaction_type] || 0) + 1;
      });
      const userReaction = postReactions.find((r) => r.user_id === userId);
      const other = firstOther.get(id);
      reactionsMap[id] = {
        reactions: reactionCounts,
        userReaction: userReaction?.reaction_type || null,
        firstReactor: other ? names.get(other) ?? null : null,
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

    const commentsMap: Record<string, PostComment[]> = {};
    postIds.forEach((id) => {
      commentsMap[id] = commentsData?.filter((c) => c.post_id === id) || [];
    });
    return commentsMap;
  };

  return { fetchReactions, fetchComments };
}
