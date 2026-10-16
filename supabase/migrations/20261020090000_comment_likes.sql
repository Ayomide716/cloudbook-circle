-- Liking a comment, as on Facebook: "Like" under each comment, a count, and a notification
-- for the comment's author ("Ayo liked your comment").
CREATE TABLE IF NOT EXISTS public.comment_likes (
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);
CREATE INDEX IF NOT EXISTS comment_likes_user_idx ON public.comment_likes (user_id);
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comment likes are viewable by everyone" ON public.comment_likes;
CREATE POLICY "Comment likes are viewable by everyone"
  ON public.comment_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "People like comments as themselves" ON public.comment_likes;
CREATE POLICY "People like comments as themselves"
  ON public.comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "People remove their own comment likes" ON public.comment_likes;
CREATE POLICY "People remove their own comment likes"
  ON public.comment_likes FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.notify_comment_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  author uuid;
  post uuid;
  liker_name text;
BEGIN
  SELECT c.user_id, c.post_id INTO author, post FROM comments c WHERE c.id = NEW.comment_id;
  IF author IS NULL OR author = NEW.user_id THEN RETURN NEW; END IF;
  SELECT full_name INTO liker_name FROM profiles WHERE id = NEW.user_id;
  INSERT INTO notifications (user_id, type, content, related_id, actor_id)
  VALUES (author, 'like', COALESCE(liker_name, 'Someone') || ' liked your comment', post, NEW.user_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- A notification problem never stops the like.
END;
$$;

DROP TRIGGER IF EXISTS on_comment_like_created ON public.comment_likes;
CREATE TRIGGER on_comment_like_created
  AFTER INSERT ON public.comment_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_comment_like();
