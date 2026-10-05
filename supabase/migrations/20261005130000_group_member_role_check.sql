-- Anyone could add themselves to any group as an "admin". Joining now only
-- makes you a member; the group's creator is the one who may add themselves as admin.
DROP POLICY IF EXISTS "Users can join groups" ON public.group_members;
CREATE POLICY "Users can join groups"
ON public.group_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    role = 'member'
    OR (
      role = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = group_id AND g.created_by = auth.uid()
      )
    )
  )
);
