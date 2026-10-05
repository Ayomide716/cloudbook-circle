-- Details Facebook-style profiles and posts show:
-- "From <hometown>", birthday and relationship on the profile; "<place> · 2h" on posts.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hometown text,
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS relationship_status text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_relationship_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_relationship_status_check
  CHECK (relationship_status IS NULL OR relationship_status IN
    ('single', 'in_a_relationship', 'engaged', 'married', 'its_complicated'));

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_location_length;
ALTER TABLE public.posts ADD CONSTRAINT posts_location_length CHECK (location IS NULL OR char_length(location) <= 80);
