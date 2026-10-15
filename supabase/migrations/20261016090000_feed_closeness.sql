-- For you: posts from the people you're closest to come first (likes, comments and messages
-- in the last 60 days), as Facebook ranks its feed. Same signature; only the score changes.
CREATE OR REPLACE FUNCTION public.get_ranked_posts(
  _user_id uuid,
  _feed_filter text DEFAULT 'all',
  _cursor_score numeric DEFAULT NULL,
  _cursor_id uuid DEFAULT NULL,
  _page_size int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  content text,
  image_url text,
  video_url text,
  created_at timestamptz,
  user_id uuid,
  profile_id uuid,
  profile_full_name text,
  profile_avatar_url text,
  profile_is_verified boolean,
  engagement_score numeric,
  reaction_count bigint,
  comment_count bigint,
  background text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH friend_ids AS (
    SELECT CASE WHEN f.user_id = _user_id THEN f.friend_id ELSE f.user_id END AS fid
    FROM friendships f
    WHERE (f.user_id = _user_id OR f.friend_id = _user_id)
      AND f.status = 'accepted'
  ),
  blocked_ids AS (
    SELECT CASE WHEN b.blocker_id = _user_id THEN b.blocked_id ELSE b.blocker_id END AS bid
    FROM blocks b
    WHERE b.blocker_id = _user_id OR b.blocked_id = _user_id
  ),
  -- How close you are to each person, as Facebook ranks it: what you've liked, commented on and
  -- messaged in the last 60 days. Their posts rise in For you.
  closeness AS (
    SELECT author, COUNT(*) AS n FROM (
      SELECT p.user_id AS author FROM reactions r JOIN posts p ON p.id = r.post_id
        WHERE r.user_id = _user_id AND r.created_at > now() - interval '60 days'
      UNION ALL
      SELECT p.user_id FROM comments c JOIN posts p ON p.id = c.post_id
        WHERE c.user_id = _user_id AND c.created_at > now() - interval '60 days'
      UNION ALL
      SELECT m.receiver_id FROM messages m
        WHERE m.sender_id = _user_id AND m.created_at > now() - interval '60 days'
    ) x
    WHERE author <> _user_id
    GROUP BY author
  ),
  post_stats AS (
    SELECT
      p.id, p.content, p.image_url, p.video_url, p.created_at, p.user_id, p.background,
      pr.id AS profile_id,
      pr.full_name AS profile_full_name,
      pr.avatar_url AS profile_avatar_url,
      pr.is_verified AS profile_is_verified,
      COALESCE(r.cnt, 0) AS reaction_count,
      COALESCE(c.cnt, 0) AS comment_count,
      CASE
        WHEN _feed_filter = 'digest'
          THEN (COALESCE(r.cnt, 0) * 2 + COALESCE(c.cnt, 0) * 3)::numeric
        WHEN _feed_filter = 'foryou'
          THEN round((
            (1 + COALESCE(r.cnt, 0) + COALESCE(c.cnt, 0) * 2
               + CASE WHEN p.user_id = _user_id OR p.user_id IN (SELECT fid FROM friend_ids) THEN 4 ELSE 0 END
               + 3 * ln(1 + COALESCE((SELECT cl.n FROM closeness cl WHERE cl.author = p.user_id), 0)))
            / power(GREATEST(EXTRACT(EPOCH FROM (now() - p.created_at)) / 3600, 0) + 2, 1.3)
          )::numeric, 12)
        ELSE EXTRACT(EPOCH FROM p.created_at)::numeric
      END AS engagement_score
    FROM posts p
    JOIN profiles pr ON pr.id = p.user_id
    LEFT JOIN (SELECT post_id, COUNT(*) AS cnt FROM reactions GROUP BY post_id) r ON r.post_id = p.id
    LEFT JOIN (SELECT post_id, COUNT(*) AS cnt FROM comments GROUP BY post_id) c ON c.post_id = p.id
    WHERE (p.expires_at IS NULL OR p.expires_at > now())
      AND p.user_id NOT IN (SELECT bid FROM blocked_ids)
      AND (
        _feed_filter IN ('all', 'digest', 'foryou')
        OR p.user_id = _user_id
        OR p.user_id IN (SELECT fid FROM friend_ids)
      )
      AND (_feed_filter <> 'digest' OR p.created_at > now() - interval '7 days')
  )
  SELECT
    ps.id, ps.content, ps.image_url, ps.video_url, ps.created_at, ps.user_id,
    ps.profile_id, ps.profile_full_name, ps.profile_avatar_url, ps.profile_is_verified,
    ps.engagement_score, ps.reaction_count, ps.comment_count, ps.background
  FROM post_stats ps
  WHERE _cursor_score IS NULL
     OR (ps.engagement_score, ps.id) < (_cursor_score, _cursor_id)
  ORDER BY ps.engagement_score DESC, ps.created_at DESC, ps.id DESC
  LIMIT _page_size;
$$;
