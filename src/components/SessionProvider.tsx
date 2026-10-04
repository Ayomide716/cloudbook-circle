import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { SessionContext } from "@/lib/session-context";

/** Reads the Supabase session once for the whole app and keeps it in sync. */
const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
};

export default SessionProvider;
