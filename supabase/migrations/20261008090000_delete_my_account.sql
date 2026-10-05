-- "Delete my account", as the Terms and Privacy Policy promise.
-- Signed-in users can delete only themselves. Deleting the auth user removes
-- their profile, posts, comments, messages, friendships and the rest through
-- ON DELETE CASCADE. A few tables store the user's id without a foreign key,
-- so they are cleared here first.
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.story_views WHERE viewer_id = _me;
  DELETE FROM public.post_tips WHERE tipper_id = _me OR receiver_id = _me;
  DELETE FROM public.voice_room_participants WHERE user_id = _me;
  DELETE FROM public.voice_rooms WHERE created_by = _me;
  DELETE FROM public.creator_subscriptions WHERE subscriber_id = _me OR creator_id = _me;
  DELETE FROM public.creator_tiers WHERE creator_id = _me;

  DELETE FROM auth.users WHERE id = _me;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
