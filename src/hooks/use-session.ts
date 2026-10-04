import { useContext } from "react";
import { SessionContext } from "@/lib/session-context";

/** Current Supabase session: `undefined` while loading, otherwise a session or `null`. */
export const useSession = () => useContext(SessionContext);
