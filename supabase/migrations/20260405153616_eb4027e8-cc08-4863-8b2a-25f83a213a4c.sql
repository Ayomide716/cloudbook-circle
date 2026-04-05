
-- Voice Rooms
CREATE TABLE public.voice_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL DEFAULT 'Voice Room',
  created_by UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.voice_room_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.voice_rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  is_speaker BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- Creator Subscriptions
CREATE TYPE public.subscription_tier AS ENUM ('supporter', 'superfan', 'vip');

CREATE TABLE public.creator_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL,
  tier subscription_tier NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_credits INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(creator_id, tier)
);

CREATE TABLE public.creator_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscriber_id UUID NOT NULL,
  creator_id UUID NOT NULL,
  tier_id UUID REFERENCES public.creator_tiers(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE(subscriber_id, creator_id)
);

-- RLS
ALTER TABLE public.voice_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_subscriptions ENABLE ROW LEVEL SECURITY;

-- Voice rooms: anyone authenticated can view/join active rooms
CREATE POLICY "Anyone can view active voice rooms" ON public.voice_rooms FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Group members can create voice rooms" ON public.voice_rooms FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creator can update voice room" ON public.voice_rooms FOR UPDATE TO authenticated USING (auth.uid() = created_by);

CREATE POLICY "Anyone can view participants" ON public.voice_room_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can join rooms" ON public.voice_room_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave rooms" ON public.voice_room_participants FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own status" ON public.voice_room_participants FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Creator tiers: public read, creator manages own
CREATE POLICY "Anyone can view creator tiers" ON public.creator_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Creators manage own tiers" ON public.creator_tiers FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators update own tiers" ON public.creator_tiers FOR UPDATE TO authenticated USING (auth.uid() = creator_id);

-- Subscriptions
CREATE POLICY "Users can view own subscriptions" ON public.creator_subscriptions FOR SELECT TO authenticated USING (auth.uid() = subscriber_id OR auth.uid() = creator_id);
CREATE POLICY "Users can subscribe" ON public.creator_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = subscriber_id);
CREATE POLICY "Users can cancel own subscription" ON public.creator_subscriptions FOR UPDATE TO authenticated USING (auth.uid() = subscriber_id);

-- Enable realtime for voice rooms
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_room_participants;
