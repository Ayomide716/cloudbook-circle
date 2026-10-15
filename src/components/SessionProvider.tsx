import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { SessionContext } from "@/lib/session-context";
import { claimReferral } from "@/lib/referral";

/** Reads the Supabase session once for the whole app and keeps it in sync. */
const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  // Signed up from an invite link: say hello to whoever invited them (lib/referral).
  const userId = session?.user.id;
  useEffect(() => {
    if (session?.user) void claimReferral(session.user).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per signed-in user
  }, [userId]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
};

export default SessionProvider;
