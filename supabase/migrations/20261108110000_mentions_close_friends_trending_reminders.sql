-- November 2026 features: @mentions that notify, close friends for stories, trending hashtags,
-- and event reminders by push. (Post drafts live on the phone, so they need nothing here.)

-- ── @mentions ──────────────────────────────────────────────────────────────────────────────
-- The app writes a mention as @[Name](user id). When a post or comment with mentions is
-- created, each person mentioned gets a notification (and so a push): at most 10 a time,
-- never yourself, never across a block.
CREATE OR REPLACE FUNCTION public.notify_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mentioned uuid;
  author_name text;
  post_id uuid;
  what text;
BEGIN
  IF NEW.content IS NULL OR position('@[' in NEW.content) = 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name, 'Someone') INTO author_name FROM profiles WHERE id = NEW.user_id;
  IF TG_TABLE_NAME = 'posts' THEN
    post_id := NEW.id; what := 'a post';
  ELSE
    post_id := NEW.post_id; what := 'a comment';
  END IF;
  FOR mentioned IN
    SELECT DISTINCT (m[1])::uuid
    FROM regexp_matches(NEW.content, '@\[[^\]\n]{1,80}\]\(([0-9a-fA-F-]{36})\)', 'g') AS m
    LIMIT 10
  LOOP
    CONTINUE WHEN mentioned = NEW.user_id;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE id = mentioned);
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM blocks
      WHERE (blocker_id = mentioned AND blocked_id = NEW.user_id) OR (blocker_id = NEW.user_id AND blocked_id = mentioned)
    );
    INSERT INTO notifications (user_id, type, content, related_id, actor_id)
    VALUES (mentioned, 'mention', author_name || ' mentioned you in ' || what, post_id, NEW.user_id);
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- a mention must never stop the post or comment itself
END;
$$;

DROP TRIGGER IF EXISTS notify_mentions_on_post ON public.posts;
CREATE TRIGGER notify_mentions_on_post AFTER INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.notify_mentions();
DROP TRIGGER IF EXISTS notify_mentions_on_comment ON public.comments;
CREATE TRIGGER notify_mentions_on_comment AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_mentions();

-- ── Close friends for stories ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.close_friends (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);
ALTER TABLE public.close_friends ENABLE ROW LEVEL SECURITY;
-- Your list is yours alone: nobody can see whether they're on it.
DROP POLICY IF EXISTS "Your close friends list" ON public.close_friends;
CREATE POLICY "Your close friends list" ON public.close_friends
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.is_friend_of(friend_id));

ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'everyone';
ALTER TABLE public.stories DROP CONSTRAINT IF EXISTS stories_audience_check;
ALTER TABLE public.stories ADD CONSTRAINT stories_audience_check CHECK (audience IN ('everyone', 'close_friends'));

-- Whether you're on this person's close friends list (without showing anyone the list).
CREATE OR REPLACE FUNCTION public.is_close_friend_of(_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM close_friends WHERE user_id = _owner AND friend_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_close_friend_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_close_friend_of(uuid) TO authenticated;

DROP POLICY IF EXISTS "Close friends stories" ON public.stories;
CREATE POLICY "Close friends stories" ON public.stories AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (audience = 'everyone' OR user_id = auth.uid() OR public.is_close_friend_of(user_id));

-- ── Trending hashtags ──────────────────────────────────────────────────────────────────────
-- The most used #tags in recent posts. Runs as the person asking, so blocked people's posts
-- don't count for them.
CREATE OR REPLACE FUNCTION public.trending_hashtags(_days integer DEFAULT 7, _limit integer DEFAULT 10)
RETURNS TABLE (tag text, posts bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT lower(m[1]) AS tag, count(DISTINCT p.id) AS posts
  FROM posts p, regexp_matches(p.content, '#(\w{2,40})', 'g') AS m
  WHERE p.created_at > now() - make_interval(days => LEAST(GREATEST(_days, 1), 30))
    AND p.content LIKE '%#%'
  GROUP BY 1
  ORDER BY 2 DESC, 1
  LIMIT LEAST(GREATEST(_limit, 1), 30);
$$;
REVOKE ALL ON FUNCTION public.trending_hashtags(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trending_hashtags(integer, integer) TO authenticated;
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON public.posts (created_at DESC);

-- ── Event reminders by push ────────────────────────────────────────────────────────────────
-- A day before and an hour before, everyone going or interested (and the host) gets a
-- notification, which the push trigger sends to their phone. Each reminder once.
CREATE TABLE IF NOT EXISTS public.event_reminders_sent (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('day', 'hour')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id, kind)
);
ALTER TABLE public.event_reminders_sent ENABLE ROW LEVEL SECURITY; -- server only: no policies

CREATE OR REPLACE FUNCTION public.send_event_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sent integer := 0;
  r record;
BEGIN
  FOR r IN
    WITH due AS (
      SELECT e.id, e.name, e.start_date, e.location,
             CASE WHEN e.start_date <= now() + interval '75 minutes' THEN 'hour' ELSE 'day' END AS kind
      FROM events e
      WHERE (e.start_date > now() AND e.start_date <= now() + interval '75 minutes')
         OR (e.start_date > now() + interval '23 hours' AND e.start_date <= now() + interval '25 hours')
    ),
    people AS (
      SELECT d.*, rs.user_id FROM due d JOIN event_rsvps rs ON rs.event_id = d.id AND rs.status IN ('going', 'interested')
      UNION
      SELECT d.*, e.created_by FROM due d JOIN events e ON e.id = d.id WHERE e.created_by IS NOT NULL
    ),
    fresh AS (
      INSERT INTO event_reminders_sent (event_id, user_id, kind)
      SELECT id, user_id, kind FROM people
      ON CONFLICT DO NOTHING
      RETURNING event_id, user_id, kind
    )
    SELECT f.user_id, f.kind, p.id, p.name, p.location
    FROM fresh f JOIN people p ON p.id = f.event_id AND p.user_id = f.user_id
  LOOP
    INSERT INTO notifications (user_id, type, content, related_id)
    VALUES (
      r.user_id, 'event_reminder',
      r.name || CASE WHEN r.kind = 'hour' THEN ' starts within the hour' ELSE ' is tomorrow' END
        || COALESCE(' at ' || NULLIF(r.location, ''), ''),
      r.id
    );
    sent := sent + 1;
  END LOOP;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.send_event_reminders() FROM PUBLIC, anon, authenticated;

-- Push links for the new kinds of notification.
CREATE OR REPLACE FUNCTION private.push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link TEXT;
BEGIN
  link := CASE
    WHEN NEW.type IN ('like', 'comment', 'share', 'mention') AND NEW.related_id IS NOT NULL THEN '/post/' || NEW.related_id
    WHEN NEW.type IN ('friend_request', 'friend_accepted') THEN '/friends'
    WHEN NEW.type IN ('group_added', 'group_invite') THEN '/groups'
    WHEN NEW.type = 'event_reminder' THEN '/events'
    WHEN NEW.type = 'usage_alert' THEN '/admin'
    ELSE '/notifications'
  END;
  PERFORM private.queue_push(NEW.user_id, NEW.type, 'Ember', NEW.content, link, 'n-' || NEW.type || '-' || coalesce(NEW.related_id::text, NEW.id::text));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- Every 15 minutes, with pg_cron where the project has it.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ember-event-reminders';
  PERFORM cron.schedule('ember-event-reminders', '*/15 * * * *', 'SELECT public.send_event_reminders()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron is not available here, so event reminders are not scheduled: %', SQLERRM;
END;
$$;
