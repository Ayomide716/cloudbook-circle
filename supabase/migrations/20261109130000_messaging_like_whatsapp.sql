-- Messages like WhatsApp, part 2: pinned messages, message info (when it was read), documents,
-- polls and events in chats, delete for me, reply privately (a quote from a group), @mentions
-- in group chats, and two privacy settings: hide last seen, and read receipts.
-- Safe to run more than once.

-- ── Message info: when it was read ─────────────────────────────────────────────────────────
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_message_read()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.read AND NOT COALESCE(OLD.read, false) AND NEW.read_at IS NULL THEN
    NEW.read_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS stamp_message_read ON public.messages;
CREATE TRIGGER stamp_message_read BEFORE UPDATE OF read ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.stamp_message_read();

-- ── Documents, polls, events and quotes ride on the message ────────────────────────────────
-- The message's text says what it is ("📄 Report.pdf", "📊 Poll: …", "📅 …"), so older
-- versions of the app still show something sensible.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file jsonb;   -- { url, name, size, type }
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS poll jsonb;   -- { question, options[], multiple }
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS event jsonb;  -- { title, starts_at, place }
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS quote jsonb;  -- { name, text, group_id, group_name }

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_extras_size;
ALTER TABLE public.messages ADD CONSTRAINT messages_extras_size CHECK (
  coalesce(pg_column_size(file), 0) < 2048 AND coalesce(pg_column_size(poll), 0) < 4096
  AND coalesce(pg_column_size(event), 0) < 2048 AND coalesce(pg_column_size(quote), 0) < 2048
);

-- Votes on a poll, and going / not going on an event (option 0 = going, 1 = can't go).
CREATE TABLE IF NOT EXISTS public.message_votes (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option smallint NOT NULL CHECK (option BETWEEN 0 AND 11),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, option)
);
CREATE INDEX IF NOT EXISTS message_votes_message ON public.message_votes (message_id);
ALTER TABLE public.message_votes ENABLE ROW LEVEL SECURITY;

-- Only the two people in the chat see and cast votes, each their own.
CREATE OR REPLACE FUNCTION public.in_message_chat(_message uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM messages WHERE id = _message AND auth.uid() IN (sender_id, receiver_id));
$$;
REVOKE ALL ON FUNCTION public.in_message_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.in_message_chat(uuid) TO authenticated;

DROP POLICY IF EXISTS "People in the chat see votes" ON public.message_votes;
CREATE POLICY "People in the chat see votes" ON public.message_votes
  FOR SELECT TO authenticated USING (public.in_message_chat(message_id));
DROP POLICY IF EXISTS "People in the chat vote" ON public.message_votes;
CREATE POLICY "People in the chat vote" ON public.message_votes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.in_message_chat(message_id));
DROP POLICY IF EXISTS "People take back their vote" ON public.message_votes;
CREATE POLICY "People take back their vote" ON public.message_votes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── Pinned messages (up to three a chat; both people see them) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_pins (
  message_id uuid PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
  user_a uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pinned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_a <= user_b)
);
CREATE INDEX IF NOT EXISTS chat_pins_chat ON public.chat_pins (user_a, user_b);
ALTER TABLE public.chat_pins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Both people see a chat's pins" ON public.chat_pins;
CREATE POLICY "Both people see a chat's pins" ON public.chat_pins
  FOR SELECT TO authenticated USING (auth.uid() IN (user_a, user_b));
DROP POLICY IF EXISTS "Both people pin in their chat" ON public.chat_pins;
CREATE POLICY "Both people pin in their chat" ON public.chat_pins
  FOR INSERT TO authenticated WITH CHECK (
    pinned_by = auth.uid() AND auth.uid() IN (user_a, user_b)
    AND EXISTS (
      SELECT 1 FROM public.messages m WHERE m.id = message_id
        AND least(m.sender_id, m.receiver_id) = user_a AND greatest(m.sender_id, m.receiver_id) = user_b
    )
    AND (SELECT count(*) FROM public.chat_pins p WHERE p.user_a = chat_pins.user_a AND p.user_b = chat_pins.user_b) < 3
  );
DROP POLICY IF EXISTS "Both people unpin in their chat" ON public.chat_pins;
CREATE POLICY "Both people unpin in their chat" ON public.chat_pins
  FOR DELETE TO authenticated USING (auth.uid() IN (user_a, user_b));

-- ── Delete for me ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hidden_messages (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);
ALTER TABLE public.hidden_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "People keep their own hidden messages" ON public.hidden_messages;
CREATE POLICY "People keep their own hidden messages" ON public.hidden_messages
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.in_message_chat(message_id));

-- ── Privacy: hide last seen; read receipts ─────────────────────────────────────────────────
-- Off on either side means neither sees the other's (as on WhatsApp).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hide_last_seen boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS read_receipts boolean NOT NULL DEFAULT true;

-- ── @mentions in group chats ───────────────────────────────────────────────────────────────
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS mentions uuid[];

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'like', 'comment', 'friend_request', 'friend_accepted', 'message', 'verification', 'group_added',
  'group_invite', 'tag', 'usage_alert', 'mention', 'event_reminder', 'story_mention', 'group_mention'
]));

-- Members mentioned in a group message are told (at most 10, members only, never yourself).
CREATE OR REPLACE FUNCTION public.notify_group_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mentioned uuid;
  author_name text;
  chat_name text;
BEGIN
  IF NEW.mentions IS NULL OR cardinality(NEW.mentions) = 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name, 'Someone') INTO author_name FROM profiles WHERE id = NEW.user_id;
  SELECT name INTO chat_name FROM groups WHERE id = NEW.group_id;
  FOR mentioned IN SELECT DISTINCT u FROM unnest(NEW.mentions) AS u LIMIT 10 LOOP
    CONTINUE WHEN mentioned = NEW.user_id;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = NEW.group_id AND user_id = mentioned);
    INSERT INTO notifications (user_id, type, content, related_id, actor_id)
    VALUES (mentioned, 'group_mention', author_name || ' mentioned you in ' || COALESCE(chat_name, 'a group'), NEW.group_id, NEW.user_id);
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- a mention must never stop the message itself
END;
$$;
DROP TRIGGER IF EXISTS notify_group_mentions ON public.group_messages;
CREATE TRIGGER notify_group_mentions AFTER INSERT ON public.group_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_group_mentions();

-- Push links: a group mention opens that group's chat.
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
    WHEN NEW.type = 'group_mention' AND NEW.related_id IS NOT NULL THEN '/messages?group=' || NEW.related_id
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

-- Live updates for votes and pins.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_votes;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_pins;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

GRANT SELECT, INSERT, DELETE ON public.message_votes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.chat_pins TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.hidden_messages TO authenticated;
