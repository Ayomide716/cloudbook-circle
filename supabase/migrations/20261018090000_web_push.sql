-- Push notifications that reach a locked phone or a closed app (Web Push).
--
-- Each phone or browser that allows notifications saves a subscription here. When a message,
-- group message or notification is created, the database asks the send-push function to
-- deliver it to every subscription of the person it's for. The function's address and a
-- shared secret live in private.push_config (filled in once, by hand; see docs/push-notifications.md).

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "See your own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "See your own push subscriptions" ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Save this device for the signed-in person. A device that someone else used before moves
-- over to you (the endpoint is the device), so one phone never gets two people's alerts.
CREATE OR REPLACE FUNCTION public.save_push_subscription(_endpoint TEXT, _p256dh TEXT, _auth TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF _endpoint IS NULL OR _endpoint !~ '^https://' OR length(_endpoint) > 2000 THEN
    RAISE EXCEPTION 'Invalid push endpoint';
  END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth)
  VALUES (auth.uid(), _endpoint, _p256dh, _auth)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = auth.uid(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, created_at = now();
END;
$$;

-- Forget this device (turning notifications off, or logging out).
CREATE OR REPLACE FUNCTION public.remove_push_subscription(_endpoint TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.push_subscriptions WHERE endpoint = _endpoint AND user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_push_subscription(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_push_subscription(TEXT) TO authenticated;

-- Where to send: the send-push function's URL and the secret it checks. Not reachable
-- through the API (the private schema isn't exposed).
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.push_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  function_url TEXT NOT NULL,
  secret TEXT NOT NULL
);

-- Hand one alert to send-push, if the person has a device and wants this kind of alert.
-- Never gets in the way of the message or notification itself: any problem is ignored.
CREATE OR REPLACE FUNCTION private.queue_push(_user UUID, _kind TEXT, _title TEXT, _body TEXT, _url TEXT, _tag TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  cfg private.push_config;
  prefs public.notification_preferences;
BEGIN
  SELECT * INTO cfg FROM private.push_config WHERE id = 1;
  IF cfg IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id = _user) THEN RETURN; END IF;

  SELECT * INTO prefs FROM public.notification_preferences WHERE user_id = _user;
  IF FOUND THEN
    IF NOT prefs.push_enabled
      OR (_kind = 'message' AND NOT prefs.messages)
      OR (_kind = 'like' AND NOT prefs.likes)
      OR (_kind = 'comment' AND NOT prefs.comments)
      OR (_kind = 'friend_request' AND NOT prefs.friend_requests)
      OR (_kind = 'friend_accepted' AND NOT prefs.friend_accepted)
      OR (_kind = 'share' AND NOT prefs.shares) THEN
      RETURN;
    END IF;
  END IF;

  PERFORM net.http_post(
    url := cfg.function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || cfg.secret),
    body := jsonb_build_object(
      'user_id', _user,
      'title', left(coalesce(_title, 'Ember'), 120),
      'body', left(coalesce(_body, ''), 240),
      'url', coalesce(_url, '/'),
      'tag', _tag
    )
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.queue_push(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- What a message says on the lock screen: the text, or what kind of attachment it is.
CREATE OR REPLACE FUNCTION private.message_preview(_content TEXT, _image TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(_content, '') ~ '^\[sticker\]' THEN 'Sent a sticker'
    WHEN coalesce(_content, '') <> '' THEN _content
    WHEN _image IS NOT NULL THEN 'Sent a photo'
    ELSE 'Sent a message'
  END;
$$;

-- A direct message: "Alice Johnson" / "See you at 6".
CREATE OR REPLACE FUNCTION private.push_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name TEXT;
BEGIN
  SELECT coalesce(full_name, 'Someone') INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;
  PERFORM private.queue_push(
    NEW.receiver_id, 'message', sender_name,
    private.message_preview(NEW.content, NEW.image_url),
    '/messages?user=' || NEW.sender_id, 'dm-' || NEW.sender_id
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_on_message ON public.messages;
CREATE TRIGGER push_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.push_on_message();

-- A group message, to everyone else in the group: "The Squad" / "Tunde: Who's in?".
CREATE OR REPLACE FUNCTION private.push_on_group_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_name TEXT;
  group_name TEXT;
  member UUID;
BEGIN
  SELECT split_part(coalesce(full_name, 'Someone'), ' ', 1) INTO sender_name FROM public.profiles WHERE id = NEW.user_id;
  SELECT name INTO group_name FROM public.groups WHERE id = NEW.group_id;
  FOR member IN
    SELECT user_id FROM public.group_members WHERE group_id = NEW.group_id AND user_id <> NEW.user_id
  LOOP
    PERFORM private.queue_push(
      member, 'message', coalesce(group_name, 'Group'),
      sender_name || ': ' || private.message_preview(NEW.content, NEW.image_url),
      '/messages?group=' || NEW.group_id, 'group-' || NEW.group_id
    );
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_on_group_message ON public.group_messages;
CREATE TRIGGER push_on_group_message
  AFTER INSERT ON public.group_messages
  FOR EACH ROW EXECUTE FUNCTION private.push_on_group_message();

-- Everything in the Notifications tab: likes, comments, friend requests, group invites...
CREATE OR REPLACE FUNCTION private.push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link TEXT;
BEGIN
  link := CASE
    WHEN NEW.type IN ('like', 'comment', 'share') AND NEW.related_id IS NOT NULL THEN '/post/' || NEW.related_id
    WHEN NEW.type IN ('friend_request', 'friend_accepted') THEN '/friends'
    WHEN NEW.type IN ('group_added', 'group_invite') THEN '/groups'
    ELSE '/notifications'
  END;
  PERFORM private.queue_push(NEW.user_id, NEW.type, 'Ember', NEW.content, link, 'n-' || NEW.type || '-' || coalesce(NEW.related_id::text, NEW.id::text));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_on_notification ON public.notifications;
CREATE TRIGGER push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION private.push_on_notification();
