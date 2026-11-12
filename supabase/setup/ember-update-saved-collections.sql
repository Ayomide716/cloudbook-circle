-- Ember update: saved collections. Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run more than once.

-- Saved collections: folders for saved posts ("Recipes", "Ideas"), as on Facebook and Instagram.
-- Each person's collections are private to them. A saved post sits in at most one collection;
-- deleting a collection keeps its posts saved (they go back to All saved).

CREATE TABLE IF NOT EXISTS public.saved_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_collections_user_idx ON public.saved_collections (user_id, created_at);

ALTER TABLE public.saved_collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "People manage their own collections" ON public.saved_collections;
CREATE POLICY "People manage their own collections" ON public.saved_collections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.saved_posts
  ADD COLUMN IF NOT EXISTS collection_id uuid REFERENCES public.saved_collections(id) ON DELETE SET NULL;

-- Moving a saved post between collections is an update of your own row, into your own collection.
DROP POLICY IF EXISTS "Users can move their saved posts" ON public.saved_posts;
CREATE POLICY "Users can move their saved posts" ON public.saved_posts
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (collection_id IS NULL OR EXISTS (
      SELECT 1 FROM public.saved_collections c WHERE c.id = collection_id AND c.user_id = auth.uid()
    ))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_collections TO authenticated;
