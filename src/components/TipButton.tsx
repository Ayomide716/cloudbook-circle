import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Coins, Loader2, Heart } from "@/components/icons";

interface TipButtonProps {
  postId: string;
  receiverId: string;
  currentUserId: string;
  compact?: boolean;
}

const TipButton = ({ postId, receiverId, currentUserId, compact = false }: TipButtonProps) => {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(5);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  if (currentUserId === receiverId) return null;

  const sendTip = async () => {
    setLoading(true);
    // Check credits
    const { data: credits } = await supabase
      .from("ad_credits")
      .select("balance")
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (!credits || credits.balance < amount) {
      toast({ title: "Insufficient credits", description: "Top up your credits to send tips!", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Deduct from tipper
    await supabase
      .from("ad_credits")
      .update({ balance: credits.balance - amount })
      .eq("user_id", currentUserId);

    // Add to receiver
    const { data: receiverCredits } = await supabase
      .from("ad_credits")
      .select("balance")
      .eq("user_id", receiverId)
      .maybeSingle();

    if (receiverCredits) {
      await supabase
        .from("ad_credits")
        .update({ balance: receiverCredits.balance + amount })
        .eq("user_id", receiverId);
    } else {
      await supabase
        .from("ad_credits")
        .insert({ user_id: receiverId, balance: amount });
    }

    // Record tip
    await supabase.from("post_tips").insert({
      post_id: postId,
      tipper_id: currentUserId,
      receiver_id: receiverId,
      amount,
      message: message.trim() || null,
    });

    // Record transactions
    await supabase.from("credit_transactions").insert([
      { user_id: currentUserId, amount: -amount, type: "tip_sent", description: `Tip sent on post` },
      { user_id: receiverId, amount, type: "tip_received", description: `Tip received on post` },
    ]);

    toast({ title: `Sent ${amount} credits`, description: "Your tip was delivered!" });
    setOpen(false);
    setAmount(5);
    setMessage("");
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-amber-500">
          <Coins className="h-4 w-4" />
          <span className={compact ? "sr-only" : "sr-only sm:not-sr-only"}>Tip</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-500" />
            Send a Tip
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex gap-2 justify-center">
            {[1, 5, 10, 25, 50].map((v) => (
              <Button
                key={v}
                variant={amount === v ? "default" : "outline"}
                size="sm"
                onClick={() => setAmount(v)}
              >
                {v} credits
              </Button>
            ))}
          </div>
          <Input
            placeholder="Add a message (optional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={100}
          />
          <Button className="w-full" onClick={sendTip} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Send ${amount} Credits`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TipButton;
