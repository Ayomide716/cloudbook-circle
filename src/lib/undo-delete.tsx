import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { cancelDelete, deleteLater, hideEverywhere, showAgain } from "./pending-deletes";

/**
 * Facebook's way for things you can get back: no "Are you sure?", it goes at once with
 * "Reel deleted · Undo" at the bottom. It's really deleted 5 seconds later (or when the app is
 * closed, whichever is first). Things that can't be brought back still ask first (ConfirmDialog).
 */
export async function deleteWithUndo({
  table, id, title, onHide, onRestore,
}: {
  table: "reels";
  id: string;
  /** "Reel deleted" */
  title: string;
  onHide: () => void;
  onRestore: () => void;
}) {
  onHide();
  hideEverywhere(id);
  const { data: { session } } = await supabase.auth.getSession();
  deleteLater(id, 5000, {
    run: async () => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) {
        showAgain(id);
        onRestore();
        toast({ title: "Couldn't delete it. Try again.", variant: "destructive" });
      }
    },
    url: `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session?.access_token ?? ""}` },
  });
  toast({
    title,
    duration: 5000,
    action: (
      <ToastAction
        altText="Undo delete"
        onClick={() => {
          cancelDelete(id);
          showAgain(id);
          onRestore();
        }}
      >
        Undo
      </ToastAction>
    ),
  });
}
