
-- Anonymous Q&A table
CREATE TABLE public.anonymous_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT,
  answered_at TIMESTAMP WITH TIME ZONE,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.anonymous_questions ENABLE ROW LEVEL SECURITY;

-- Anyone can view public answered questions
CREATE POLICY "Anyone can view public answered questions"
ON public.anonymous_questions FOR SELECT
USING (is_public = true AND answer IS NOT NULL);

-- Profile owners can view all their questions
CREATE POLICY "Profile owners can view all questions"
ON public.anonymous_questions FOR SELECT
USING (auth.uid() = profile_id);

-- Anyone authenticated can ask questions
CREATE POLICY "Authenticated users can ask questions"
ON public.anonymous_questions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Profile owners can update (answer) their questions
CREATE POLICY "Profile owners can answer questions"
ON public.anonymous_questions FOR UPDATE
USING (auth.uid() = profile_id);

-- Profile owners can delete questions
CREATE POLICY "Profile owners can delete questions"
ON public.anonymous_questions FOR DELETE
USING (auth.uid() = profile_id);

-- Tips table for creator monetization
CREATE TABLE public.post_tips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  tipper_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  amount INTEGER NOT NULL DEFAULT 1,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.post_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tips" ON public.post_tips FOR SELECT USING (true);
CREATE POLICY "Authenticated users can tip" ON public.post_tips FOR INSERT TO authenticated WITH CHECK (auth.uid() = tipper_id);
CREATE POLICY "Users can view received tips" ON public.post_tips FOR SELECT USING (auth.uid() = receiver_id);
