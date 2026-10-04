import { createContext } from "react";
import type { Session } from "@supabase/supabase-js";

/** `undefined` while the stored session is still being read, then a session or `null`. */
export const SessionContext = createContext<Session | null | undefined>(undefined);
