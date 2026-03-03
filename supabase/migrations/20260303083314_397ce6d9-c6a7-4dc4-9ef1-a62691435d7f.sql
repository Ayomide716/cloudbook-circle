-- Add actor_id column to notifications table
ALTER TABLE public.notifications ADD COLUMN actor_id uuid REFERENCES public.profiles(id);

-- Update the create_notification function to include actor_id and actor name in content
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
  actor_name TEXT;
  actor_uuid UUID;
BEGIN
  -- Handle likes
  IF TG_TABLE_NAME = 'likes' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO notification_user_id FROM posts WHERE id = NEW.post_id;
    actor_uuid := NEW.user_id;
    IF notification_user_id != NEW.user_id THEN
      SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.user_id;
      notification_content := actor_name || ' liked your post';
      notification_type := 'like';
      INSERT INTO notifications (user_id, type, content, related_id, actor_id)
      VALUES (notification_user_id, notification_type, notification_content, NEW.post_id, actor_uuid);
    END IF;
  END IF;

  -- Handle comments
  IF TG_TABLE_NAME = 'comments' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO notification_user_id FROM posts WHERE id = NEW.post_id;
    actor_uuid := NEW.user_id;
    IF notification_user_id != NEW.user_id THEN
      SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.user_id;
      notification_content := actor_name || ' commented on your post';
      notification_type := 'comment';
      INSERT INTO notifications (user_id, type, content, related_id, actor_id)
      VALUES (notification_user_id, notification_type, notification_content, NEW.post_id, actor_uuid);
    END IF;
  END IF;

  -- Handle friend requests
  IF TG_TABLE_NAME = 'friendships' THEN
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
      actor_uuid := NEW.user_id;
      SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.user_id;
      notification_content := actor_name || ' sent you a friend request';
      notification_type := 'friend_request';
      INSERT INTO notifications (user_id, type, content, related_id, actor_id)
      VALUES (NEW.friend_id, notification_type, notification_content, NEW.id, actor_uuid);
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status = 'pending' THEN
      actor_uuid := NEW.friend_id;
      SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.friend_id;
      notification_content := actor_name || ' accepted your friend request';
      notification_type := 'friend_accepted';
      INSERT INTO notifications (user_id, type, content, related_id, actor_id)
      VALUES (NEW.user_id, notification_type, notification_content, NEW.id, actor_uuid);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;