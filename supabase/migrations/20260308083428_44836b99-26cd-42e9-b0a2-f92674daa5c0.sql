
DROP FUNCTION public.get_ranked_posts(uuid, text, numeric, uuid, integer);

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
  comment_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH friend_ids AS (
    SELECT CASE 
      WHEN f.user_id = _user_id THEN f.friend_id 
      ELSE f.user_id 
    END AS fid
    FROM friendships f
    WHERE (f.user_id = _user_id OR f.friend_id = _user_id)
      AND f.status = 'accepted'
  ),
  post_stats AS (
    SELECT 
      p.id,
      p.content,
      p.image_url,
      p.video_url,
      p.created_at,
      p.user_id,
      pr.id AS profile_id,
      pr.full_name AS profile_full_name,
      pr.avatar_url AS profile_avatar_url,
      pr.is_verified AS profile_is_verified,
      COALESCE(r.cnt, 0) AS reaction_count,
      COALESCE(c.cnt, 0) AS comment_count,
      (COALESCE(r.cnt, 0) * 2 + COALESCE(c.cnt, 0) * 3 + 
       GREATEST(0, 10.0 - EXTRACT(EPOCH FROM (now() - p.created_at)) / 8640.0)
      )::numeric AS engagement_score
    FROM posts p
    JOIN profiles pr ON pr.id = p.user_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS cnt FROM reactions GROUP BY post_id
    ) r ON r.post_id = p.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS cnt FROM comments GROUP BY post_id
    ) c ON c.post_id = p.id
    WHERE (
      _feed_filter = 'all' 
      OR p.user_id = _user_id 
      OR p.user_id IN (SELECT fid FROM friend_ids)
    )
  )
  SELECT 
    ps.id, ps.content, ps.image_url, ps.video_url, ps.created_at, ps.user_id,
    ps.profile_id, ps.profile_full_name, ps.profile_avatar_url, ps.profile_is_verified,
    ps.engagement_score, ps.reaction_count, ps.comment_count
  FROM post_stats ps
  WHERE (
    _cursor_score IS NULL 
    OR (ps.engagement_score, ps.id) < (_cursor_score, _cursor_id)
  )
  ORDER BY ps.engagement_score DESC, ps.id DESC
  LIMIT _page_size;
$$;
