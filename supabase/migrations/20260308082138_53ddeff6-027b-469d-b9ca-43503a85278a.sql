
-- Watch videos table for long-form video content
CREATE TABLE public.watch_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  video_url text NOT NULL,
  thumbnail_url text,
  category text NOT NULL DEFAULT 'general',
  duration integer, -- seconds
  views_count integer NOT NULL DEFAULT 0,
  likes_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.watch_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view watch videos" ON public.watch_videos FOR SELECT USING (true);
CREATE POLICY "Users can upload watch videos" ON public.watch_videos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own watch videos" ON public.watch_videos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own watch videos" ON public.watch_videos FOR DELETE USING (auth.uid() = user_id);

-- Watch saves / watchlist
CREATE TABLE public.watch_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.watch_videos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_id)
);

ALTER TABLE public.watch_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saves" ON public.watch_saves FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can save videos" ON public.watch_saves FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unsave videos" ON public.watch_saves FOR DELETE USING (auth.uid() = user_id);

-- Watch likes
CREATE TABLE public.watch_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.watch_videos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_id)
);

ALTER TABLE public.watch_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view watch likes" ON public.watch_likes FOR SELECT USING (true);
CREATE POLICY "Users can like videos" ON public.watch_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike videos" ON public.watch_likes FOR DELETE USING (auth.uid() = user_id);

-- Storage bucket for watch videos
INSERT INTO storage.buckets (id, name, public) VALUES ('watch-videos', 'watch-videos', true);

CREATE POLICY "Authenticated users can upload watch videos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'watch-videos');
CREATE POLICY "Anyone can view watch videos" ON storage.objects FOR SELECT USING (bucket_id = 'watch-videos');
CREATE POLICY "Users can delete their own watch videos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'watch-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Enable realtime for watch_videos
ALTER PUBLICATION supabase_realtime ADD TABLE public.watch_videos;
