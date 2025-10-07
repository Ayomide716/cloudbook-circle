-- Drop the problematic policies
DROP POLICY IF EXISTS "Groups are viewable by members" ON public.groups;
DROP POLICY IF EXISTS "Group members are viewable by group members" ON public.group_members;
DROP POLICY IF EXISTS "Group posts are viewable by group members" ON public.group_posts;
DROP POLICY IF EXISTS "Group members can create posts" ON public.group_posts;

-- Create security definer function to check group membership
CREATE OR REPLACE FUNCTION public.is_group_member(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = _group_id
    AND user_id = _user_id
  )
$$;

-- Recreate policies using the security definer function
CREATE POLICY "Groups are viewable by members"
ON public.groups
FOR SELECT
USING (public.is_group_member(auth.uid(), id));

CREATE POLICY "Group members are viewable by group members"
ON public.group_members
FOR SELECT
USING (public.is_group_member(auth.uid(), group_id));

CREATE POLICY "Group posts are viewable by group members"
ON public.group_posts
FOR SELECT
USING (public.is_group_member(auth.uid(), group_id));

CREATE POLICY "Group members can create posts"
ON public.group_posts
FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  public.is_group_member(auth.uid(), group_id)
);