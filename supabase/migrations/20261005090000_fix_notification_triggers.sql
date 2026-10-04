-- 1. The notification trigger was attached twice to comments, likes and friendships,
--    so every comment and friend request created two identical notifications.
DROP TRIGGER IF EXISTS create_notification_on_comment ON public.comments;
DROP TRIGGER IF EXISTS create_notification_on_like ON public.likes;
DROP TRIGGER IF EXISTS create_notification_on_friendship ON public.friendships;

-- 2. Posts are liked through the reactions table, which had no notification trigger,
--    so reacting to someone's post never told them. Respects their "Likes" preference.
CREATE OR REPLACE FUNCTION public.notify_on_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  owner_id UUID;
  wants_it BOOLEAN;
  actor_name TEXT;
BEGIN
  SELECT user_id INTO owner_id FROM posts WHERE id = NEW.post_id;
  IF owner_id IS NULL OR owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT np.likes INTO wants_it FROM notification_preferences np WHERE np.user_id = owner_id;
  IF NOT COALESCE(wants_it, true) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.user_id;
  INSERT INTO notifications (user_id, type, content, related_id, actor_id)
  VALUES (
    owner_id,
    'like',
    actor_name || CASE WHEN NEW.reaction_type = 'like' THEN ' liked your post' ELSE ' reacted to your post' END,
    NEW.post_id,
    NEW.user_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_reaction_created ON public.reactions;
CREATE TRIGGER on_reaction_created
  AFTER INSERT ON public.reactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_reaction();
