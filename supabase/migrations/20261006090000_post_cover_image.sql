-- Posts with several photos used to leave image_url empty. Use the first photo
-- as the cover, so profile photo grids, saved posts and previews can show them.
UPDATE public.posts
SET image_url = image_urls[1]
WHERE image_url IS NULL
  AND image_urls IS NOT NULL
  AND array_length(image_urls, 1) > 0;
