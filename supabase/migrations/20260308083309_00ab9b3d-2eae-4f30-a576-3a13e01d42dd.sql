
-- Add verified column to profiles
ALTER TABLE public.profiles ADD COLUMN is_verified boolean NOT NULL DEFAULT false;

-- Function to check and auto-verify users with 100+ friends
CREATE OR REPLACE FUNCTION public.check_verification_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _friend_count integer;
BEGIN
  -- Only process accepted friendships
  IF NEW.status != 'accepted' THEN
    RETURN NEW;
  END IF;

  -- Check both users in the friendship
  FOR _user_id IN SELECT unnest(ARRAY[NEW.user_id, NEW.friend_id])
  LOOP
    -- Count accepted friendships
    SELECT COUNT(*) INTO _friend_count
    FROM friendships
    WHERE (user_id = _user_id OR friend_id = _user_id)
      AND status = 'accepted';

    -- Auto-verify if 100+ friends and not already verified
    IF _friend_count >= 100 THEN
      UPDATE profiles SET is_verified = true WHERE id = _user_id AND is_verified = false;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger on friendship status changes
CREATE TRIGGER on_friendship_check_verification
  AFTER INSERT OR UPDATE OF status ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.check_verification_eligibility();
