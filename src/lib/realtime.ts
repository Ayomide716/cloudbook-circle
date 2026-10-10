import { supabase } from "@/integrations/supabase/client";

let count = 0;

/**
 * A channel for listening to database changes, with a name of its own.
 *
 * supabase.channel(name) hands back the existing channel when one with that name is still
 * around, even one that is closing. A screen that re-subscribes (or two parts of a page
 * that listen to the same thing) then shared a dying channel and stopped hearing about new
 * messages until the page was reloaded. Database changes don't depend on the channel's name,
 * so each subscription gets a unique one. (Presence and broadcast channels need the shared
 * name and must not use this.)
 */
export const dbChannel = (name: string) => supabase.channel(`${name}:${Date.now().toString(36)}-${(count++).toString(36)}`);
