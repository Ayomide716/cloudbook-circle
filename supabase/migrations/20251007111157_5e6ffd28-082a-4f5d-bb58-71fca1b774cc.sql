-- Fix groups SELECT policy to allow creators to see their groups
DROP POLICY IF EXISTS "Groups are viewable by members" ON public.groups;

CREATE POLICY "Groups are viewable by creators and members"
ON public.groups
FOR SELECT
USING (
  auth.uid() = created_by OR 
  public.is_group_member(auth.uid(), id)
);