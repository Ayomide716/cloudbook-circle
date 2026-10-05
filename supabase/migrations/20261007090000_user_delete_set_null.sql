-- Deleting a user failed for anyone who had ever triggered a notification
-- (liked, commented, sent a friend request) or seen an ad: these links had no
-- ON DELETE rule. Keep the rows but forget who it was, so the account can go.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_actor_id_fkey;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.ad_impressions DROP CONSTRAINT IF EXISTS ad_impressions_user_id_fkey;
ALTER TABLE public.ad_impressions
  ADD CONSTRAINT ad_impressions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.ad_clicks DROP CONSTRAINT IF EXISTS ad_clicks_user_id_fkey;
ALTER TABLE public.ad_clicks
  ADD CONSTRAINT ad_clicks_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
