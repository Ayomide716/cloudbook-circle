import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SessionContext } from "@/lib/session-context";

/** The signed-in user's name and photo, fetched once and shared by every component. */
export function useMyProfile() {
  const userId = useContext(SessionContext)?.user.id;
  const { data } = useQuery({
    queryKey: ["my-profile", userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", userId!).maybeSingle();
      return data;
    },
  });
  return data ?? null;
}
