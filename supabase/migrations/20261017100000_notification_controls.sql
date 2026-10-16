-- Notifications, as on Facebook: remove one from your list, or turn off notifications about a
-- post (or anything else a notification is about).

-- Remove a notification from your own list.
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- What you've turned off notifications about (a post, a reel, a group...).
CREATE TABLE IF NOT EXISTS public.notification_mutes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  related_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, related_id)
);
ALTER TABLE public.notification_mutes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their own notification mutes" ON public.notification_mutes;
CREATE POLICY "Users manage their own notification mutes"
  ON public.notification_mutes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Every notification passes here first: a muted one is never created (so it never pushes either).
CREATE OR REPLACE FUNCTION public.skip_muted_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.related_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM notification_mutes m WHERE m.user_id = NEW.user_id AND m.related_id = NEW.related_id
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS skip_muted_notification ON public.notifications;
CREATE TRIGGER skip_muted_notification
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.skip_muted_notification();
