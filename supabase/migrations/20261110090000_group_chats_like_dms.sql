-- Group chats get what one-to-one chats have: documents, polls and events, pinned messages,
-- delete for me, and message info ("read by 4 of 6"). Safe to run more than once.

-- ── Documents, polls and events ────────────────────────────────────────────────────────────
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS file jsonb;   -- { url, name, size, type }
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS poll jsonb;   -- { question, options[], multiple }
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS event jsonb;  -- { title, starts_at, place }
ALTER TABLE public.group_messages DROP CONSTRAINT IF EXISTS group_messages_extras_size;
ALTER TABLE public.group_messages ADD CONSTRAINT group_messages_extras_size CHECK (
  coalesce(pg_column_size(file), 0) < 2048 AND coalesce(pg_column_size(poll), 0) < 4096 AND coalesce(pg_column_size(event), 0) < 2048
);

-- Whether you're in the group a message was sent in.
CREATE OR REPLACE FUNCTION public.in_group_message(_message uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_messages gm
    JOIN group_members m ON m.group_id = gm.group_id AND m.user_id = auth.uid()
    WHERE gm.id = _message
  );
$$;
REVOKE ALL ON FUNCTION public.in_group_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.in_group_message(uuid) TO authenticated;

-- Votes on a group poll, and going / can't go on a group event (option 0 = going).
CREATE TABLE IF NOT EXISTS public.group_message_votes (
  message_id uuid NOT NULL REFERENCES public.group_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option smallint NOT NULL CHECK (option BETWEEN 0 AND 11),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, option)
);
CREATE INDEX IF NOT EXISTS group_message_votes_message ON public.group_message_votes (message_id);
ALTER TABLE public.group_message_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members see group votes" ON public.group_message_votes;
CREATE POLICY "Members see group votes" ON public.group_message_votes
  FOR SELECT TO authenticated USING (public.in_group_message(message_id));
DROP POLICY IF EXISTS "Members vote" ON public.group_message_votes;
CREATE POLICY "Members vote" ON public.group_message_votes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.in_group_message(message_id));
DROP POLICY IF EXISTS "Members take back their vote" ON public.group_message_votes;
CREATE POLICY "Members take back their vote" ON public.group_message_votes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── Pinned messages (up to three a group; any member can pin or unpin) ──────────────────────
CREATE TABLE IF NOT EXISTS public.group_pins (
  message_id uuid PRIMARY KEY REFERENCES public.group_messages(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  pinned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pinned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_pins_group ON public.group_pins (group_id);
ALTER TABLE public.group_pins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members see pins" ON public.group_pins;
CREATE POLICY "Members see pins" ON public.group_pins
  FOR SELECT TO authenticated USING (public.is_group_member(auth.uid(), group_id));
DROP POLICY IF EXISTS "Members pin" ON public.group_pins;
CREATE POLICY "Members pin" ON public.group_pins
  FOR INSERT TO authenticated WITH CHECK (
    pinned_by = auth.uid() AND public.is_group_member(auth.uid(), group_id)
    AND EXISTS (SELECT 1 FROM public.group_messages gm WHERE gm.id = message_id AND gm.group_id = group_pins.group_id)
    AND (SELECT count(*) FROM public.group_pins p WHERE p.group_id = group_pins.group_id) < 3
  );
DROP POLICY IF EXISTS "Members unpin" ON public.group_pins;
CREATE POLICY "Members unpin" ON public.group_pins
  FOR DELETE TO authenticated USING (public.is_group_member(auth.uid(), group_id));

-- ── Delete for me ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hidden_group_messages (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.group_messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);
ALTER TABLE public.hidden_group_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "People keep their own hidden group messages" ON public.hidden_group_messages;
CREATE POLICY "People keep their own hidden group messages" ON public.hidden_group_messages
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.in_group_message(message_id));

-- ── Message info: who has read it ──────────────────────────────────────────────────────────
-- Each member's "read up to" time; a message is read by those whose time is after it.
ALTER TABLE public.group_members ADD COLUMN IF NOT EXISTS last_read_at timestamptz;

CREATE OR REPLACE FUNCTION public.mark_group_read(_group uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE group_members SET last_read_at = now() WHERE group_id = _group AND user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.mark_group_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_group_read(uuid) TO authenticated;

-- Live updates for votes and pins.
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.group_message_votes; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.group_pins; EXCEPTION WHEN OTHERS THEN NULL; END; $$;

GRANT SELECT, INSERT, DELETE ON public.group_message_votes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.group_pins TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.hidden_group_messages TO authenticated;
