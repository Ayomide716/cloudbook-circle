
-- Ad credits system
CREATE TABLE public.ad_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  total_purchased integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_credits ADD CONSTRAINT unique_user_credits UNIQUE (user_id);
ALTER TABLE public.ad_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credits" ON public.ad_credits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own credits" ON public.ad_credits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own credits" ON public.ad_credits FOR UPDATE USING (auth.uid() = user_id);

-- Credit transactions log
CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  type text NOT NULL, -- 'purchase', 'spend', 'refund'
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transactions" ON public.credit_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON public.credit_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Ad campaigns
CREATE TABLE public.ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  image_url text,
  link_url text,
  cta_text text NOT NULL DEFAULT 'Learn More',
  status text NOT NULL DEFAULT 'draft', -- draft, active, paused, completed, exhausted
  budget_credits integer NOT NULL DEFAULT 0,
  spent_credits integer NOT NULL DEFAULT 0,
  target_gender text, -- all, male, female
  target_min_age integer,
  target_max_age integer,
  target_location text,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own campaigns" ON public.ad_campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create campaigns" ON public.ad_campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own campaigns" ON public.ad_campaigns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own campaigns" ON public.ad_campaigns FOR DELETE USING (auth.uid() = user_id);
-- Active ads viewable by everyone (for serving)
CREATE POLICY "Active ads viewable by all" ON public.ad_campaigns FOR SELECT USING (status = 'active');

-- Ad impressions tracking
CREATE TABLE public.ad_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_impressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert impressions" ON public.ad_impressions FOR INSERT WITH CHECK (true);
CREATE POLICY "Campaign owners can view impressions" ON public.ad_impressions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.ad_campaigns WHERE id = ad_impressions.campaign_id AND user_id = auth.uid())
);

-- Ad clicks tracking
CREATE TABLE public.ad_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert clicks" ON public.ad_clicks FOR INSERT WITH CHECK (true);
CREATE POLICY "Campaign owners can view clicks" ON public.ad_clicks FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.ad_campaigns WHERE id = ad_clicks.campaign_id AND user_id = auth.uid())
);
