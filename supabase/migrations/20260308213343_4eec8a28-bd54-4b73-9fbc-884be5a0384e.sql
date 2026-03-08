
-- Add multi-image support to posts
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_urls text[] DEFAULT '{}';

-- Story reactions table
CREATE TABLE public.story_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, user_id)
);

ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view story reactions" ON public.story_reactions FOR SELECT USING (true);
CREATE POLICY "Users can add story reactions" ON public.story_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove story reactions" ON public.story_reactions FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update story reactions" ON public.story_reactions FOR UPDATE USING (auth.uid() = user_id);
