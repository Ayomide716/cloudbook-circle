
-- RLS policies for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Assign admin to the user (only where that account exists, so a fresh database,
-- such as CI or a new environment, can still be built from these migrations)
INSERT INTO public.user_roles (user_id, role)
SELECT 'dffaf060-5010-475a-841e-27fe224c435c', 'admin'
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = 'dffaf060-5010-475a-841e-27fe224c435c');

-- Admin access to reports
CREATE POLICY "Admins can view all reports" ON public.reports FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update reports" ON public.reports FOR UPDATE USING (has_role(auth.uid(), 'admin'));

-- Admin can delete any post
CREATE POLICY "Admins can delete any post" ON public.posts FOR DELETE USING (has_role(auth.uid(), 'admin'));
