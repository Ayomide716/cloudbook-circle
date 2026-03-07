
-- Create notification preferences table
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  likes boolean NOT NULL DEFAULT true,
  comments boolean NOT NULL DEFAULT true,
  friend_requests boolean NOT NULL DEFAULT true,
  friend_accepted boolean NOT NULL DEFAULT true,
  messages boolean NOT NULL DEFAULT true,
  shares boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own preferences"
ON public.notification_preferences FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
ON public.notification_preferences FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
ON public.notification_preferences FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Update the create_notification function to check preferences
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
  pref_enabled BOOLEAN;
BEGIN
  -- Handle likes
  IF TG_TABLE_NAME = 'likes' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO notification_user_id FROM posts WHERE id = NEW.post_id;
    actor_uuid := NEW.user_id;
    IF notification_user_id != NEW.user_id THEN
      -- Check preference
      SELECT COALESCE(np.likes, true) INTO pref_enabled
      FROM notification_preferences np WHERE np.user_id = notification_user_id;
      IF COALESCE(pref_enabled, true) THEN
        SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.user_id;
        notification_content := actor_name || ' liked your post';
        notification_type := 'like';
        INSERT INTO notifications (user_id, type, content, related_id, actor_id)
        VALUES (notification_user_id, notification_type, notification_content, NEW.post_id, actor_uuid);
      END IF;
    END IF;
  END IF;

  -- Handle comments
  IF TG_TABLE_NAME = 'comments' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO notification_user_id FROM posts WHERE id = NEW.post_id;
    actor_uuid := NEW.user_id;
    IF notification_user_id != NEW.user_id THEN
      SELECT COALESCE(np.comments, true) INTO pref_enabled
      FROM notification_preferences np WHERE np.user_id = notification_user_id;
      IF COALESCE(pref_enabled, true) THEN
        SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.user_id;
        notification_content := actor_name || ' commented on your post';
        notification_type := 'comment';
        INSERT INTO notifications (user_id, type, content, related_id, actor_id)
        VALUES (notification_user_id, notification_type, notification_content, NEW.post_id, actor_uuid);
      END IF;
    END IF;
  END IF;

  -- Handle friend requests
  IF TG_TABLE_NAME = 'friendships' THEN
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
      actor_uuid := NEW.user_id;
      SELECT COALESCE(np.friend_requests, true) INTO pref_enabled
      FROM notification_preferences np WHERE np.user_id = NEW.friend_id;
      IF COALESCE(pref_enabled, true) THEN
        SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.user_id;
        notification_content := actor_name || ' sent you a friend request';
        notification_type := 'friend_request';
        INSERT INTO notifications (user_id, type, content, related_id, actor_id)
        VALUES (NEW.friend_id, notification_type, notification_content, NEW.id, actor_uuid);
      END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status = 'pending' THEN
      actor_uuid := NEW.friend_id;
      SELECT COALESCE(np.friend_accepted, true) INTO pref_enabled
      FROM notification_preferences np WHERE np.user_id = NEW.user_id;
      IF COALESCE(pref_enabled, true) THEN
        SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.friend_id;
        notification_content := actor_name || ' accepted your friend request';
        notification_type := 'friend_accepted';
        INSERT INTO notifications (user_id, type, content, related_id, actor_id)
        VALUES (NEW.user_id, notification_type, notification_content, NEW.id, actor_uuid);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
