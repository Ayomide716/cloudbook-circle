-- Allow authenticated users to upload group logos to the avatars bucket
CREATE POLICY "Authenticated users can upload group logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = 'group-logos'
);

-- Allow authenticated users to update group logos
CREATE POLICY "Authenticated users can update group logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = 'group-logos'
);