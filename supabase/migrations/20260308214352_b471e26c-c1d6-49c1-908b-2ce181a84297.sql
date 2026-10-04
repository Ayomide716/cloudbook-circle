
-- RLS policies for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Admins are not seeded here (a hard-coded user id breaks fresh databases).
-- After signing up, make yourself admin from the SQL editor:
--   INSERT INTO public.user_roles (user_id, role)
--   SELECT id, 'admin' FROM auth.users WHERE email = 'you@example.com';

-- Admin access to reports
CREATE POLICY "Admins can view all reports" ON public.reports FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update reports" ON public.reports FOR UPDATE USING (has_role(auth.uid(), 'admin'));

-- Admin can delete any post
CREATE POLICY "Admins can delete any post" ON public.posts FOR DELETE USING (has_role(auth.uid(), 'admin'));
