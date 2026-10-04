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
