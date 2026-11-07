-- How close Ember is to the Supabase free plan's limits, for the Admin page, and a daily check
-- on the server that tells admins (a notification) once something passes 80%.
-- The database can measure its own size and how many people signed in this month; bandwidth
-- (egress) is only on Supabase's usage page, which the Admin card links to.

-- Notifications get three new kinds this month: usage alerts, @mentions and event reminders.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'like', 'comment', 'friend_request', 'friend_accepted', 'message', 'verification', 'group_added',
  'group_invite', 'tag', 'usage_alert', 'mention', 'event_reminder'
]));

CREATE OR REPLACE FUNCTION public.admin_usage()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can see usage' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'db_limit_bytes', 500 * 1024 * 1024,
    'monthly_users', (SELECT count(*) FROM auth.users WHERE last_sign_in_at > now() - interval '30 days'),
    'monthly_users_limit', 50000,
    'total_users', (SELECT count(*) FROM auth.users),
    'largest_tables', COALESCE((
      SELECT jsonb_agg(t ORDER BY (t->>'bytes')::bigint DESC)
      FROM (
        SELECT jsonb_build_object('name', c.relname, 'bytes', pg_total_relation_size(c.oid)) AS t
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 6
      ) s
    ), '[]'::jsonb),
    'checked_at', now()
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_usage() TO authenticated;

-- Once a day: past 80% of a limit, each admin gets a notification (at most one a day each).
CREATE OR REPLACE FUNCTION public.check_usage_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u jsonb := public.admin_usage();
  db_pct numeric := round(100.0 * (u->>'db_bytes')::numeric / (u->>'db_limit_bytes')::numeric);
  mau_pct numeric := round(100.0 * (u->>'monthly_users')::numeric / (u->>'monthly_users_limit')::numeric);
  message text;
BEGIN
  IF db_pct < 80 AND mau_pct < 80 THEN RETURN; END IF;
  message := 'Supabase usage: '
    || CASE WHEN db_pct >= 80 THEN 'database ' || db_pct || '% full' ELSE '' END
    || CASE WHEN db_pct >= 80 AND mau_pct >= 80 THEN ', ' ELSE '' END
    || CASE WHEN mau_pct >= 80 THEN 'monthly users at ' || mau_pct || '% of the limit' ELSE '' END
    || '. Open Admin to see more.';
  INSERT INTO notifications (user_id, type, content)
  SELECT r.user_id, 'usage_alert', message
  FROM user_roles r
  WHERE r.role = 'admin'
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = r.user_id AND n.type = 'usage_alert' AND n.created_at > now() - interval '20 hours'
    );
END;
$$;
REVOKE ALL ON FUNCTION public.check_usage_limits() FROM PUBLIC, anon, authenticated;

-- Run it every morning (07:10 UTC) with pg_cron, where the project has it.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ember-usage-check';
  PERFORM cron.schedule('ember-usage-check', '10 7 * * *', 'SELECT public.check_usage_limits()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron is not available here, so the daily usage check is not scheduled: %', SQLERRM;
END;
$$;
