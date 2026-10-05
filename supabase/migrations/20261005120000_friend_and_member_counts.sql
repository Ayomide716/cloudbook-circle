-- Friendships and group memberships are only visible to the people in them, so a
-- profile showed "0 friends" to everyone else, mutual friends never appeared, and
-- groups showed "0 members" to non-members. These functions return just the counts
-- (and which of *your* friends you share), never anyone's full friend list.

CREATE OR REPLACE FUNCTION public.profile_friend_stats(_user_id uuid)
RETURNS TABLE (friend_count bigint, mutual_ids uuid[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH theirs AS (
    SELECT CASE WHEN f.user_id = _user_id THEN f.friend_id ELSE f.user_id END AS id
    FROM friendships f
    WHERE f.status = 'accepted' AND (f.user_id = _user_id OR f.friend_id = _user_id)
  ),
  mine AS (
    SELECT CASE WHEN f.user_id = auth.uid() THEN f.friend_id ELSE f.user_id END AS id
    FROM friendships f
    WHERE f.status = 'accepted' AND (f.user_id = auth.uid() OR f.friend_id = auth.uid())
  )
  SELECT
    (SELECT count(*) FROM theirs),
    CASE WHEN auth.uid() = _user_id THEN ARRAY[]::uuid[]
         ELSE ARRAY(SELECT id FROM theirs INTERSECT SELECT id FROM mine) END;
$$;

CREATE OR REPLACE FUNCTION public.group_member_counts(_group_ids uuid[])
RETURNS TABLE (group_id uuid, member_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT gm.group_id, count(*)
  FROM group_members gm
  WHERE gm.group_id = ANY(_group_ids)
  GROUP BY gm.group_id;
$$;

-- "People you may know": friends of your friends you aren't connected to yet,
-- ranked by how many friends you share. Returns ids and counts only.
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
  WHERE fof.id <> auth.uid() AND fof.id NOT IN (SELECT id FROM connected)
  GROUP BY fof.id
  ORDER BY count(DISTINCT fof.via) DESC
  LIMIT LEAST(GREATEST(_limit, 1), 50);
$$;

REVOKE ALL ON FUNCTION public.friend_suggestions(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.friend_suggestions(integer) TO authenticated;

REVOKE ALL ON FUNCTION public.profile_friend_stats(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.group_member_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_friend_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.group_member_counts(uuid[]) TO authenticated;
