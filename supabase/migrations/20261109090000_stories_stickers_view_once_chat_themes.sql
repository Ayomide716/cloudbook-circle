-- November 2026, part 2: story stickers (polls you can vote on, mentions, a post shared to a
-- story), view-once photos in chats, and chat themes both people see.

-- ── Story stickers ─────────────────────────────────────────────────────────────────────────
-- What's drawn on a story (text, drawing, time, place) is part of its picture. What you can
-- tap is kept here: a poll, people mentioned, or the post it shares. For example:
--   {"poll": {"question": "Jollof or fried rice?", "options": ["Jollof", "Fried rice"], "x": 0.5, "y": 0.7},
--    "mentions": [{"id": "<uuid>", "name": "Ada", "x": 0.3, "y": 0.4}],
--    "post_id": "<uuid>"}
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS overlay jsonb;

CREATE TABLE IF NOT EXISTS public.story_poll_votes (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option smallint NOT NULL CHECK (option BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, user_id)
);
ALTER TABLE public.story_poll_votes ENABLE ROW LEVEL SECURITY;

-- You vote on stories you can see (the stories policies decide that), once, as yourself.
DROP POLICY IF EXISTS "Vote on story polls you can see" ON public.story_poll_votes;
CREATE POLICY "Vote on story polls you can see" ON public.story_poll_votes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id));
-- The story's owner sees every vote; others see their own.
DROP POLICY IF EXISTS "See story poll votes" ON public.story_poll_votes;
CREATE POLICY "See story poll votes" ON public.story_poll_votes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.user_id = auth.uid()));

-- The results for everyone who voted: counts only, never who.
CREATE OR REPLACE FUNCTION public.story_poll_results(_story uuid)
RETURNS TABLE (option smallint, votes bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.option, count(*)
  FROM story_poll_votes v
  WHERE v.story_id = _story
    AND EXISTS (SELECT 1 FROM story_poll_votes mine WHERE mine.story_id = _story AND mine.user_id = auth.uid()
                UNION ALL SELECT 1 FROM stories s WHERE s.id = _story AND s.user_id = auth.uid())
  GROUP BY v.option;
$$;
REVOKE ALL ON FUNCTION public.story_poll_results(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.story_poll_results(uuid) TO authenticated;

-- A new kind of notification: mentioned in a story.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'like', 'comment', 'friend_request', 'friend_accepted', 'message', 'verification', 'group_added',
  'group_invite', 'tag', 'usage_alert', 'mention', 'event_reminder', 'story_mention'
]));

-- People mentioned in a story are told (at most 10, never yourself, never across a block).
CREATE OR REPLACE FUNCTION public.notify_story_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mentioned uuid;
  author_name text;
BEGIN
  IF NEW.overlay IS NULL OR jsonb_typeof(NEW.overlay -> 'mentions') <> 'array' THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name, 'Someone') INTO author_name FROM profiles WHERE id = NEW.user_id;
  FOR mentioned IN
    SELECT DISTINCT (m ->> 'id')::uuid FROM jsonb_array_elements(NEW.overlay -> 'mentions') AS m
    WHERE (m ->> 'id') ~ '^[0-9a-fA-F-]{36}$'
    LIMIT 10
  LOOP
    CONTINUE WHEN mentioned = NEW.user_id;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE id = mentioned);
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM blocks
      WHERE (blocker_id = mentioned AND blocked_id = NEW.user_id) OR (blocker_id = NEW.user_id AND blocked_id = mentioned)
    );
    INSERT INTO notifications (user_id, type, content, related_id, actor_id)
    VALUES (mentioned, 'story_mention', author_name || ' mentioned you in their story', NEW.id, NEW.user_id);
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- a mention must never stop the story itself
END;
$$;
DROP TRIGGER IF EXISTS notify_story_mentions ON public.stories;
CREATE TRIGGER notify_story_mentions AFTER INSERT ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.notify_story_mentions();

-- ── View-once photos in chats ──────────────────────────────────────────────────────────────
-- The message itself has no picture (image_url stays empty); the picture's address is kept
-- here, where nobody can read it. The receiver opens it once through open_view_once, which
-- hands it over and forgets it.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS view_once boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS view_once_opened_at timestamptz;

CREATE TABLE IF NOT EXISTS public.view_once_media (
  message_id uuid PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.view_once_media ENABLE ROW LEVEL SECURITY;
-- Only the sender adds it, to their own view-once message. Nobody can read it (no SELECT policy).
DROP POLICY IF EXISTS "Senders add view-once media" ON public.view_once_media;
CREATE POLICY "Senders add view-once media" ON public.view_once_media
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND m.sender_id = auth.uid() AND m.view_once));

CREATE OR REPLACE FUNCTION public.open_view_once(_message uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM messages WHERE id = _message AND receiver_id = auth.uid() AND view_once AND view_once_opened_at IS NULL) THEN
    RETURN NULL;
  END IF;
  DELETE FROM view_once_media WHERE message_id = _message RETURNING url INTO link;
  UPDATE messages SET view_once_opened_at = now() WHERE id = _message;
  RETURN link;
END;
$$;
REVOKE ALL ON FUNCTION public.open_view_once(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_view_once(uuid) TO authenticated;

-- A view-once photo's push says so (the message has no text or picture of its own).
CREATE OR REPLACE FUNCTION private.message_preview(_content TEXT, _image TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(_content, '') ~ '^\[sticker\]' THEN 'Sent a sticker'
    WHEN coalesce(_content, '') = '[view-once]' THEN 'Sent a view-once photo'
    WHEN coalesce(_content, '') <> '' THEN _content
    WHEN _image IS NOT NULL THEN 'Sent a photo'
    ELSE 'Sent a message'
  END;
$$;

-- ── Chat themes ────────────────────────────────────────────────────────────────────────────
-- One theme per chat, the same for both people (as on Messenger). user_a is the smaller id.
CREATE TABLE IF NOT EXISTS public.chat_themes (
  user_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text NOT NULL CHECK (theme ~ '^[a-z0-9-]{1,32}$'),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);
ALTER TABLE public.chat_themes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Both people in a chat see and set its theme" ON public.chat_themes;
CREATE POLICY "Both people in a chat see and set its theme" ON public.chat_themes
  FOR ALL TO authenticated
  USING (auth.uid() IN (user_a, user_b))
  WITH CHECK (auth.uid() IN (user_a, user_b) AND updated_by = auth.uid() AND NOT public.is_blocked_with(CASE WHEN auth.uid() = user_a THEN user_b ELSE user_a END));

-- Live updates when the other person changes the theme.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_themes;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- Push links for the new kind of notification.
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
    WHEN NEW.type IN ('like', 'comment', 'share', 'mention') AND NEW.related_id IS NOT NULL THEN '/post/' || NEW.related_id
    WHEN NEW.type = 'story_mention' THEN '/'
    WHEN NEW.type IN ('friend_request', 'friend_accepted') THEN '/friends'
    WHEN NEW.type IN ('group_added', 'group_invite') THEN '/groups'
    WHEN NEW.type = 'event_reminder' THEN '/events'
    WHEN NEW.type = 'usage_alert' THEN '/admin'
    ELSE '/notifications'
  END;
  PERFORM private.queue_push(NEW.user_id, NEW.type, 'Ember', NEW.content, link, 'n-' || NEW.type || '-' || coalesce(NEW.related_id::text, NEW.id::text));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
