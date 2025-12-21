-- Fix security issues

-- 1. Update profiles policy to require authentication
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- 2. Fix notifications INSERT policy - only allow system triggers
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
-- Notifications will only be created by the trigger function (SECURITY DEFINER)