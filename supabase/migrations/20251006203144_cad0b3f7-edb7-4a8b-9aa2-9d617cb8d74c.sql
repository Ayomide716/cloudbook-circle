-- Fix the create_notification function to handle different table structures
CREATE OR REPLACE FUNCTION public.create_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  notification_user_id UUID;
  notification_content TEXT;
  notification_type TEXT;
BEGIN
  -- Handle likes
  IF TG_TABLE_NAME = 'likes' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO notification_user_id FROM posts WHERE id = NEW.post_id;
    IF notification_user_id != NEW.user_id THEN
      notification_content := 'liked your post';
      notification_type := 'like';
      INSERT INTO notifications (user_id, type, content, related_id)
      VALUES (notification_user_id, notification_type, notification_content, NEW.post_id);
    END IF;
  END IF;

  -- Handle comments
  IF TG_TABLE_NAME = 'comments' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO notification_user_id FROM posts WHERE id = NEW.post_id;
    IF notification_user_id != NEW.user_id THEN
      notification_content := 'commented on your post';
      notification_type := 'comment';
      INSERT INTO notifications (user_id, type, content, related_id)
      VALUES (notification_user_id, notification_type, notification_content, NEW.post_id);
    END IF;
  END IF;

  -- Handle friend requests - only for friendships table
  IF TG_TABLE_NAME = 'friendships' THEN
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
      notification_content := 'sent you a friend request';
      notification_type := 'friend_request';
      INSERT INTO notifications (user_id, type, content, related_id)
      VALUES (NEW.friend_id, notification_type, notification_content, NEW.id);
    END IF;

    -- Handle friend acceptance - only for friendships table
    IF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status = 'pending' THEN
      notification_content := 'accepted your friend request';
      notification_type := 'friend_accepted';
      INSERT INTO notifications (user_id, type, content, related_id)
      VALUES (NEW.user_id, notification_type, notification_content, NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Recreate triggers to ensure they're properly attached
DROP TRIGGER IF EXISTS create_notification_on_like ON public.likes;
DROP TRIGGER IF EXISTS create_notification_on_comment ON public.comments;
DROP TRIGGER IF EXISTS create_notification_on_friendship ON public.friendships;

CREATE TRIGGER create_notification_on_like
AFTER INSERT ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.create_notification();

CREATE TRIGGER create_notification_on_comment
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.create_notification();

CREATE TRIGGER create_notification_on_friendship
AFTER INSERT OR UPDATE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.create_notification();