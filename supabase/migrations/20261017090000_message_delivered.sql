-- "Delivered" ticks, as on WhatsApp: two grey ticks once the message has reached the other
-- person's app (they had CloudBook open somewhere), blue once they've read it.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Messages already read were delivered too.
UPDATE public.messages SET delivered_at = created_at WHERE read AND delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_undelivered ON public.messages (receiver_id) WHERE delivered_at IS NULL;

-- Called by the receiver's app: marks everything sent to them as delivered. It only touches
-- the caller's own incoming messages and only that one column.
CREATE OR REPLACE FUNCTION public.mark_messages_delivered()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE messages SET delivered_at = now()
  WHERE receiver_id = auth.uid() AND delivered_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.mark_messages_delivered() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_messages_delivered() TO authenticated;
