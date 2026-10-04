import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Crown, Star, Gem, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Tier {
  id: string;
  tier: string;
  name: string;
  description: string | null;
  price_credits: number;
}

interface CreatorSubscriptionsProps {
  creatorId: string;
  currentUserId: string;
  isOwnProfile: boolean;
}

const TIER_CONFIG = {
  supporter: { icon: Star, color: "text-primary", gradient: "from-primary/20 to-primary/5", label: "Supporter" },
  superfan: { icon: Crown, color: "text-amber-500", gradient: "from-amber-500/20 to-amber-500/5", label: "Superfan" },
  vip: { icon: Gem, color: "text-violet-500", gradient: "from-violet-500/20 to-violet-500/5", label: "VIP" },
};

const CreatorSubscriptions = ({ creatorId, currentUserId, isOwnProfile }: CreatorSubscriptionsProps) => {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [currentSub, setCurrentSub] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, [creatorId, currentUserId]);

  const loadData = async () => {
    const [{ data: tiersData }, { data: subData }] = await Promise.all([
      supabase.from("creator_tiers").select("*").eq("creator_id", creatorId).order("price_credits"),
      supabase.from("creator_subscriptions").select("tier_id").eq("subscriber_id", currentUserId).eq("creator_id", creatorId).eq("status", "active").maybeSingle(),
    ]);
    setTiers(tiersData || []);
    setCurrentSub(subData?.tier_id || null);
    setLoading(false);
  };

  const subscribe = async (tier: Tier) => {
    setSubscribing(tier.id);

    // Check credits
    const { data: credits } = await supabase
      .from("ad_credits")
      .select("balance")
      .eq("user_id", currentUserId)
      .maybeSingle();

    const balance = credits?.balance || 0;
    if (balance < tier.price_credits) {
      toast({ title: "Not enough credits", description: `You need ${tier.price_credits} credits. You have ${balance}.`, variant: "destructive" });
      setSubscribing(null);
      return;
    }

    // Deduct credits
    await supabase.from("ad_credits").update({ balance: balance - tier.price_credits }).eq("user_id", currentUserId);

    // Add credits to creator
    const { data: creatorCredits } = await supabase.from("ad_credits").select("balance").eq("user_id", creatorId).maybeSingle();
    if (creatorCredits) {
      await supabase.from("ad_credits").update({ balance: creatorCredits.balance + tier.price_credits }).eq("user_id", creatorId);
    } else {
      await supabase.from("ad_credits").insert({ user_id: creatorId, balance: tier.price_credits, total_purchased: tier.price_credits });
    }

    // Create subscription (upsert)
    if (currentSub) {
      await supabase.from("creator_subscriptions").update({ tier_id: tier.id, started_at: new Date().toISOString() }).eq("subscriber_id", currentUserId).eq("creator_id", creatorId);
    } else {
      await supabase.from("creator_subscriptions").insert({ subscriber_id: currentUserId, creator_id: creatorId, tier_id: tier.id });
    }

    // Log transaction
    await supabase.from("credit_transactions").insert({
      user_id: currentUserId,
      amount: -tier.price_credits,
      type: "subscription",
      description: `Subscribed to ${tier.name}`,
    });

    toast({ title: `Subscribed to ${tier.name}! 🎉` });
    setSubscribing(null);
    loadData();
  };

  const setupDefaultTiers = async () => {
    const defaults = [
      { tier: "supporter" as const, name: "Supporter", description: "Show your support and get a badge!", price_credits: 50 },
      { tier: "superfan" as const, name: "Superfan", description: "Exclusive content and early access.", price_credits: 150 },
      { tier: "vip" as const, name: "VIP", description: "Everything plus direct messaging priority.", price_credits: 500 },
    ];

    for (const t of defaults) {
      await supabase.from("creator_tiers").insert({ creator_id: currentUserId, ...t });
    }
    toast({ title: "Subscription tiers created! 🚀" });
    setShowSetup(false);
    loadData();
  };

  if (loading) return null;

  if (tiers.length === 0 && isOwnProfile) {
    return (
      <Card className="p-6 rounded-2xl text-center space-y-3">
        <Crown className="h-10 w-10 mx-auto text-amber-500" />
        <h3 className="font-semibold">Enable Creator Subscriptions</h3>
        <p className="text-sm text-muted-foreground">Let your fans support you with monthly subscriptions.</p>
        <Button className="gradient-brand text-primary-foreground rounded-xl" onClick={setupDefaultTiers}>
          Set Up Tiers
        </Button>
      </Card>
    );
  }

  if (tiers.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <Crown className="h-4 w-4 text-amber-500" />
        Support this creator
      </h3>

      <div className="grid gap-3 sm:grid-cols-3">
        {tiers.map((tier) => {
          const config = TIER_CONFIG[tier.tier as keyof typeof TIER_CONFIG] || TIER_CONFIG.supporter;
          const Icon = config.icon;
          const isActive = currentSub === tier.id;

          return (
            <Card
              key={tier.id}
              className={cn(
                "p-4 rounded-2xl border-2 transition-all relative overflow-hidden",
                isActive ? "border-primary shadow-md" : "border-border/60 hover:border-primary/30"
              )}
            >
              <div className={cn("absolute inset-0 bg-gradient-to-b opacity-40", config.gradient)} />
              <div className="relative z-10 space-y-3">
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-5 w-5", config.color)} />
                  <span className="font-bold text-sm">{tier.name}</span>
                </div>
                {tier.description && (
                  <p className="text-xs text-muted-foreground">{tier.description}</p>
                )}
                <div className="text-lg font-bold">{tier.price_credits} <span className="text-xs font-normal text-muted-foreground">credits/mo</span></div>

                {isActive ? (
                  <Button size="sm" variant="outline" className="w-full rounded-xl" disabled>
                    <Check className="h-4 w-4 mr-1" /> Subscribed
                  </Button>
                ) : currentUserId !== creatorId ? (
                  <Button
                    size="sm"
                    className="w-full rounded-xl gradient-brand text-primary-foreground"
                    disabled={subscribing === tier.id}
                    onClick={() => subscribe(tier)}
                  >
                    {subscribing === tier.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Subscribe"}
                  </Button>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default CreatorSubscriptions;
