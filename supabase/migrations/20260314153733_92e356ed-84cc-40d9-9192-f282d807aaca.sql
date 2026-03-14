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