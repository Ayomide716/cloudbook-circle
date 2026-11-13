-- Ember fix: live updates (new messages, chat colours, likes, notifications arriving instantly).
-- Paste this whole file into Supabase → SQL Editor → Run. Safe to run more than once; it only
-- turns live updates on for tables where they're missing, and changes no data.
--
-- Why: Supabase only sends a change to the app straight away if the table is in its
-- "supabase_realtime" list. If a table is missing (for example after copying the database to a
-- new project), the app only catches up every 15 seconds or so.

DO $$
DECLARE
  t text;
  wanted text[] := ARRAY[
    'messages', 'message_reactions', 'message_votes', 'chat_pins', 'chat_themes',
    'group_messages', 'group_message_reactions', 'group_message_votes', 'group_pins',
    'group_members', 'group_invites', 'group_posts', 'groups',
    'notifications', 'friendships', 'user_status',
    'posts', 'comments', 'likes', 'reactions', 'poll_votes',
    'reels', 'reel_comments', 'reel_likes', 'stories', 'watch_videos',
    'events', 'event_rsvps', 'voice_rooms', 'voice_room_participants'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH t IN ARRAY wanted LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Live updates turned on for %', t;
    END IF;
  END LOOP;
END $$;

-- What's on now (every table above that exists should be listed):
SELECT tablename AS live_updates_on
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
ORDER BY tablename;
