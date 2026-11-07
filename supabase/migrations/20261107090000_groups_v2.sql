-- Groups, Facebook style: a category to browse by, private groups you ask to join (admins
-- approve), pinned posts, muting members, and admins deleting posts.

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_category_check;
ALTER TABLE public.groups ADD CONSTRAINT groups_category_check
  CHECK (category IS NULL OR category IN ('church', 'school', 'estate', 'hobbies', 'business', 'sports', 'family', 'other'));

ALTER TABLE public.group_posts ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS muted_until timestamptz;

CREATE OR REPLACE FUNCTION public.is_group_admin(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _user_id AND role = 'admin'
  )
$$;
REVOKE ALL ON FUNCTION public.is_group_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_group_admin(uuid, uuid) TO authenticated;

-- Joining: anyone can join a public group; a private group only through an approved request
-- (approve_group_request) or an invite. The creator may still add themselves as admin.
DROP POLICY IF EXISTS "Users can join groups" ON public.group_members;
CREATE POLICY "Users can join groups"
ON public.group_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    (
      role = 'member'
      AND NOT EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.is_private)
    )
    OR (
      role = 'admin'
      AND EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.created_by = auth.uid())
    )
  )
);

-- Requests to join a private group.
CREATE TABLE IF NOT EXISTS public.group_join_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "See your own requests, or a group's as its admin" ON public.group_join_requests;
CREATE POLICY "See your own requests, or a group's as its admin" ON public.group_join_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_group_admin(auth.uid(), group_id));

DROP POLICY IF EXISTS "Ask to join a private group" ON public.group_join_requests;
CREATE POLICY "Ask to join a private group" ON public.group_join_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.is_private)
    AND NOT public.is_group_member(auth.uid(), group_id)
  );

DROP POLICY IF EXISTS "Cancel your request, or decline one as admin" ON public.group_join_requests;
CREATE POLICY "Cancel your request, or decline one as admin" ON public.group_join_requests
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_group_admin(auth.uid(), group_id));

CREATE OR REPLACE FUNCTION public.approve_group_request(_request uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req record;
  group_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT * INTO req FROM group_join_requests WHERE id = _request;
  IF NOT FOUND THEN RAISE EXCEPTION 'That request no longer exists' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_group_admin(auth.uid(), req.group_id) THEN
    RAISE EXCEPTION 'Only admins can approve requests' USING ERRCODE = '42501';
  END IF;
  INSERT INTO group_members (group_id, user_id, role) VALUES (req.group_id, req.user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;
  DELETE FROM group_join_requests WHERE id = _request;
  SELECT name INTO group_name FROM groups WHERE id = req.group_id;
  INSERT INTO notifications (user_id, type, content, related_id, actor_id)
  VALUES (req.user_id, 'group_added', 'You can now see ' || COALESCE(group_name, 'the group') || ': your request to join was approved', req.group_id, auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.approve_group_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_group_request(uuid) TO authenticated;

-- Posts: pinned ones (admins), muted members can't post, authors and admins can delete.
CREATE OR REPLACE FUNCTION public.set_group_post_pinned(_post uuid, _pinned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid uuid;
BEGIN
  SELECT group_id INTO gid FROM group_posts WHERE id = _post;
  IF gid IS NULL THEN RAISE EXCEPTION 'That post no longer exists' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_group_admin(auth.uid(), gid) THEN
    RAISE EXCEPTION 'Only admins can pin posts' USING ERRCODE = '42501';
  END IF;
  UPDATE group_posts SET pinned_at = CASE WHEN _pinned THEN now() ELSE NULL END WHERE id = _post;
END;
$$;
REVOKE ALL ON FUNCTION public.set_group_post_pinned(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_group_post_pinned(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.mute_group_member(_group uuid, _user uuid, _until timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator uuid;
BEGIN
  IF NOT public.is_group_admin(auth.uid(), _group) THEN
    RAISE EXCEPTION 'Only admins can mute people' USING ERRCODE = '42501';
  END IF;
  SELECT created_by INTO creator FROM groups WHERE id = _group;
  IF _user = creator OR public.is_group_admin(_user, _group) THEN
    RAISE EXCEPTION 'Admins can''t be muted' USING ERRCODE = '42501';
  END IF;
  UPDATE group_members SET muted_until = _until WHERE group_id = _group AND user_id = _user;
END;
$$;
REVOKE ALL ON FUNCTION public.mute_group_member(uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mute_group_member(uuid, uuid, timestamptz) TO authenticated;

DROP POLICY IF EXISTS "Group members can create posts" ON public.group_posts;
CREATE POLICY "Group members can create posts"
ON public.group_posts
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND public.is_group_member(auth.uid(), group_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.group_members m
    WHERE m.group_id = group_posts.group_id AND m.user_id = auth.uid() AND m.muted_until > now()
  )
);

DROP POLICY IF EXISTS "Authors and admins delete group posts" ON public.group_posts;
CREATE POLICY "Authors and admins delete group posts"
ON public.group_posts
FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.is_group_admin(auth.uid(), group_id));

-- A few member faces for a group page you haven't joined (public groups only; members see
-- everyone through group_members).
CREATE OR REPLACE FUNCTION public.group_member_preview(_group uuid, _limit integer DEFAULT 6)
RETURNS TABLE (user_id uuid, full_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url
  FROM group_members gm
  JOIN profiles p ON p.id = gm.user_id
  JOIN groups g ON g.id = gm.group_id
  WHERE gm.group_id = _group
    AND (NOT g.is_private OR public.is_group_member(auth.uid(), _group))
  ORDER BY (gm.role = 'admin') DESC, gm.joined_at
  LIMIT LEAST(GREATEST(_limit, 1), 12);
$$;
REVOKE ALL ON FUNCTION public.group_member_preview(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_member_preview(uuid, integer) TO authenticated;

CREATE INDEX IF NOT EXISTS group_posts_group_created_idx ON public.group_posts (group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS group_join_requests_group_idx ON public.group_join_requests (group_id);

-- Admins change a group's category and who can see it (Edit group).
CREATE OR REPLACE FUNCTION public.set_group_settings(_group uuid, _category text, _is_private boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_group_admin(auth.uid(), _group)
     AND NOT EXISTS (SELECT 1 FROM groups g WHERE g.id = _group AND g.created_by = auth.uid()) THEN
    RAISE EXCEPTION 'Only group admins can change the group''s settings' USING ERRCODE = '42501';
  END IF;
  UPDATE groups SET category = _category, is_private = _is_private WHERE id = _group;
END;
$$;
REVOKE ALL ON FUNCTION public.set_group_settings(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_group_settings(uuid, text, boolean) TO authenticated;
