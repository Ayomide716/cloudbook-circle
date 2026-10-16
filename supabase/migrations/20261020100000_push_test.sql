-- "Test push notifications" (Admin dashboard): sends you a test alert through the same path as
-- real ones, and reports each step, so a broken setup says where it's broken.

-- Checks the setup and queues a test push to yourself. Returns what it found, and the id of the
-- request to send-push (to read its answer with push_test_result).
CREATE OR REPLACE FUNCTION public.push_test()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  me uuid := auth.uid();
  fn_url text;
  fn_secret text;
  fcm int;
  web int;
  push_on boolean;
  req bigint;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  SELECT count(*) FILTER (WHERE endpoint LIKE 'https://fcm.googleapis.com/v1/ember-device/%'),
         count(*) FILTER (WHERE endpoint NOT LIKE 'https://fcm.googleapis.com/v1/ember-device/%')
    INTO fcm, web
    FROM public.push_subscriptions WHERE user_id = me;
  SELECT push_enabled INTO push_on FROM public.notification_preferences WHERE user_id = me;

  BEGIN
    EXECUTE 'SELECT function_url, secret FROM private.push_config WHERE id = 1' INTO fn_url, fn_secret;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RETURN jsonb_build_object('setup', false, 'fcm', fcm, 'web', web, 'push_enabled', coalesce(push_on, true));
  END;
  IF fn_url IS NULL THEN
    RETURN jsonb_build_object('setup', true, 'config', false, 'fcm', fcm, 'web', web, 'push_enabled', coalesce(push_on, true));
  END IF;

  SELECT net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || fn_secret),
    body := jsonb_build_object('user_id', me, 'title', 'Ember', 'body', 'Test notification: push works 🎉', 'url', '/notifications', 'tag', 'push-test')
  ) INTO req;

  RETURN jsonb_build_object('setup', true, 'config', true, 'fcm', fcm, 'web', web,
    'push_enabled', coalesce(push_on, true), 'request', req, 'function_url', fn_url);
END;
$$;

-- What send-push answered to a test (null until it has answered). Written so this file runs
-- even where push was never set up (no pg_net yet).
CREATE OR REPLACE FUNCTION public.push_test_result(_request bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  EXECUTE 'SELECT jsonb_build_object(''status'', status_code, ''body'', left(content::text, 600), ''error'', error_msg, ''timed_out'', timed_out)
           FROM net._http_response WHERE id = $1'
    INTO result USING _request;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.push_test() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.push_test_result(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_test() TO authenticated;
GRANT EXECUTE ON FUNCTION public.push_test_result(bigint) TO authenticated;
