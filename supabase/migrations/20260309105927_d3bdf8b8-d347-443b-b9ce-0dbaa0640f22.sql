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