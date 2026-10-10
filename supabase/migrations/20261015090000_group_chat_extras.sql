-- Group chats catch up with one-to-one chats: replies, reactions, editing your messages,
-- and group admins (not only whoever made the group) can change its name and picture.

-- Replying to a message: the message it quotes, which has to be in the same group.
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES public.group_messages(id) ON DELETE SET NULL;
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

CREATE OR REPLACE FUNCTION public.check_group_message_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reply_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM group_messages m WHERE m.id = NEW.reply_to AND m.group_id = NEW.group_id
  ) THEN
    RAISE EXCEPTION 'The message you are replying to is not in this group';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_group_message_reply ON public.group_messages;
CREATE TRIGGER check_group_message_reply
  BEFORE INSERT ON public.group_messages
  FOR EACH ROW EXECUTE FUNCTION public.check_group_message_reply();

-- Editing: only the text of your own message, and it's marked as edited.
CREATE OR REPLACE FUNCTION public.edit_group_message(_id uuid, _content text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(trim(_content), '') = '' THEN
    RAISE EXCEPTION 'A message can''t be empty';
  END IF;
  UPDATE group_messages
     SET content = trim(_content), edited_at = now()
   WHERE id = _id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You can only edit your own messages';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.edit_group_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_group_message(uuid, text) TO authenticated;

-- Reactions on group messages: one per person per message, seen by the group's members.
CREATE TABLE IF NOT EXISTS public.group_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.group_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_message_reactions_message ON public.group_message_reactions(message_id);

ALTER TABLE public.group_message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members see reactions in their groups" ON public.group_message_reactions;
CREATE POLICY "Members see reactions in their groups" ON public.group_message_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.group_messages m
    WHERE m.id = message_id AND public.is_group_member(auth.uid(), m.group_id)
  ));

DROP POLICY IF EXISTS "Members react in their groups" ON public.group_message_reactions;
CREATE POLICY "Members react in their groups" ON public.group_message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.group_messages m
      WHERE m.id = message_id AND public.is_group_member(auth.uid(), m.group_id)
    )
  );

DROP POLICY IF EXISTS "People remove their own reactions" ON public.group_message_reactions;
CREATE POLICY "People remove their own reactions" ON public.group_message_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_message_reactions;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- Changing the group's name, description and picture: its creator or any of its admins.
CREATE OR REPLACE FUNCTION public.update_group_details(_group uuid, _name text, _description text, _image_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(trim(_name), '') = '' THEN
    RAISE EXCEPTION 'The group needs a name';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM groups g WHERE g.id = _group AND g.created_by = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = _group AND gm.user_id = auth.uid() AND gm.role = 'admin') THEN
    RAISE EXCEPTION 'Only group admins can change the group''s details';
  END IF;
  UPDATE groups
     SET name = left(trim(_name), 100),
         description = nullif(trim(coalesce(_description, '')), ''),
         image_url = _image_url
   WHERE id = _group;
END;
$$;

REVOKE ALL ON FUNCTION public.update_group_details(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_group_details(uuid, text, text, text) TO authenticated;
