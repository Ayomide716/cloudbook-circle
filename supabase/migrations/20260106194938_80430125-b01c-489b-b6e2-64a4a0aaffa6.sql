-- Create voice-messages bucket for audio files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('voice-messages', 'voice-messages', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy to allow authenticated users to upload voice messages
CREATE POLICY "Authenticated users can upload voice messages"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'voice-messages');

-- Create storage policy to allow public access to voice messages
CREATE POLICY "Public can view voice messages"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'voice-messages');

-- Create storage policy to allow users to delete their own voice messages
CREATE POLICY "Users can delete own voice messages"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'voice-messages');