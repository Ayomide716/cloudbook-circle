-- Forwarding and starring messages, as on WhatsApp.

-- A forwarded message is labelled "Forwarded" in the chat it was sent on to.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS forwarded boolean NOT NULL DEFAULT false;
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS forwarded boolean NOT NULL DEFAULT false;

-- Starred messages: your own bookmarks, in one-to-one chats ('dm') or group chats ('group').
-- Only you can see your stars. Reading the starred message itself still goes through that
-- chat's own rules, so a star never shows you a message you can no longer see.
CREATE TABLE IF NOT EXISTS public.starred_messages (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL,
  chat_kind text NOT NULL CHECK (chat_kind IN ('dm', 'group')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

ALTER TABLE public.starred_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "People see their own stars" ON public.starred_messages;
CREATE POLICY "People see their own stars" ON public.starred_messages
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "People star messages" ON public.starred_messages;
CREATE POLICY "People star messages" ON public.starred_messages
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "People unstar messages" ON public.starred_messages;
CREATE POLICY "People unstar messages" ON public.starred_messages
  FOR DELETE TO authenticated USING (user_id = auth.uid());
