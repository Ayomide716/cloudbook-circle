import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { CheckCheck, Clock } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/utils";
import { forgetLastSeen } from "@/lib/last-seen";

/**
 * WhatsApp's two chat privacy switches: last seen, and read receipts. As there, turning one
 * off also means you don't see other people's.
 */
const ChatPrivacy = ({ userId }: { userId: string }) => {
  const { toast } = useToast();
  const [state, setState] = useState<{ lastSeen: boolean; receipts: boolean } | null>(null);

  useEffect(() => {
    void supabase.from("profiles").select("hide_last_seen, read_receipts").eq("id", userId).maybeSingle()
      .then(({ data }) => setState({ lastSeen: !data?.hide_last_seen, receipts: data?.read_receipts !== false }));
  }, [userId]);

  const save = async (patch: { hide_last_seen?: boolean; read_receipts?: boolean }, next: { lastSeen: boolean; receipts: boolean }) => {
    const before = state;
    setState(next);
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    forgetLastSeen(userId);
    if (error) { setState(before); toast({ title: "Couldn't save that", description: friendlyError(error), variant: "destructive" }); }
  };

  if (!state) return null;
  return (
    <Card className="mb-6 divide-y divide-border overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-secondary"><Clock className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Last seen</p>
          <p className="text-xs text-muted-foreground">Friends see when you were last on Ember. Off: they don't, and you don't see theirs.</p>
        </div>
        <Switch checked={state.lastSeen} aria-label="Last seen" onCheckedChange={(on) => void save({ hide_last_seen: !on }, { ...state, lastSeen: on })} />
      </div>
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-secondary"><CheckCheck className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Read receipts</p>
          <p className="text-xs text-muted-foreground">Blue ticks when you've read a message. Off: nobody sees yours, and you don't see theirs.</p>
        </div>
        <Switch checked={state.receipts} aria-label="Read receipts" onCheckedChange={(on) => void save({ read_receipts: on }, { ...state, receipts: on })} />
      </div>
    </Card>
  );
};

export default ChatPrivacy;
