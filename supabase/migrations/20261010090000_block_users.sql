-- Blocking, as the App Store and Google Play require for apps where people post.
--
-- When either person has blocked the other:
--   * neither sees the other's posts or comments (feed, profiles, post pages)
--   * neither can message, friend-request, comment on or react to the other's posts
--   * neither is suggested to the other as a friend
-- Blocking also ends any friendship or pending request between them.
--
-- The checks are "restrictive" policies, so they apply on top of the existing rules
-- without rewriting them.

CREATE INDEX IF NOT EXISTS blocks_blocked_blocker_idx ON public.blocks (blocked_id, blocker_id);

-- Whether you and _other have blocked each other (either way). Only ever answers
-- for the signed-in person, so it can't be used to look up other people's blocks.
CREATE OR REPLACE FUNCTION public.is_blocked_with(_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND _other IS NOT NULL AND EXISTS (
    SELECT 1 FROM blocks
    WHERE (blocker_id = auth.uid() AND blocked_id = _other)
       OR (blocker_id = _other AND blocked_id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.block_user(_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF _target IS NULL OR _target = me THEN RAISE EXCEPTION 'You can''t block yourself' USING ERRCODE = '22023'; END IF;

  INSERT INTO blocks (blocker_id, blocked_id) VALUES (me, _target) ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
  DELETE FROM friendships
  WHERE (user_id = me AND friend_id = _target) OR (user_id = _target AND friend_id = me);
END;
$$;

REVOKE ALL ON FUNCTION public.is_blocked_with(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.block_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_with(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;

-- Seeing posts and comments
DROP POLICY IF EXISTS "Hide posts across a block" ON public.posts;
CREATE POLICY "Hide posts across a block" ON public.posts
  AS RESTRICTIVE FOR SELECT
  USING (NOT public.is_blocked_with(user_id));

DROP POLICY IF EXISTS "Hide comments across a block" ON public.comments;
CREATE POLICY "Hide comments across a block" ON public.comments
  AS RESTRICTIVE FOR SELECT
  USING (NOT public.is_blocked_with(user_id));

-- Reaching each other
DROP POLICY IF EXISTS "No messages across a block" ON public.messages;
CREATE POLICY "No messages across a block" ON public.messages
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT public.is_blocked_with(receiver_id));

DROP POLICY IF EXISTS "No friend requests across a block" ON public.friendships;
CREATE POLICY "No friend requests across a block" ON public.friendships
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT public.is_blocked_with(CASE WHEN user_id = auth.uid() THEN friend_id ELSE user_id END));

DROP POLICY IF EXISTS "No comments across a block" ON public.comments;
CREATE POLICY "No comments across a block" ON public.comments
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT public.is_blocked_with((SELECT p.user_id FROM public.posts p WHERE p.id = post_id)));

DROP POLICY IF EXISTS "No reactions across a block" ON public.reactions;
CREATE POLICY "No reactions across a block" ON public.reactions
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT public.is_blocked_with((SELECT p.user_id FROM public.posts p WHERE p.id = post_id)));

-- The feed runs with owner rights (it skips the policies above), so it checks blocks itself.
-- Same function as 20261006120000_feed_newest_first.sql, plus the block check.
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
  post_stats AS (
    SELECT
      p.id, p.content, p.image_url, p.video_url, p.created_at, p.user_id,
      pr.id AS profile_id,
      pr.full_name AS profile_full_name,
      pr.avatar_url AS profile_avatar_url,
      pr.is_verified AS profile_is_verified,
      COALESCE(r.cnt, 0) AS reaction_count,
      COALESCE(c.cnt, 0) AS comment_count,
      CASE
        WHEN _feed_filter = 'digest'
          THEN (COALESCE(r.cnt, 0) * 2 + COALESCE(c.cnt, 0) * 3)::numeric
        ELSE EXTRACT(EPOCH FROM p.created_at)::numeric
      END AS engagement_score
    FROM posts p
    JOIN profiles pr ON pr.id = p.user_id
    LEFT JOIN (SELECT post_id, COUNT(*) AS cnt FROM reactions GROUP BY post_id) r ON r.post_id = p.id
    LEFT JOIN (SELECT post_id, COUNT(*) AS cnt FROM comments GROUP BY post_id) c ON c.post_id = p.id
    WHERE (p.expires_at IS NULL OR p.expires_at > now())
      AND p.user_id NOT IN (SELECT bid FROM blocked_ids)
      AND (
        _feed_filter IN ('all', 'digest')
        OR p.user_id = _user_id
        OR p.user_id IN (SELECT fid FROM friend_ids)
      )
      AND (_feed_filter <> 'digest' OR p.created_at > now() - interval '7 days')
  )
  SELECT
    ps.id, ps.content, ps.image_url, ps.video_url, ps.created_at, ps.user_id,
    ps.profile_id, ps.profile_full_name, ps.profile_avatar_url, ps.profile_is_verified,
    ps.engagement_score, ps.reaction_count, ps.comment_count
  FROM post_stats ps
  WHERE _cursor_score IS NULL
     OR (ps.engagement_score, ps.id) < (_cursor_score, _cursor_id)
  ORDER BY ps.engagement_score DESC, ps.created_at DESC, ps.id DESC
  LIMIT _page_size;
$$;

-- Friend suggestions leave out anyone across a block.
CREATE OR REPLACE FUNCTION public.friend_suggestions(_limit integer DEFAULT 10)
RETURNS TABLE (user_id uuid, mutual_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH mine AS (
    SELECT CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END AS id
    FROM friendships f
    WHERE f.status = 'accepted' AND (f.user_id = auth.uid() OR f.friend_id = auth.uid())
  ),
  connected AS (
    SELECT CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END AS id
    FROM friendships f
    WHERE f.user_id = auth.uid() OR f.friend_id = auth.uid()
  ),
  friends_of_friends AS (
    SELECT CASE WHEN f.user_id = m.id THEN f.friend_id ELSE f.user_id END AS id, m.id AS via
    FROM friendships f
    JOIN mine m ON f.user_id = m.id OR f.friend_id = m.id
    WHERE f.status = 'accepted'
  )
  SELECT fof.id, count(DISTINCT fof.via)
  FROM friends_of_friends fof
  WHERE fof.id <> auth.uid()
    AND fof.id NOT IN (SELECT id FROM connected)
    AND NOT public.is_blocked_with(fof.id)
  GROUP BY fof.id
  ORDER BY count(DISTINCT fof.via) DESC
  LIMIT LEAST(GREATEST(_limit, 1), 50);
$$;
