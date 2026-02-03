-- Drop restrictive policy on groups for SELECT
DROP POLICY IF EXISTS "Groups are viewable by creators and members" ON public.groups;

-- Create new policy allowing all authenticated users to see all groups (for discovery)
CREATE POLICY "All authenticated users can view groups" 
ON public.groups 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Create storage bucket for chat images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for chat-images bucket
CREATE POLICY "Authenticated users can upload chat images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'chat-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view chat images" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'chat-images');