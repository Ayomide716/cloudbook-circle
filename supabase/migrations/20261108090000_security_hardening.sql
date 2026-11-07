-- Security review, November 2026. Fixes found by reading every table's access rules:
--   1. Signed-out visitors (the public "anon" key in the app) could read every post, comment,
--      story and online status. Every page needs you signed in, so anon gets nothing.
--   2. Anyone could give themselves the verified tick by editing their own profile.
--   3. Whoever received a message could rewrite it (its words, or who it's from); only marking
--      it read or delivered was meant.
--   4. Whoever sent a friend request could accept it themselves.
--   5. Online status was visible to everyone, not just friends.
--   6. Tips (who tipped whom, how much, the note) were readable by anyone.

-- 1. Nothing for signed-out visitors. Sign-up and sign-in go through Supabase Auth, not these
--    tables; server functions use the service role.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- People using the app run as "authenticated"; the server's own functions (SECURITY DEFINER)
-- and the dashboard run as their owner, so the guards below only hold back people.
CREATE OR REPLACE FUNCTION public.acting_as_user()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$ SELECT current_user IN ('authenticated', 'anon') $$;

-- 2. The verified tick comes from the server (100 friends) or an admin, never from yourself.
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.acting_as_user()
     AND NEW.is_verified IS DISTINCT FROM OLD.is_verified
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.is_verified := OLD.is_verified;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_profile_update ON public.profiles;
CREATE TRIGGER guard_profile_update BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

-- 3. The sender may edit or unsend; the receiver may only mark it read or delivered.
--    Nobody changes who it's between or when it was sent.
CREATE OR REPLACE FUNCTION public.guard_message_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.acting_as_user() THEN RETURN NEW; END IF;
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'A message''s sender, receiver and time can''t be changed' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS DISTINCT FROM OLD.sender_id
     AND (NEW.content IS DISTINCT FROM OLD.content
          OR NEW.image_url IS DISTINCT FROM OLD.image_url
          OR NEW.edited IS DISTINCT FROM OLD.edited
          OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
          OR NEW.reply_to IS DISTINCT FROM OLD.reply_to
          OR NEW.forwarded IS DISTINCT FROM OLD.forwarded
          OR NEW.expires_at IS DISTINCT FROM OLD.expires_at) THEN
    RAISE EXCEPTION 'Only the sender can change a message' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS DISTINCT FROM OLD.receiver_id
     AND (NEW.read IS DISTINCT FROM OLD.read OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at) THEN
    RAISE EXCEPTION 'Only the receiver can mark a message read' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_message_update ON public.messages;
CREATE TRIGGER guard_message_update BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_message_update();

-- 4. Only the person who was asked can accept a friend request, and nobody swaps the people.
CREATE OR REPLACE FUNCTION public.guard_friendship_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.acting_as_user() THEN RETURN NEW; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.friend_id IS DISTINCT FROM OLD.friend_id THEN
    RAISE EXCEPTION 'A friendship''s people can''t be changed' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND auth.uid() IS DISTINCT FROM OLD.friend_id THEN
    RAISE EXCEPTION 'Only the person you asked can accept your request' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_friendship_update ON public.friendships;
CREATE TRIGGER guard_friendship_update BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.guard_friendship_update();

-- 5. Online status: yours, and your friends'.
CREATE OR REPLACE FUNCTION public.is_friend_of(_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
      AND ((user_id = auth.uid() AND friend_id = _other) OR (user_id = _other AND friend_id = auth.uid()))
  );
$$;
REVOKE ALL ON FUNCTION public.is_friend_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_friend_of(uuid) TO authenticated;

DROP POLICY IF EXISTS "Anyone can view user status" ON public.user_status;
DROP POLICY IF EXISTS "You and your friends see your status" ON public.user_status;
CREATE POLICY "You and your friends see your status" ON public.user_status
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_friend_of(user_id));

-- 6. Tips: only the two people involved.
DROP POLICY IF EXISTS "Anyone can view tips" ON public.post_tips;
DROP POLICY IF EXISTS "Tippers see the tips they gave" ON public.post_tips;
CREATE POLICY "Tippers see the tips they gave" ON public.post_tips
  FOR SELECT TO authenticated
  USING (auth.uid() = tipper_id);
