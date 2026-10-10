-- Replies on Reels comments, and adding / removing people in groups.

-- Reels: a reply points at the comment it answers (threads are one level deep, as on
-- Instagram; replies to replies point at the same top comment).
ALTER TABLE public.reel_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.reel_comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS reel_comments_parent_id_idx ON public.reel_comments (parent_id);

-- "Alice added you to Lagos Developers"
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['like','comment','friend_request','friend_accepted','message','verification','group_added']));

-- Members add their friends; admins remove people and choose admins. The group's creator
-- can't be removed or demoted, and only the creator can remove or demote other admins.
-- These run with owner rights (members can't write other people's rows directly), so each
-- checks who is asking.

CREATE OR REPLACE FUNCTION public.add_group_member(_group uuid, _user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_name text;
  group_name text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF _user IS NULL OR _user = me THEN RAISE EXCEPTION 'Choose someone else to add' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = _group AND user_id = me) THEN
    RAISE EXCEPTION 'Only members of this group can add people' USING ERRCODE = '42501';
  END IF;
  -- Friends only, so groups can't be used to pull in strangers.
  IF NOT EXISTS (
    SELECT 1 FROM friendships f
    WHERE f.status = 'accepted'
      AND ((f.user_id = me AND f.friend_id = _user) OR (f.user_id = _user AND f.friend_id = me))
  ) THEN
    RAISE EXCEPTION 'You can only add your friends' USING ERRCODE = '42501';
  END IF;

  INSERT INTO group_members (group_id, user_id, role)
  VALUES (_group, _user, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  IF FOUND THEN
    SELECT full_name INTO my_name FROM profiles WHERE id = me;
    SELECT name INTO group_name FROM groups WHERE id = _group;
    INSERT INTO notifications (user_id, type, content, related_id, actor_id)
    VALUES (_user, 'group_added', COALESCE(my_name, 'Someone') || ' added you to ' || COALESCE(group_name, 'a group'), _group, me);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_group_member(_group uuid, _user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  creator uuid;
  target_role text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT created_by INTO creator FROM groups WHERE id = _group;
  IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = _group AND user_id = me AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can remove people' USING ERRCODE = '42501';
  END IF;
  IF _user = creator THEN RAISE EXCEPTION 'The group''s creator can''t be removed' USING ERRCODE = '42501'; END IF;
  SELECT role INTO target_role FROM group_members WHERE group_id = _group AND user_id = _user;
  IF target_role = 'admin' AND me IS DISTINCT FROM creator THEN
    RAISE EXCEPTION 'Only the group''s creator can remove an admin' USING ERRCODE = '42501';
  END IF;
  DELETE FROM group_members WHERE group_id = _group AND user_id = _user;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_group_member_role(_group uuid, _user uuid, _role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  creator uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF _role NOT IN ('admin', 'member') THEN RAISE EXCEPTION 'Unknown role' USING ERRCODE = '22023'; END IF;
  SELECT created_by INTO creator FROM groups WHERE id = _group;
  IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = _group AND user_id = me AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can change roles' USING ERRCODE = '42501';
  END IF;
  IF _role = 'member' AND (_user = creator OR me IS DISTINCT FROM creator) THEN
    RAISE EXCEPTION 'Only the group''s creator can remove an admin' USING ERRCODE = '42501';
  END IF;
  UPDATE group_members SET role = _role WHERE group_id = _group AND user_id = _user;
END;
$$;

REVOKE ALL ON FUNCTION public.add_group_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_group_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_group_member_role(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_group_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_group_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_member_role(uuid, uuid, text) TO authenticated;
