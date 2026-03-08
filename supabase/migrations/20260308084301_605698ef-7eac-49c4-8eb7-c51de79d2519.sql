
-- Add reply_to, edited, deleted_at, expires_at to messages for replies, edit, unsend, disappearing
ALTER TABLE public.messages 
  ADD COLUMN reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN edited boolean NOT NULL DEFAULT false,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN expires_at timestamptz;

-- Add chat_theme to a conversation preferences table
CREATE TABLE public.chat_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  other_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'default',
  disappearing_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, other_user_id)
);

ALTER TABLE public.chat_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chat prefs" ON public.chat_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat prefs" ON public.chat_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chat prefs" ON public.chat_preferences
  FOR UPDATE USING (auth.uid() = user_id);

-- Allow users to update (edit/delete) their own messages
CREATE POLICY "Users can update their own messages" ON public.messages
  FOR UPDATE USING (auth.uid() = sender_id);

-- Allow users to delete their own messages  
CREATE POLICY "Users can delete their own messages" ON public.messages
  FOR DELETE USING (auth.uid() = sender_id);
