
-- Fix overly permissive INSERT policies
DROP POLICY "Anyone can insert impressions" ON public.ad_impressions;
CREATE POLICY "Authenticated users can insert impressions" ON public.ad_impressions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "Anyone can insert clicks" ON public.ad_clicks;
CREATE POLICY "Authenticated users can insert clicks" ON public.ad_clicks FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
