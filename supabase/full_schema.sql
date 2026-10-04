-- =====================================================================
-- CloudBook: complete database schema
--
-- Paste this whole file into a NEW Supabase project's SQL editor
-- (Dashboard -> SQL Editor -> New query) and click Run.
-- It creates every table, function, trigger, security policy, storage
-- bucket and realtime setting the app needs.
--
-- Generated from supabase/migrations/ (one section per migration, in order)
-- by `npm run schema:sql`. Run it only once, on an empty project. If you use
-- the Supabase CLI, run `npx supabase db push` instead of this file - don't do both.
--
-- After signing up in the app, make yourself admin:
--   INSERT INTO public.user_roles (user_id, role)
--   SELECT id, 'admin' FROM auth.users WHERE email = 'you@example.com';
-- =====================================================================

-- ---------------------------------------------------------------------
-- 20251003163647_6a28d79a-b92d-4e4f-aa6b-d065c2649d90.sql
-- ---------------------------------------------------------------------

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create posts table
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on posts
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Posts policies
CREATE POLICY "Posts are viewable by everyone"
  ON public.posts FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own posts"
  ON public.posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own posts"
  ON public.posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own posts"
  ON public.posts FOR DELETE
  USING (auth.uid() = user_id);

-- Create comments table
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on comments
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Comments policies
CREATE POLICY "Comments are viewable by everyone"
  ON public.comments FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own comments"
  ON public.comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON public.comments FOR DELETE
  USING (auth.uid() = user_id);

-- Create likes table
CREATE TABLE public.likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Enable RLS on likes
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

-- Likes policies
CREATE POLICY "Likes are viewable by everyone"
  ON public.likes FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own likes"
  ON public.likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own likes"
  ON public.likes FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable realtime for posts, comments, and likes
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.likes;

-- ---------------------------------------------------------------------
-- 20251003164237_f66fe32f-362d-47af-a0c1-a29b66f06b0e.sql
-- ---------------------------------------------------------------------

-- Create storage buckets for images
INSERT INTO storage.buckets (id, name, public) 
VALUES 
  ('avatars', 'avatars', true),
  ('post-images', 'post-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for avatars
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage policies for post images
CREATE POLICY "Post images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'post-images');

CREATE POLICY "Users can upload post images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'post-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own post images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'post-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Create friendships table
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own friendships"
ON public.friendships FOR SELECT
USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can create friend requests"
ON public.friendships FOR INSERT
WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Users can update friendships they're part of"
ON public.friendships FOR UPDATE
USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can delete their own friendships"
ON public.friendships FOR DELETE
USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Create messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own messages"
ON public.messages FOR SELECT
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send messages"
ON public.messages FOR INSERT
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update messages they received"
ON public.messages FOR UPDATE
USING (auth.uid() = receiver_id);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('like', 'comment', 'friend_request', 'friend_accepted', 'message')),
  content TEXT NOT NULL,
  related_id UUID,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

-- Create reactions table for emoji reactions
CREATE TABLE public.reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'love', 'haha', 'wow', 'sad', 'angry')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reactions are viewable by everyone"
ON public.reactions FOR SELECT
USING (true);

CREATE POLICY "Users can create their own reactions"
ON public.reactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reactions"
ON public.reactions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reactions"
ON public.reactions FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;

-- Create function to create notifications
CREATE OR REPLACE FUNCTION public.create_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  notification_user_id UUID;
  notification_content TEXT;
  notification_type TEXT;
BEGIN
  -- Handle likes
  IF TG_TABLE_NAME = 'likes' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO notification_user_id FROM posts WHERE id = NEW.post_id;
    IF notification_user_id != NEW.user_id THEN
      notification_content := 'liked your post';
      notification_type := 'like';
      INSERT INTO notifications (user_id, type, content, related_id)
      VALUES (notification_user_id, notification_type, notification_content, NEW.post_id);
    END IF;
  END IF;

  -- Handle comments
  IF TG_TABLE_NAME = 'comments' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO notification_user_id FROM posts WHERE id = NEW.post_id;
    IF notification_user_id != NEW.user_id THEN
      notification_content := 'commented on your post';
      notification_type := 'comment';
      INSERT INTO notifications (user_id, type, content, related_id)
      VALUES (notification_user_id, notification_type, notification_content, NEW.post_id);
    END IF;
  END IF;

  -- Handle friend requests
  IF TG_TABLE_NAME = 'friendships' AND TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    notification_content := 'sent you a friend request';
    notification_type := 'friend_request';
    INSERT INTO notifications (user_id, type, content, related_id)
    VALUES (NEW.friend_id, notification_type, notification_content, NEW.id);
  END IF;

  -- Handle friend acceptance
  IF TG_TABLE_NAME = 'friendships' AND TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    notification_content := 'accepted your friend request';
    notification_type := 'friend_accepted';
    INSERT INTO notifications (user_id, type, content, related_id)
    VALUES (NEW.user_id, notification_type, notification_content, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Create triggers for notifications
CREATE TRIGGER on_like_created
  AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.create_notification();

CREATE TRIGGER on_comment_created
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.create_notification();

CREATE TRIGGER on_friendship_created
  AFTER INSERT ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.create_notification();

CREATE TRIGGER on_friendship_updated
  AFTER UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.create_notification();

-- ---------------------------------------------------------------------
-- 20251006203144_cad0b3f7-edb7-4a8b-9aa2-9d617cb8d74c.sql
-- ---------------------------------------------------------------------

-- Fix the create_notification function to handle different table structures
CREATE OR REPLACE FUNCTION public.create_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  notification_user_id UUID;
  notification_content TEXT;
  notification_type TEXT;
BEGIN
  -- Handle likes
  IF TG_TABLE_NAME = 'likes' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO notification_user_id FROM posts WHERE id = NEW.post_id;
    IF notification_user_id != NEW.user_id THEN
      notification_content := 'liked your post';
      notification_type := 'like';
      INSERT INTO notifications (user_id, type, content, related_id)
      VALUES (notification_user_id, notification_type, notification_content, NEW.post_id);
    END IF;
  END IF;

  -- Handle comments
  IF TG_TABLE_NAME = 'comments' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO notification_user_id FROM posts WHERE id = NEW.post_id;
    IF notification_user_id != NEW.user_id THEN
      notification_content := 'commented on your post';
      notification_type := 'comment';
      INSERT INTO notifications (user_id, type, content, related_id)
      VALUES (notification_user_id, notification_type, notification_content, NEW.post_id);
    END IF;
  END IF;

  -- Handle friend requests - only for friendships table
  IF TG_TABLE_NAME = 'friendships' THEN
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
      notification_content := 'sent you a friend request';
      notification_type := 'friend_request';
      INSERT INTO notifications (user_id, type, content, related_id)
      VALUES (NEW.friend_id, notification_type, notification_content, NEW.id);
    END IF;

    -- Handle friend acceptance - only for friendships table
    IF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status = 'pending' THEN
      notification_content := 'accepted your friend request';
      notification_type := 'friend_accepted';
      INSERT INTO notifications (user_id, type, content, related_id)
      VALUES (NEW.user_id, notification_type, notification_content, NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Recreate triggers to ensure they're properly attached
DROP TRIGGER IF EXISTS create_notification_on_like ON public.likes;
DROP TRIGGER IF EXISTS create_notification_on_comment ON public.comments;
DROP TRIGGER IF EXISTS create_notification_on_friendship ON public.friendships;

CREATE TRIGGER create_notification_on_like
AFTER INSERT ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.create_notification();

CREATE TRIGGER create_notification_on_comment
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.create_notification();

CREATE TRIGGER create_notification_on_friendship
AFTER INSERT OR UPDATE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.create_notification();

-- ---------------------------------------------------------------------
-- 20251007093309_429fcda8-a972-4b16-ae1b-93ad41b6c087.sql
-- ---------------------------------------------------------------------

-- Create groups table
CREATE TABLE public.groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create group_members table
CREATE TABLE public.group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Create group_posts table
CREATE TABLE public.group_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for groups
CREATE POLICY "Groups are viewable by members"
ON public.groups
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_members.group_id = groups.id
    AND group_members.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create groups"
ON public.groups
FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group creators can update their groups"
ON public.groups
FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Group creators can delete their groups"
ON public.groups
FOR DELETE
USING (auth.uid() = created_by);

-- RLS Policies for group_members
CREATE POLICY "Group members are viewable by group members"
ON public.group_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_members.group_id
    AND gm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can join groups"
ON public.group_members
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave groups"
ON public.group_members
FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for group_posts
CREATE POLICY "Group posts are viewable by group members"
ON public.group_posts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_members.group_id = group_posts.group_id
    AND group_members.user_id = auth.uid()
  )
);

CREATE POLICY "Group members can create posts"
ON public.group_posts
FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_members.group_id = group_posts.group_id
    AND group_members.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own group posts"
ON public.group_posts
FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_posts;

-- ---------------------------------------------------------------------
-- 20251007093816_fe47fa64-f443-4ca3-a963-28f0dcbe928c.sql
-- ---------------------------------------------------------------------

-- Drop the problematic policies
DROP POLICY IF EXISTS "Groups are viewable by members" ON public.groups;
DROP POLICY IF EXISTS "Group members are viewable by group members" ON public.group_members;
DROP POLICY IF EXISTS "Group posts are viewable by group members" ON public.group_posts;
DROP POLICY IF EXISTS "Group members can create posts" ON public.group_posts;

-- Create security definer function to check group membership
CREATE OR REPLACE FUNCTION public.is_group_member(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = _group_id
    AND user_id = _user_id
  )
$$;

-- Recreate policies using the security definer function
CREATE POLICY "Groups are viewable by members"
ON public.groups
FOR SELECT
USING (public.is_group_member(auth.uid(), id));

CREATE POLICY "Group members are viewable by group members"
ON public.group_members
FOR SELECT
USING (public.is_group_member(auth.uid(), group_id));

CREATE POLICY "Group posts are viewable by group members"
ON public.group_posts
FOR SELECT
USING (public.is_group_member(auth.uid(), group_id));

CREATE POLICY "Group members can create posts"
ON public.group_posts
FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  public.is_group_member(auth.uid(), group_id)
);

-- ---------------------------------------------------------------------
-- 20251007111157_5e6ffd28-082a-4f5d-bb58-71fca1b774cc.sql
-- ---------------------------------------------------------------------

-- Fix groups SELECT policy to allow creators to see their groups
DROP POLICY IF EXISTS "Groups are viewable by members" ON public.groups;

CREATE POLICY "Groups are viewable by creators and members"
ON public.groups
FOR SELECT
USING (
  auth.uid() = created_by OR 
  public.is_group_member(auth.uid(), id)
);

-- ---------------------------------------------------------------------
-- 20251102232952_b762a9f1-f5cf-4544-9d10-c1c73f301dde.sql
-- ---------------------------------------------------------------------

-- Create stories table
CREATE TABLE public.stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  caption TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Create story_views table to track who viewed stories
CREATE TABLE public.story_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL,
  viewer_id UUID NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(story_id, viewer_id)
);

-- Enable Row Level Security
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

-- Stories policies
CREATE POLICY "Stories are viewable by everyone"
  ON public.stories
  FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own stories"
  ON public.stories
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own stories"
  ON public.stories
  FOR DELETE
  USING (auth.uid() = user_id);

-- Story views policies
CREATE POLICY "Story views are viewable by everyone"
  ON public.story_views
  FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own story views"
  ON public.story_views
  FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);

-- Enable realtime for stories
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;

-- ---------------------------------------------------------------------
-- 20251130191351_58b9d5bf-c431-463f-8544-b8251d66def1.sql
-- ---------------------------------------------------------------------

-- Add foreign key relationship for stories table
ALTER TABLE public.stories
ADD CONSTRAINT stories_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;

-- ---------------------------------------------------------------------
-- 20251130191422_51f19d46-3514-4351-bb0e-21ab780ae288.sql
-- ---------------------------------------------------------------------

-- Add missing profile fields
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS cover_url TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS work TEXT,
ADD COLUMN IF NOT EXISTS education TEXT;

-- ---------------------------------------------------------------------
-- 20251130192141_a9597cf2-d507-4f40-9db5-51ea90ef4cfc.sql
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 20251221083124_18ac3995-6e9c-4949-94d7-eb035fee9c5a.sql
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 20251222085717_c03f5124-42be-4628-b353-89bc22cce251.sql
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 20260102112905_a0fc5bc4-b477-4266-949e-3defcf7f2a16.sql
-- ---------------------------------------------------------------------

-- Create message_reactions table for chat reactions
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('heart', 'laugh', 'wow', 'sad', 'angry', 'like')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Users can view reactions on messages they're part of
CREATE POLICY "Users can view message reactions"
ON public.message_reactions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id
    AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);

-- Users can add reactions to messages they're part of
CREATE POLICY "Users can add reactions"
ON public.message_reactions
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id
    AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);

-- Users can remove their own reactions
CREATE POLICY "Users can remove their own reactions"
ON public.message_reactions
FOR DELETE
USING (auth.uid() = user_id);

-- Create user_status table for online presence
CREATE TABLE public.user_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.user_status ENABLE ROW LEVEL SECURITY;

-- Everyone can view user status
CREATE POLICY "Anyone can view user status"
ON public.user_status
FOR SELECT
USING (true);

-- Users can update their own status
CREATE POLICY "Users can update their own status"
ON public.user_status
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can insert their own status
CREATE POLICY "Users can insert their own status"
ON public.user_status
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Add image_url column to messages for media sharing
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Enable realtime for message_reactions and user_status
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_status;

-- ---------------------------------------------------------------------
-- 20260106194938_80430125-b01c-489b-b6e2-64a4a0aaffa6.sql
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 20260202023852_0aa99d51-1f06-4798-84b9-ccdfd023f2e5.sql
-- ---------------------------------------------------------------------

-- Create group_messages table for group chat
CREATE TABLE public.group_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Group members can view group messages"
ON public.group_messages
FOR SELECT
USING (is_group_member(auth.uid(), group_id));

CREATE POLICY "Group members can send messages"
ON public.group_messages
FOR INSERT
WITH CHECK (auth.uid() = user_id AND is_group_member(auth.uid(), group_id));

CREATE POLICY "Users can delete their own messages"
ON public.group_messages
FOR DELETE
USING (auth.uid() = user_id);

-- Add index for better query performance
CREATE INDEX idx_group_messages_group_id ON public.group_messages(group_id);
CREATE INDEX idx_group_messages_created_at ON public.group_messages(created_at DESC);

-- Enable realtime for group messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;

-- ---------------------------------------------------------------------
-- 20260203011910_5111beea-1c6c-4ef0-8438-2fa3f7729c4c.sql
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 20260205005322_bab587c0-279f-493c-b9f8-4d43ffcf5ca3.sql
-- ---------------------------------------------------------------------

-- Saved Posts table
CREATE TABLE public.saved_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)
);

ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saved posts" ON public.saved_posts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can save posts" ON public.saved_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave posts" ON public.saved_posts
  FOR DELETE USING (auth.uid() = user_id);

-- Polls table
CREATE TABLE public.polls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  group_post_id UUID REFERENCES public.group_posts(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
);

ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view polls" ON public.polls
  FOR SELECT USING (true);

CREATE POLICY "Users can create polls" ON public.polls
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own polls" ON public.polls
  FOR DELETE USING (auth.uid() = user_id);

-- Poll Votes table
CREATE TABLE public.poll_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(poll_id, user_id)
);

ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view poll votes" ON public.poll_votes
  FOR SELECT USING (true);

CREATE POLICY "Users can vote" ON public.poll_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can change their vote" ON public.poll_votes
  FOR UPDATE USING (auth.uid() = user_id);

-- Events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  cover_image TEXT,
  location TEXT,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view events" ON public.events
  FOR SELECT USING (true);

CREATE POLICY "Users can create events" ON public.events
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can update events" ON public.events
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Creators can delete events" ON public.events
  FOR DELETE USING (auth.uid() = created_by);

-- Event RSVPs table
CREATE TABLE public.event_rsvps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('going', 'interested', 'not_going')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view RSVPs" ON public.event_rsvps
  FOR SELECT USING (true);

CREATE POLICY "Users can RSVP" ON public.event_rsvps
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update RSVP" ON public.event_rsvps
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can remove RSVP" ON public.event_rsvps
  FOR DELETE USING (auth.uid() = user_id);

-- Shared Posts table
CREATE TABLE public.shared_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view shared posts" ON public.shared_posts
  FOR SELECT USING (true);

CREATE POLICY "Users can share posts" ON public.shared_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their shares" ON public.shared_posts
  FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_rsvps;
ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes;

-- ---------------------------------------------------------------------
-- 20260216130251_c302da8e-fc73-47f8-aca6-ef0f509c6642.sql
-- ---------------------------------------------------------------------


-- Add parent_id column to comments for threaded replies
ALTER TABLE public.comments ADD COLUMN parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX idx_comments_parent_id ON public.comments(parent_id);


-- ---------------------------------------------------------------------
-- 20260303083314_397ce6d9-c6a7-4dc4-9ef1-a62691435d7f.sql
-- ---------------------------------------------------------------------

-- Add actor_id column to notifications table
ALTER TABLE public.notifications ADD COLUMN actor_id uuid REFERENCES public.profiles(id);

-- Update the create_notification function to include actor_id and actor name in content
CREATE OR REPLACE FUNCTION public.create_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  notification_user_id UUID;
  notification_content TEXT;
  notification_type TEXT;
  actor_name TEXT;
  actor_uuid UUID;
BEGIN
  -- Handle likes
  IF TG_TABLE_NAME = 'likes' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO notification_user_id FROM posts WHERE id = NEW.post_id;
    actor_uuid := NEW.user_id;
    IF notification_user_id != NEW.user_id THEN
      SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.user_id;
      notification_content := actor_name || ' liked your post';
      notification_type := 'like';
      INSERT INTO notifications (user_id, type, content, related_id, actor_id)
      VALUES (notification_user_id, notification_type, notification_content, NEW.post_id, actor_uuid);
    END IF;
  END IF;

  -- Handle comments
  IF TG_TABLE_NAME = 'comments' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO notification_user_id FROM posts WHERE id = NEW.post_id;
    actor_uuid := NEW.user_id;
    IF notification_user_id != NEW.user_id THEN
      SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.user_id;
      notification_content := actor_name || ' commented on your post';
      notification_type := 'comment';
      INSERT INTO notifications (user_id, type, content, related_id, actor_id)
      VALUES (notification_user_id, notification_type, notification_content, NEW.post_id, actor_uuid);
    END IF;
  END IF;

  -- Handle friend requests
  IF TG_TABLE_NAME = 'friendships' THEN
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
      actor_uuid := NEW.user_id;
      SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.user_id;
      notification_content := actor_name || ' sent you a friend request';
      notification_type := 'friend_request';
      INSERT INTO notifications (user_id, type, content, related_id, actor_id)
      VALUES (NEW.friend_id, notification_type, notification_content, NEW.id, actor_uuid);
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status = 'pending' THEN
      actor_uuid := NEW.friend_id;
      SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.friend_id;
      notification_content := actor_name || ' accepted your friend request';
      notification_type := 'friend_accepted';
      INSERT INTO notifications (user_id, type, content, related_id, actor_id)
      VALUES (NEW.user_id, notification_type, notification_content, NEW.id, actor_uuid);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 20260305112338_3cb2b206-a6d7-4e3c-95ee-c3311afe6d67.sql
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 20260307165628_3f24dd65-071d-4566-85fe-69d10f6bd0e0.sql
-- ---------------------------------------------------------------------


-- Create notification preferences table
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  likes boolean NOT NULL DEFAULT true,
  comments boolean NOT NULL DEFAULT true,
  friend_requests boolean NOT NULL DEFAULT true,
  friend_accepted boolean NOT NULL DEFAULT true,
  messages boolean NOT NULL DEFAULT true,
  shares boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own preferences"
ON public.notification_preferences FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
ON public.notification_preferences FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
ON public.notification_preferences FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Update the create_notification function to check preferences
CREATE OR REPLACE FUNCTION public.create_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  notification_user_id UUID;
  notification_content TEXT;
  notification_type TEXT;
  actor_name TEXT;
  actor_uuid UUID;
  pref_enabled BOOLEAN;
BEGIN
  -- Handle likes
  IF TG_TABLE_NAME = 'likes' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO notification_user_id FROM posts WHERE id = NEW.post_id;
    actor_uuid := NEW.user_id;
    IF notification_user_id != NEW.user_id THEN
      -- Check preference
      SELECT COALESCE(np.likes, true) INTO pref_enabled
      FROM notification_preferences np WHERE np.user_id = notification_user_id;
      IF COALESCE(pref_enabled, true) THEN
        SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.user_id;
        notification_content := actor_name || ' liked your post';
        notification_type := 'like';
        INSERT INTO notifications (user_id, type, content, related_id, actor_id)
        VALUES (notification_user_id, notification_type, notification_content, NEW.post_id, actor_uuid);
      END IF;
    END IF;
  END IF;

  -- Handle comments
  IF TG_TABLE_NAME = 'comments' AND TG_OP = 'INSERT' THEN
    SELECT user_id INTO notification_user_id FROM posts WHERE id = NEW.post_id;
    actor_uuid := NEW.user_id;
    IF notification_user_id != NEW.user_id THEN
      SELECT COALESCE(np.comments, true) INTO pref_enabled
      FROM notification_preferences np WHERE np.user_id = notification_user_id;
      IF COALESCE(pref_enabled, true) THEN
        SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.user_id;
        notification_content := actor_name || ' commented on your post';
        notification_type := 'comment';
        INSERT INTO notifications (user_id, type, content, related_id, actor_id)
        VALUES (notification_user_id, notification_type, notification_content, NEW.post_id, actor_uuid);
      END IF;
    END IF;
  END IF;

  -- Handle friend requests
  IF TG_TABLE_NAME = 'friendships' THEN
    IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
      actor_uuid := NEW.user_id;
      SELECT COALESCE(np.friend_requests, true) INTO pref_enabled
      FROM notification_preferences np WHERE np.user_id = NEW.friend_id;
      IF COALESCE(pref_enabled, true) THEN
        SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.user_id;
        notification_content := actor_name || ' sent you a friend request';
        notification_type := 'friend_request';
        INSERT INTO notifications (user_id, type, content, related_id, actor_id)
        VALUES (NEW.friend_id, notification_type, notification_content, NEW.id, actor_uuid);
      END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status = 'pending' THEN
      actor_uuid := NEW.friend_id;
      SELECT COALESCE(np.friend_accepted, true) INTO pref_enabled
      FROM notification_preferences np WHERE np.user_id = NEW.user_id;
      IF COALESCE(pref_enabled, true) THEN
        SELECT COALESCE(full_name, 'Someone') INTO actor_name FROM profiles WHERE id = NEW.friend_id;
        notification_content := actor_name || ' accepted your friend request';
        notification_type := 'friend_accepted';
        INSERT INTO notifications (user_id, type, content, related_id, actor_id)
        VALUES (NEW.user_id, notification_type, notification_content, NEW.id, actor_uuid);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------
-- 20260308075649_3586e0bf-7540-46fb-9cf4-e1b2a70659dc.sql
-- ---------------------------------------------------------------------


-- Create marketplace_listings table
CREATE TABLE public.marketplace_listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  condition TEXT NOT NULL DEFAULT 'good',
  location TEXT,
  image_urls TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view active listings"
  ON public.marketplace_listings FOR SELECT
  USING (status = 'active' OR auth.uid() = user_id);

CREATE POLICY "Users can create listings"
  ON public.marketplace_listings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own listings"
  ON public.marketplace_listings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own listings"
  ON public.marketplace_listings FOR DELETE
  USING (auth.uid() = user_id);

-- Create storage bucket for marketplace images
INSERT INTO storage.buckets (id, name, public) VALUES ('marketplace', 'marketplace', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload marketplace images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'marketplace');

CREATE POLICY "Anyone can view marketplace images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'marketplace');

CREATE POLICY "Users can delete their own marketplace images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'marketplace' AND (storage.foldername(name))[1] = auth.uid()::text);


-- ---------------------------------------------------------------------
-- 20260308081508_a46d1cb2-215a-4035-9a85-c00e5c8b35f2.sql
-- ---------------------------------------------------------------------


-- Create a function that returns posts ranked by engagement score
-- Score = (reaction_count * 2) + (comment_count * 3) + recency_bonus
-- Recency bonus decays over time (posts from last hour get highest boost)
CREATE OR REPLACE FUNCTION public.get_ranked_posts(
  _user_id uuid,
  _feed_filter text DEFAULT 'all',
  _cursor_score numeric DEFAULT NULL,
  _cursor_id uuid DEFAULT NULL,
  _page_size int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  content text,
  image_url text,
  video_url text,
  created_at timestamptz,
  user_id uuid,
  profile_id uuid,
  profile_full_name text,
  profile_avatar_url text,
  engagement_score numeric,
  reaction_count bigint,
  comment_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH friend_ids AS (
    SELECT CASE 
      WHEN f.user_id = _user_id THEN f.friend_id 
      ELSE f.user_id 
    END AS fid
    FROM friendships f
    WHERE (f.user_id = _user_id OR f.friend_id = _user_id)
      AND f.status = 'accepted'
  ),
  post_stats AS (
    SELECT 
      p.id,
      p.content,
      p.image_url,
      p.video_url,
      p.created_at,
      p.user_id,
      pr.id AS profile_id,
      pr.full_name AS profile_full_name,
      pr.avatar_url AS profile_avatar_url,
      COALESCE(r.cnt, 0) AS reaction_count,
      COALESCE(c.cnt, 0) AS comment_count,
      -- Engagement score: reactions*2 + comments*3 + recency bonus (max 10, decays over 24h)
      (COALESCE(r.cnt, 0) * 2 + COALESCE(c.cnt, 0) * 3 + 
       GREATEST(0, 10.0 - EXTRACT(EPOCH FROM (now() - p.created_at)) / 8640.0)
      )::numeric AS engagement_score
    FROM posts p
    JOIN profiles pr ON pr.id = p.user_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS cnt FROM reactions GROUP BY post_id
    ) r ON r.post_id = p.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS cnt FROM comments GROUP BY post_id
    ) c ON c.post_id = p.id
    WHERE (
      _feed_filter = 'all' 
      OR p.user_id = _user_id 
      OR p.user_id IN (SELECT fid FROM friend_ids)
    )
  )
  SELECT 
    ps.id, ps.content, ps.image_url, ps.video_url, ps.created_at, ps.user_id,
    ps.profile_id, ps.profile_full_name, ps.profile_avatar_url,
    ps.engagement_score, ps.reaction_count, ps.comment_count
  FROM post_stats ps
  WHERE (
    _cursor_score IS NULL 
    OR (ps.engagement_score, ps.id) < (_cursor_score, _cursor_id)
  )
  ORDER BY ps.engagement_score DESC, ps.id DESC
  LIMIT _page_size;
$$;


-- ---------------------------------------------------------------------
-- 20260308082138_53ddeff6-027b-469d-b9ca-43503a85278a.sql
-- ---------------------------------------------------------------------


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


-- ---------------------------------------------------------------------
-- 20260308082533_1aacd450-7aef-45f1-afc0-6607352b66ea.sql
-- ---------------------------------------------------------------------


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


-- ---------------------------------------------------------------------
-- 20260308083309_00ab9b3d-2eae-4f30-a576-3a13e01d42dd.sql
-- ---------------------------------------------------------------------


-- Add verified column to profiles
ALTER TABLE public.profiles ADD COLUMN is_verified boolean NOT NULL DEFAULT false;

-- Function to check and auto-verify users with 100+ friends
CREATE OR REPLACE FUNCTION public.check_verification_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _friend_count integer;
BEGIN
  -- Only process accepted friendships
  IF NEW.status != 'accepted' THEN
    RETURN NEW;
  END IF;

  -- Check both users in the friendship
  FOR _user_id IN SELECT unnest(ARRAY[NEW.user_id, NEW.friend_id])
  LOOP
    -- Count accepted friendships
    SELECT COUNT(*) INTO _friend_count
    FROM friendships
    WHERE (user_id = _user_id OR friend_id = _user_id)
      AND status = 'accepted';

    -- Auto-verify if 100+ friends and not already verified
    IF _friend_count >= 100 THEN
      UPDATE profiles SET is_verified = true WHERE id = _user_id AND is_verified = false;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger on friendship status changes
CREATE TRIGGER on_friendship_check_verification
  AFTER INSERT OR UPDATE OF status ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.check_verification_eligibility();


-- ---------------------------------------------------------------------
-- 20260308083428_44836b99-26cd-42e9-b0a2-f92674daa5c0.sql
-- ---------------------------------------------------------------------


DROP FUNCTION public.get_ranked_posts(uuid, text, numeric, uuid, integer);

CREATE OR REPLACE FUNCTION public.get_ranked_posts(
  _user_id uuid,
  _feed_filter text DEFAULT 'all',
  _cursor_score numeric DEFAULT NULL,
  _cursor_id uuid DEFAULT NULL,
  _page_size int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  content text,
  image_url text,
  video_url text,
  created_at timestamptz,
  user_id uuid,
  profile_id uuid,
  profile_full_name text,
  profile_avatar_url text,
  profile_is_verified boolean,
  engagement_score numeric,
  reaction_count bigint,
  comment_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH friend_ids AS (
    SELECT CASE 
      WHEN f.user_id = _user_id THEN f.friend_id 
      ELSE f.user_id 
    END AS fid
    FROM friendships f
    WHERE (f.user_id = _user_id OR f.friend_id = _user_id)
      AND f.status = 'accepted'
  ),
  post_stats AS (
    SELECT 
      p.id,
      p.content,
      p.image_url,
      p.video_url,
      p.created_at,
      p.user_id,
      pr.id AS profile_id,
      pr.full_name AS profile_full_name,
      pr.avatar_url AS profile_avatar_url,
      pr.is_verified AS profile_is_verified,
      COALESCE(r.cnt, 0) AS reaction_count,
      COALESCE(c.cnt, 0) AS comment_count,
      (COALESCE(r.cnt, 0) * 2 + COALESCE(c.cnt, 0) * 3 + 
       GREATEST(0, 10.0 - EXTRACT(EPOCH FROM (now() - p.created_at)) / 8640.0)
      )::numeric AS engagement_score
    FROM posts p
    JOIN profiles pr ON pr.id = p.user_id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS cnt FROM reactions GROUP BY post_id
    ) r ON r.post_id = p.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS cnt FROM comments GROUP BY post_id
    ) c ON c.post_id = p.id
    WHERE (
      _feed_filter = 'all' 
      OR p.user_id = _user_id 
      OR p.user_id IN (SELECT fid FROM friend_ids)
    )
  )
  SELECT 
    ps.id, ps.content, ps.image_url, ps.video_url, ps.created_at, ps.user_id,
    ps.profile_id, ps.profile_full_name, ps.profile_avatar_url, ps.profile_is_verified,
    ps.engagement_score, ps.reaction_count, ps.comment_count
  FROM post_stats ps
  WHERE (
    _cursor_score IS NULL 
    OR (ps.engagement_score, ps.id) < (_cursor_score, _cursor_id)
  )
  ORDER BY ps.engagement_score DESC, ps.id DESC
  LIMIT _page_size;
$$;


-- ---------------------------------------------------------------------
-- 20260308083646_a3990cfd-2f67-4e74-b0d0-dcc890556148.sql
-- ---------------------------------------------------------------------


-- Create a trigger to notify users when they get verified
CREATE OR REPLACE FUNCTION public.notify_user_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when is_verified changes from false to true
  IF NEW.is_verified = true AND OLD.is_verified = false THEN
    INSERT INTO notifications (user_id, type, content, actor_id)
    VALUES (NEW.id, 'verification', '🎉 Congratulations! Your account has been verified. You now have a verified badge on your profile.', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_verified
  AFTER UPDATE OF is_verified ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_user_verified();


-- ---------------------------------------------------------------------
-- 20260308083758_6572019d-9ef3-4dc9-88f3-3a455176573b.sql
-- ---------------------------------------------------------------------


ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY['like','comment','friend_request','friend_accepted','message','verification']));


-- ---------------------------------------------------------------------
-- 20260308084301_605698ef-7eac-49c4-8eb7-c51de79d2519.sql
-- ---------------------------------------------------------------------


-- Add reply_to, edited, deleted_at, expires_at to messages for replies, edit, unsend, disappearing
ALTER TABLE public.messages 
  ADD COLUMN reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN edited boolean NOT NULL DEFAULT false,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN expires_at timestamptz;

-- Add chat_theme to a conversation preferences table
CREATE TABLE public.chat_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  other_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'default',
  disappearing_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, other_user_id)
);

ALTER TABLE public.chat_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chat prefs" ON public.chat_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat prefs" ON public.chat_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chat prefs" ON public.chat_preferences
  FOR UPDATE USING (auth.uid() = user_id);

-- Allow users to update (edit/delete) their own messages
CREATE POLICY "Users can update their own messages" ON public.messages
  FOR UPDATE USING (auth.uid() = sender_id);

-- Allow users to delete their own messages  
CREATE POLICY "Users can delete their own messages" ON public.messages
  FOR DELETE USING (auth.uid() = sender_id);


-- ---------------------------------------------------------------------
-- 20260308131639_6278f400-9483-47b7-be59-b095f8c069b9.sql
-- ---------------------------------------------------------------------


CREATE TABLE public.login_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_streak integer NOT NULL DEFAULT 1,
  longest_streak integer NOT NULL DEFAULT 1,
  last_login_date date NOT NULL DEFAULT CURRENT_DATE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.login_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own streak" ON public.login_streaks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own streak" ON public.login_streaks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own streak" ON public.login_streaks
  FOR UPDATE USING (auth.uid() = user_id);


-- ---------------------------------------------------------------------
-- 20260308132207_7c5e7143-4250-4d17-93a4-3100391527e6.sql
-- ---------------------------------------------------------------------


CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_type text NOT NULL,
  reported_id uuid NOT NULL,
  reason text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reports" ON public.reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view their own reports" ON public.reports
  FOR SELECT USING (auth.uid() = reporter_id);

CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_type text NOT NULL,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_type)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view achievements" ON public.user_achievements
  FOR SELECT USING (true);

CREATE POLICY "System inserts achievements" ON public.user_achievements
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ---------------------------------------------------------------------
-- 20260308212528_26496046-f14a-45cb-bed6-d9630cdf3440.sql
-- ---------------------------------------------------------------------


-- Ad credits system
CREATE TABLE public.ad_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  total_purchased integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_credits ADD CONSTRAINT unique_user_credits UNIQUE (user_id);
ALTER TABLE public.ad_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credits" ON public.ad_credits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own credits" ON public.ad_credits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own credits" ON public.ad_credits FOR UPDATE USING (auth.uid() = user_id);

-- Credit transactions log
CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  type text NOT NULL, -- 'purchase', 'spend', 'refund'
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transactions" ON public.credit_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON public.credit_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Ad campaigns
CREATE TABLE public.ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  image_url text,
  link_url text,
  cta_text text NOT NULL DEFAULT 'Learn More',
  status text NOT NULL DEFAULT 'draft', -- draft, active, paused, completed, exhausted
  budget_credits integer NOT NULL DEFAULT 0,
  spent_credits integer NOT NULL DEFAULT 0,
  target_gender text, -- all, male, female
  target_min_age integer,
  target_max_age integer,
  target_location text,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own campaigns" ON public.ad_campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create campaigns" ON public.ad_campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own campaigns" ON public.ad_campaigns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own campaigns" ON public.ad_campaigns FOR DELETE USING (auth.uid() = user_id);
-- Active ads viewable by everyone (for serving)
CREATE POLICY "Active ads viewable by all" ON public.ad_campaigns FOR SELECT USING (status = 'active');

-- Ad impressions tracking
CREATE TABLE public.ad_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_impressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert impressions" ON public.ad_impressions FOR INSERT WITH CHECK (true);
CREATE POLICY "Campaign owners can view impressions" ON public.ad_impressions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.ad_campaigns WHERE id = ad_impressions.campaign_id AND user_id = auth.uid())
);

-- Ad clicks tracking
CREATE TABLE public.ad_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert clicks" ON public.ad_clicks FOR INSERT WITH CHECK (true);
CREATE POLICY "Campaign owners can view clicks" ON public.ad_clicks FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.ad_campaigns WHERE id = ad_clicks.campaign_id AND user_id = auth.uid())
);


-- ---------------------------------------------------------------------
-- 20260308212542_cc539a27-05d0-40e0-8b83-226a3713ed17.sql
-- ---------------------------------------------------------------------


-- Fix overly permissive INSERT policies
DROP POLICY "Anyone can insert impressions" ON public.ad_impressions;
CREATE POLICY "Authenticated users can insert impressions" ON public.ad_impressions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "Anyone can insert clicks" ON public.ad_clicks;
CREATE POLICY "Authenticated users can insert clicks" ON public.ad_clicks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);


-- ---------------------------------------------------------------------
-- 20260308213343_4eec8a28-bd54-4b73-9fbc-884be5a0384e.sql
-- ---------------------------------------------------------------------


-- Add multi-image support to posts
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}';

-- Story reactions table
CREATE TABLE public.story_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, user_id)
);

ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view story reactions" ON public.story_reactions FOR SELECT USING (true);
CREATE POLICY "Users can add story reactions" ON public.story_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove story reactions" ON public.story_reactions FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update story reactions" ON public.story_reactions FOR UPDATE USING (auth.uid() = user_id);


-- ---------------------------------------------------------------------
-- 20260308214338_610b0156-fbfe-4b31-a45f-a51740c43b8d.sql
-- ---------------------------------------------------------------------


CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


-- ---------------------------------------------------------------------
-- 20260308214352_b471e26c-c1d6-49c1-908b-2ce181a84297.sql
-- ---------------------------------------------------------------------


-- RLS policies for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Admins are not seeded here (a hard-coded user id breaks fresh databases).
-- After signing up, make yourself admin from the SQL editor:
--   INSERT INTO public.user_roles (user_id, role)
--   SELECT id, 'admin' FROM auth.users WHERE email = 'you@example.com';

-- Admin access to reports
CREATE POLICY "Admins can view all reports" ON public.reports FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update reports" ON public.reports FOR UPDATE USING (has_role(auth.uid(), 'admin'));

-- Admin can delete any post
CREATE POLICY "Admins can delete any post" ON public.posts FOR DELETE USING (has_role(auth.uid(), 'admin'));


-- ---------------------------------------------------------------------
-- 20260308214736_775a7547-1cab-45cf-98c3-bef2d80eb8db.sql
-- ---------------------------------------------------------------------


-- Allow users to update their own comments
CREATE POLICY "Users can update their own comments"
  ON public.comments FOR UPDATE
  USING (auth.uid() = user_id);


-- ---------------------------------------------------------------------
-- 20260309105927_d3bdf8b8-d347-443b-b9ce-0dbaa0640f22.sql
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.increment_watch_views(_video_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Don't count views on own videos
  IF EXISTS (SELECT 1 FROM watch_videos WHERE id = _video_id AND user_id = _user_id) THEN
    RETURN;
  END IF;
  
  UPDATE watch_videos 
  SET views_count = views_count + 1 
  WHERE id = _video_id;
END;
$$;

-- ---------------------------------------------------------------------
-- 20260314153733_92e356ed-84cc-40d9-9192-f282d807aaca.sql
-- ---------------------------------------------------------------------

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.cleanup_expired_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM posts WHERE expires_at IS NOT NULL AND expires_at < now();
END;
$$;

-- ---------------------------------------------------------------------
-- 20260404102109_2c735b8d-16c1-4fdc-9c21-4955cd4e843f.sql
-- ---------------------------------------------------------------------


-- Anonymous Q&A table
CREATE TABLE public.anonymous_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT,
  answered_at TIMESTAMP WITH TIME ZONE,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.anonymous_questions ENABLE ROW LEVEL SECURITY;

-- Anyone can view public answered questions
CREATE POLICY "Anyone can view public answered questions"
ON public.anonymous_questions FOR SELECT
USING (is_public = true AND answer IS NOT NULL);

-- Profile owners can view all their questions
CREATE POLICY "Profile owners can view all questions"
ON public.anonymous_questions FOR SELECT
USING (auth.uid() = profile_id);

-- Anyone authenticated can ask questions
CREATE POLICY "Authenticated users can ask questions"
ON public.anonymous_questions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Profile owners can update (answer) their questions
CREATE POLICY "Profile owners can answer questions"
ON public.anonymous_questions FOR UPDATE
USING (auth.uid() = profile_id);

-- Profile owners can delete questions
CREATE POLICY "Profile owners can delete questions"
ON public.anonymous_questions FOR DELETE
USING (auth.uid() = profile_id);

-- Tips table for creator monetization
CREATE TABLE public.post_tips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  tipper_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  amount INTEGER NOT NULL DEFAULT 1,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.post_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tips" ON public.post_tips FOR SELECT USING (true);
CREATE POLICY "Authenticated users can tip" ON public.post_tips FOR INSERT TO authenticated WITH CHECK (auth.uid() = tipper_id);
CREATE POLICY "Users can view received tips" ON public.post_tips FOR SELECT USING (auth.uid() = receiver_id);


-- ---------------------------------------------------------------------
-- 20260405153616_eb4027e8-cc08-4863-8b2a-25f83a213a4c.sql
-- ---------------------------------------------------------------------


-- Voice Rooms
CREATE TABLE public.voice_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL DEFAULT 'Voice Room',
  created_by UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.voice_room_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.voice_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  is_speaker BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- Creator Subscriptions
CREATE TYPE public.subscription_tier AS ENUM ('supporter', 'superfan', 'vip');

CREATE TABLE public.creator_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL,
  tier subscription_tier NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_credits INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(creator_id, tier)
);

CREATE TABLE public.creator_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscriber_id UUID NOT NULL,
  creator_id UUID NOT NULL,
  tier_id UUID REFERENCES public.creator_tiers(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE(subscriber_id, creator_id)
);

-- RLS
ALTER TABLE public.voice_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_subscriptions ENABLE ROW LEVEL SECURITY;

-- Voice rooms: anyone authenticated can view/join active rooms
CREATE POLICY "Anyone can view active voice rooms" ON public.voice_rooms FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Group members can create voice rooms" ON public.voice_rooms FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creator can update voice room" ON public.voice_rooms FOR UPDATE TO authenticated USING (auth.uid() = created_by);

CREATE POLICY "Anyone can view participants" ON public.voice_room_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can join rooms" ON public.voice_room_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave rooms" ON public.voice_room_participants FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own status" ON public.voice_room_participants FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Creator tiers: public read, creator manages own
CREATE POLICY "Anyone can view creator tiers" ON public.creator_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Creators manage own tiers" ON public.creator_tiers FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators update own tiers" ON public.creator_tiers FOR UPDATE TO authenticated USING (auth.uid() = creator_id);

-- Subscriptions
CREATE POLICY "Users can view own subscriptions" ON public.creator_subscriptions FOR SELECT TO authenticated USING (auth.uid() = subscriber_id OR auth.uid() = creator_id);
CREATE POLICY "Users can subscribe" ON public.creator_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = subscriber_id);
CREATE POLICY "Users can cancel own subscription" ON public.creator_subscriptions FOR UPDATE TO authenticated USING (auth.uid() = subscriber_id);

-- Enable realtime for voice rooms
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_room_participants;


-- ---------------------------------------------------------------------
-- 20261004090000_not_null_defaulted_columns.sql
-- ---------------------------------------------------------------------

-- These columns all have defaults, but were created nullable, which forces every
-- client to handle a null that never actually happens. Backfill and tighten them.

DO $$
DECLARE
  col record;
BEGIN
  FOR col IN
    SELECT * FROM (VALUES
      ('album_photos', 'created_at'),
      ('albums', 'created_at'),
      ('blocks', 'created_at'),
      ('comments', 'created_at'),
      ('friendships', 'created_at'),
      ('friendships', 'updated_at'),
      ('likes', 'created_at'),
      ('messages', 'created_at'),
      ('messages', 'read'),
      ('notification_preferences', 'created_at'),
      ('notification_preferences', 'updated_at'),
      ('notifications', 'created_at'),
      ('notifications', 'read'),
      ('posts', 'created_at'),
      ('profiles', 'created_at'),
      ('reactions', 'created_at'),
      ('reel_comments', 'created_at'),
      ('reel_likes', 'created_at'),
      ('reels', 'likes_count'),
      ('reels', 'shares_count'),
      ('reels', 'views_count')
    ) AS t(table_name, column_name)
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET %I = DEFAULT WHERE %I IS NULL',
      col.table_name, col.column_name, col.column_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I SET NOT NULL',
      col.table_name, col.column_name
    );
  END LOOP;
END $$;

