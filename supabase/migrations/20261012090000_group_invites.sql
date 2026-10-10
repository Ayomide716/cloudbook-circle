-- Group invites, as on WhatsApp: adding someone to a group sends them an invite, and they're
-- only in the group once they accept it.

CREATE TABLE IF NOT EXISTS public.group_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_invites_user_idx ON public.group_invites (user_id);

ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

-- You see invites sent to you and the ones you sent. Changes only happen through the
-- functions below.
DROP POLICY IF EXISTS "See your group invites" ON public.group_invites;
CREATE POLICY "See your group invites" ON public.group_invites
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR invited_by = auth.uid());

-- "Alice invited you to join Lagos Developers"
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['like','comment','friend_request','friend_accepted','message','verification','group_added','group_invite']));

-- Adding a friend now invites them (same name as before, so nothing else changes).
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
  IF NOT EXISTS (
    SELECT 1 FROM friendships f
    WHERE f.status = 'accepted'
      AND ((f.user_id = me AND f.friend_id = _user) OR (f.user_id = _user AND f.friend_id = me))
  ) THEN
    RAISE EXCEPTION 'You can only add your friends' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM group_members WHERE group_id = _group AND user_id = _user) THEN
    RAISE EXCEPTION 'They''re already in this group' USING ERRCODE = '23505';
  END IF;

  INSERT INTO group_invites (group_id, user_id, invited_by)
  VALUES (_group, _user, me)
  ON CONFLICT (group_id, user_id) DO NOTHING;

  IF FOUND THEN
    SELECT full_name INTO my_name FROM profiles WHERE id = me;
    SELECT name INTO group_name FROM groups WHERE id = _group;
    INSERT INTO notifications (user_id, type, content, related_id, actor_id)
    VALUES (_user, 'group_invite', COALESCE(my_name, 'Someone') || ' invited you to join ' || COALESCE(group_name, 'a group'), _group, me);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_group_invite(_group uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  DELETE FROM group_invites WHERE group_id = _group AND user_id = me;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invite is no longer available' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (_group, me, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_group_invite(_group uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM group_invites WHERE group_id = _group AND user_id = auth.uid();
$$;

-- An invite stops mattering once you're in the group.
CREATE OR REPLACE FUNCTION public.clear_group_invite_on_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM group_invites WHERE group_id = NEW.group_id AND user_id = NEW.user_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS clear_group_invite_on_join ON public.group_members;
CREATE TRIGGER clear_group_invite_on_join
  AFTER INSERT ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.clear_group_invite_on_join();

REVOKE ALL ON FUNCTION public.accept_group_invite(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_group_invite(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_group_invite_on_join() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_group_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_group_invite(uuid) TO authenticated;

-- So the invite list updates live.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_invites;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;
