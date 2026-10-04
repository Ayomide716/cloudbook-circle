-- Ending a voice room sets is_active = false. The only SELECT policy shows active rooms,
-- and Postgres requires an updated row to stay visible, so the update was always refused.
-- Let creators see their own rooms (active or not) so they can end them.
CREATE POLICY "Creators can view their own voice rooms"
  ON public.voice_rooms
  FOR SELECT
  USING (auth.uid() = created_by);
