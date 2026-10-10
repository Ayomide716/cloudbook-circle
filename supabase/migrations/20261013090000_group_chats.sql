-- Group chats (made in Messages, like WhatsApp groups) are separate from community groups
-- (the Groups tab). They share the group tables; is_chat tells them apart.
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS is_chat boolean NOT NULL DEFAULT false;

-- Group chats are private: only their members, the person who made them and people
-- invited can see them (community groups stay visible to everyone, as before).
DROP POLICY IF EXISTS "Group chats are private" ON public.groups;
CREATE POLICY "Group chats are private" ON public.groups
  AS RESTRICTIVE FOR SELECT
  USING (
    NOT is_chat
    OR created_by = auth.uid()
    OR public.is_group_member(auth.uid(), id)
    OR EXISTS (SELECT 1 FROM public.group_invites i WHERE i.group_id = groups.id AND i.user_id = auth.uid())
  );
