
-- Pages table
CREATE TABLE public.pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'business',
  description text,
  about text,
  avatar_url text,
  cover_url text,
  website text,
  email text,
  phone text,
  location text,
  followers_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view pages" ON public.pages FOR SELECT USING (true);
CREATE POLICY "Users can create pages" ON public.pages FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update pages" ON public.pages FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete pages" ON public.pages FOR DELETE USING (auth.uid() = owner_id);

-- Page followers
CREATE TABLE public.page_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, user_id)
);

ALTER TABLE public.page_followers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view page followers" ON public.page_followers FOR SELECT USING (true);
CREATE POLICY "Users can follow pages" ON public.page_followers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unfollow pages" ON public.page_followers FOR DELETE USING (auth.uid() = user_id);

-- Page posts
CREATE TABLE public.page_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.page_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view page posts" ON public.page_posts FOR SELECT USING (true);
CREATE POLICY "Page owners can create posts" ON public.page_posts FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.pages WHERE id = page_posts.page_id AND owner_id = auth.uid())
);
CREATE POLICY "Page owners can delete posts" ON public.page_posts FOR DELETE USING (
  auth.uid() = user_id
);

-- Page post likes
CREATE TABLE public.page_post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.page_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

ALTER TABLE public.page_post_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view page post likes" ON public.page_post_likes FOR SELECT USING (true);
CREATE POLICY "Users can like page posts" ON public.page_post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike page posts" ON public.page_post_likes FOR DELETE USING (auth.uid() = user_id);

-- Page post comments
CREATE TABLE public.page_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.page_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.page_post_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view page post comments" ON public.page_post_comments FOR SELECT USING (true);
CREATE POLICY "Users can comment on page posts" ON public.page_post_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their comments" ON public.page_post_comments FOR DELETE USING (auth.uid() = user_id);

-- Watch comments
CREATE TABLE public.watch_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.watch_videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.watch_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view watch comments" ON public.watch_comments FOR SELECT USING (true);
CREATE POLICY "Users can comment on videos" ON public.watch_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their comments" ON public.watch_comments FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket for page images
INSERT INTO storage.buckets (id, name, public) VALUES ('page-images', 'page-images', true);
CREATE POLICY "Authenticated users can upload page images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'page-images');
CREATE POLICY "Anyone can view page images" ON storage.objects FOR SELECT USING (bucket_id = 'page-images');
CREATE POLICY "Users can delete their page images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'page-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Trigger to update followers_count
CREATE OR REPLACE FUNCTION public.update_page_followers_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE pages SET followers_count = followers_count + 1 WHERE id = NEW.page_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE pages SET followers_count = GREATEST(0, followers_count - 1) WHERE id = OLD.page_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER on_page_follow_change
  AFTER INSERT OR DELETE ON public.page_followers
  FOR EACH ROW EXECUTE FUNCTION public.update_page_followers_count();
