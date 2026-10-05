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

REVOKE ALL ON FUNCTION public.profile_friend_stats(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.group_member_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_friend_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.group_member_counts(uuid[]) TO authenticated;
