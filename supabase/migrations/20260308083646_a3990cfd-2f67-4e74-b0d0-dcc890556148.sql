
-- Create a trigger to notify users when they get verified
CREATE OR REPLACE FUNCTION public.notify_user_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when is_verified changes from false to true
  IF NEW.is_verified = true AND OLD.is_verified = false THEN
    INSERT INTO notifications (user_id, type, content, actor_id)
    VALUES (NEW.id, 'verification', '🎉 Congratulations! Your account has been verified. You now have a verified badge on your profile.', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_verified
  AFTER UPDATE OF is_verified ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_user_verified();
