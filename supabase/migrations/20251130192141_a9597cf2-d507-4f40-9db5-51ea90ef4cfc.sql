-- Create reels table for short video content
CREATE TABLE public.reels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  views_count INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;

-- Reels policies
CREATE POLICY "Reels are viewable by everyone"
ON public.reels FOR SELECT
USING (true);

CREATE POLICY "Users can create their own reels"
ON public.reels FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reels"
ON public.reels FOR DELETE
USING (auth.uid() = user_id);

-- Create reel_likes table
CREATE TABLE public.reel_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(reel_id, user_id)
);

ALTER TABLE public.reel_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reel likes are viewable by everyone"
ON public.reel_likes FOR SELECT
USING (true);

CREATE POLICY "Users can create their own reel likes"
ON public.reel_likes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reel likes"
ON public.reel_likes FOR DELETE
USING (auth.uid() = user_id);

-- Create reel_comments table
CREATE TABLE public.reel_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.reel_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reel comments are viewable by everyone"
ON public.reel_comments FOR SELECT
USING (true);

CREATE POLICY "Users can create their own reel comments"
ON public.reel_comments FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reel comments"
ON public.reel_comments FOR DELETE
USING (auth.uid() = user_id);

-- Create blocks table for blocking users
CREATE TABLE public.blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own blocks"
ON public.blocks FOR SELECT
USING (auth.uid() = blocker_id);

CREATE POLICY "Users can create blocks"
ON public.blocks FOR INSERT
WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can delete their own blocks"
ON public.blocks FOR DELETE
USING (auth.uid() = blocker_id);

-- Add video support to posts
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Create photo albums table
CREATE TABLE public.albums (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Albums are viewable by everyone"
ON public.albums FOR SELECT
USING (true);

CREATE POLICY "Users can create their own albums"
ON public.albums FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own albums"
ON public.albums FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own albums"
ON public.albums FOR DELETE
USING (auth.uid() = user_id);

-- Create album_photos table
CREATE TABLE public.album_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  album_id UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.album_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Album photos are viewable by everyone"
ON public.album_photos FOR SELECT
USING (true);

CREATE POLICY "Album owners can manage photos"
ON public.album_photos FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.albums
    WHERE albums.id = album_photos.album_id
    AND albums.user_id = auth.uid()
  )
);

-- Enable realtime for reels
ALTER PUBLICATION supabase_realtime ADD TABLE public.reels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reel_comments;