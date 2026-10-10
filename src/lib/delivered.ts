import { supabase } from "@/integrations/supabase/client";

let pending: Promise<void> | null = null;
let again = false;

/**
 * Tells senders their messages reached this app (their grey double ticks). Called whenever the
 * app opens, comes back on screen, or hears about a new message. Calls that arrive while one
 * is in flight are folded into a single follow-up.
 */
export function markMessagesDelivered() {
  if (pending) { again = true; return; }
  pending = (async () => {
    // Before the database update this just fails quietly.
    await supabase.rpc("mark_messages_delivered");
  })().finally(() => {
    pending = null;
    if (again) { again = false; markMessagesDelivered(); }
  });
}
