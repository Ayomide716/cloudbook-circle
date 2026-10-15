-- Story viewers, story highlights, tagging friends in posts, and blurred photo previews.

-- 1. Who watched your story: only the story's owner sees the list (and each viewer sees
--    their own view, so "seen" rings keep working). Before, anyone could read every view.
DROP POLICY IF EXISTS "Story views are viewable by everyone" ON public.story_views;
DROP POLICY IF EXISTS "Story owners and viewers see story views" ON public.story_views;
CREATE POLICY "Story owners and viewers see story views"
  ON public.story_views FOR SELECT
  USING (
    viewer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.user_id = auth.uid())
  );

-- 2. Story highlights: stories kept as circles on your profile ("Lagos 🌴", "Birthday").
CREATE TABLE IF NOT EXISTS public.story_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 30),
  story_ids UUID[] NOT NULL DEFAULT '{}' CHECK (cardinality(story_ids) <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS story_highlights_user_idx ON public.story_highlights (user_id, created_at);
ALTER TABLE public.story_highlights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Highlights are viewable by everyone" ON public.story_highlights;
CREATE POLICY "Highlights are viewable by everyone"
  ON public.story_highlights FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users manage their own highlights" ON public.story_highlights;
CREATE POLICY "Users manage their own highlights"
  ON public.story_highlights FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Tag friends in a post ("Ayo is with Tolu and 2 others"). Only the post's author can tag,
--    and only their friends; the author or the tagged person can remove a tag.
CREATE TABLE IF NOT EXISTS public.post_tags (
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_tags_user_idx ON public.post_tags (user_id);
ALTER TABLE public.post_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Post tags are viewable by everyone" ON public.post_tags;
CREATE POLICY "Post tags are viewable by everyone"
  ON public.post_tags FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authors tag their friends" ON public.post_tags;
CREATE POLICY "Authors tag their friends"
  ON public.post_tags FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.user_id = auth.uid() AND f.friend_id = post_tags.user_id)
          OR (f.friend_id = auth.uid() AND f.user_id = post_tags.user_id))
    )
  );

DROP POLICY IF EXISTS "Authors and tagged people remove tags" ON public.post_tags;
CREATE POLICY "Authors and tagged people remove tags"
  ON public.post_tags FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = auth.uid())
  );

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['like','comment','friend_request','friend_accepted','message','verification','group_added','group_invite','tag']));

-- "Ayo tagged you in a post"
CREATE OR REPLACE FUNCTION public.notify_post_tag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  author uuid;
  author_name text;
BEGIN
  SELECT p.user_id, pr.full_name INTO author, author_name
  FROM posts p LEFT JOIN profiles pr ON pr.id = p.user_id
  WHERE p.id = NEW.post_id;
  IF author IS NOT NULL AND author <> NEW.user_id THEN
    INSERT INTO notifications (user_id, type, content, related_id, actor_id)
    VALUES (NEW.user_id, 'tag', COALESCE(author_name, 'Someone') || ' tagged you in a post', NEW.post_id, author);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_post_tag_created ON public.post_tags;
CREATE TRIGGER on_post_tag_created
  AFTER INSERT ON public.post_tags
  FOR EACH ROW EXECUTE FUNCTION public.notify_post_tag();

-- 4. Blurred previews of a post's photos (tiny images, one per photo in image_urls), shown
--    while the real photos load, as on Facebook.
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_previews TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_image_previews_size;
ALTER TABLE public.posts ADD CONSTRAINT posts_image_previews_size
  CHECK (cardinality(image_previews) <= 20 AND octet_length(array_to_string(image_previews, '')) <= 40000);
