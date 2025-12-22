-- Create a storage bucket for videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-videos', 'post-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload videos
CREATE POLICY "Users can upload videos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'post-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow public read access to videos
CREATE POLICY "Videos are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'post-videos');

-- Allow users to delete their own videos
CREATE POLICY "Users can delete their own videos"
ON storage.objects
FOR DELETE
USING (bucket_id = 'post-videos' AND auth.uid()::text = (storage.foldername(name))[1]);