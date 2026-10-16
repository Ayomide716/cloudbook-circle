import EmptyState from "@/components/EmptyState";
import { HeaderAction, PageHeader } from "@/components/layout/PageHeader";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import Navigation from "@/components/Navigation";
import SponsoredPost from "@/components/SponsoredPost";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Coins, Eye, MousePointerClick, Pause, Play, Trash2, BarChart3, Info, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { safeWebsiteUrl } from "@/lib/safe-url";
import { cn } from "@/lib/utils";

interface Campaign {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  link_url: string | null;
  cta_text: string;
  status: string;
  budget_credits: number;
  created_at: string;
}

/** Stats counted from the recorded views and clicks (the campaign's own counters are never updated). */
interface CampaignStats {
  impressions: number;
  clicks: number;
  spent: number;
}

const CREDIT_PACKS = [
  { credits: 100, label: "Starter" },
  { credits: 500, label: "Growth" },
  { credits: 2000, label: "Business" },
  { credits: 10000, label: "Enterprise" },
];

const CTA_OPTIONS = ["Learn More", "Shop Now", "Sign Up", "Download", "Get Offer", "Contact Us"];
const CLICK_COST = 5;
const MIN_BUDGET = 10;
const fmt = (n: number) => n.toLocaleString();

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--foreground))",
  fontSize: 12,
};

const Ads = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  useSEO({ title: "Ad Manager", description: "Manage your ad campaigns on Ember." });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [credits, setCredits] = useState(0);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<Record<string, CampaignStats>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Create campaign form
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [ctaText, setCtaText] = useState("Learn More");
  const [budget, setBudget] = useState("100");
  const [creating, setCreating] = useState(false);

  const budgetNum = Number(budget);
  const linkInvalid = !!linkUrl.trim() && !safeWebsiteUrl(linkUrl);
  const imageInvalid = !!imageUrl.trim() && !safeWebsiteUrl(imageUrl);
  const budgetError = !Number.isInteger(budgetNum) || budgetNum < MIN_BUDGET
    ? `At least ${MIN_BUDGET} credits`
    : budgetNum > credits
      ? `You have ${fmt(credits)} credits`
      : null;

  const fetchCredits = async (userId: string) => {
    const { data } = await supabase.from("ad_credits").select("balance, total_purchased").eq("user_id", userId).maybeSingle();
    setCredits(data?.balance ?? 0);
    return data;
  };

  const fetchCampaigns = async (userId: string) => {
    const { data } = await supabase
      .from("ad_campaigns")
      .select("id, title, content, image_url, link_url, cta_text, status, budget_credits, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Campaign[];
    setCampaigns(list);
    if (!list.length) { setStats({}); return; }

    const ids = list.map((c) => c.id);
    const [{ data: views }, { data: clicks }] = await Promise.all([
      supabase.from("ad_impressions").select("campaign_id").in("campaign_id", ids),
      supabase.from("ad_clicks").select("campaign_id").in("campaign_id", ids),
    ]);
    const next: Record<string, CampaignStats> = {};
    for (const c of list) next[c.id] = { impressions: 0, clicks: 0, spent: 0 };
    for (const v of views ?? []) next[v.campaign_id].impressions++;
    for (const k of clicks ?? []) next[k.campaign_id].clicks++;
    for (const c of list) {
      const s = next[c.id];
      s.spent = Math.min(c.budget_credits, s.impressions + s.clicks * CLICK_COST);
    }
    setStats(next);

    // A campaign whose budget is used up stops running.
    const finished = list.filter((c) => c.status === "active" && next[c.id].spent >= c.budget_credits);
    if (finished.length) {
      await supabase.from("ad_campaigns").update({ status: "completed" }).in("id", finished.map((c) => c.id));
      setCampaigns((prev) => prev.map((c) => (finished.some((f) => f.id === c.id) ? { ...c, status: "completed" } : c)));
    }
  };

  const checkAuth = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    setCurrentUserId(session.user.id);
    await Promise.all([fetchCredits(session.user.id), fetchCampaigns(session.user.id)]);
    setLoading(false);
  });

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  /** Adds (or removes) credits, starting from the stored balance rather than what's on screen. */
  const changeCredits = async (amount: number, type: string, description: string) => {
    if (!currentUserId) return false;
    const existing = await fetchCredits(currentUserId);
    const balance = (existing?.balance ?? 0) + amount;
    if (balance < 0) return false;
    const { error } = existing
      ? await supabase.from("ad_credits").update({
          balance,
          total_purchased: (existing.total_purchased ?? 0) + (type === "purchase" ? amount : 0),
          updated_at: new Date().toISOString(),
        }).eq("user_id", currentUserId)
      : await supabase.from("ad_credits").insert({ user_id: currentUserId, balance, total_purchased: type === "purchase" ? amount : 0 });
    if (error) return false;
    await supabase.from("credit_transactions").insert({ user_id: currentUserId, amount, type, description });
    setCredits(balance);
    return true;
  };

  const handleBuyCredits = async (amount: number) => {
    setBusy(`buy-${amount}`);
    const ok = await changeCredits(amount, "purchase", `Added ${amount} demo ad credits`);
    setBusy(null);
    toast(ok ? { title: `${fmt(amount)} credits added` } : { title: "Couldn't add credits", variant: "destructive" });
  };

  const resetForm = () => {
    setTitle(""); setContent(""); setImageUrl(""); setLinkUrl(""); setCtaText("Learn More"); setBudget("100");
  };

  const handleCreateCampaign = async () => {
    if (!currentUserId || !title.trim() || !content.trim() || budgetError || linkInvalid || imageInvalid) return;
    setCreating(true);
    const { error } = await supabase.from("ad_campaigns").insert({
      user_id: currentUserId,
      title: title.trim(),
      content: content.trim(),
      image_url: safeWebsiteUrl(imageUrl),
      link_url: safeWebsiteUrl(linkUrl),
      cta_text: ctaText,
      budget_credits: budgetNum,
      status: "active",
      start_date: new Date().toISOString(),
    });
    if (error) {
      setCreating(false);
      toast({ title: "Couldn't launch the campaign", description: error.message, variant: "destructive" });
      return;
    }
    await changeCredits(-budgetNum, "spend", `Campaign: ${title.trim()}`);
    setCreating(false);
    resetForm();
    setShowCreate(false);
    toast({ title: "Campaign launched" });
    fetchCampaigns(currentUserId);
  };

  const toggleCampaignStatus = async (campaign: Campaign) => {
    const newStatus = campaign.status === "active" ? "paused" : "active";
    setBusy(campaign.id);
    const { error } = await supabase.from("ad_campaigns").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", campaign.id);
    setBusy(null);
    if (error) {
      toast({ title: "Couldn't update the campaign", variant: "destructive" });
      return;
    }
    setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? { ...c, status: newStatus } : c)));
  };

  const deleteCampaign = async (campaign: Campaign) => {
    setPendingDelete(null);
    const remaining = campaign.budget_credits - (stats[campaign.id]?.spent ?? 0);
    const { error } = await supabase.from("ad_campaigns").delete().eq("id", campaign.id);
    if (error) {
      toast({ title: "Couldn't delete the campaign", variant: "destructive" });
      return;
    }
    if (remaining > 0) await changeCredits(remaining, "refund", `Refund for campaign: ${campaign.title}`);
    setCampaigns((prev) => prev.filter((c) => c.id !== campaign.id));
    toast({ title: "Campaign deleted", description: remaining > 0 ? `${fmt(remaining)} unused credits were returned.` : undefined });
  };

  const statusStyle = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30";
      case "paused": return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const totals = Object.values(stats).reduce(
    (a, s) => ({ impressions: a.impressions + s.impressions, clicks: a.clicks + s.clicks }),
    { impressions: 0, clicks: 0 }
  );
  const avgCTR = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(1) : "0";
  const chartData = campaigns.map((c) => ({
    name: c.title.length > 14 ? `${c.title.slice(0, 13)}…` : c.title,
    impressions: stats[c.id]?.impressions ?? 0,
    clicks: stats[c.id]?.clicks ?? 0,
    ctr: stats[c.id]?.impressions ? Number(((stats[c.id].clicks / stats[c.id].impressions) * 100).toFixed(1)) : 0,
  }));

  const statTiles = [
    { icon: Coins, label: "Credits", value: fmt(credits) },
    { icon: BarChart3, label: "Campaigns", value: fmt(campaigns.length) },
    { icon: Eye, label: "Impressions", value: fmt(totals.impressions) },
    { icon: MousePointerClick, label: "Click-through", value: `${avgCTR}%` },
  ];

  const chartCard = (heading: string, dataKey: "impressions" | "clicks" | "ctr", unit = "") => (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">{heading}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis allowDecimals={dataKey === "ctr"} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} unit={unit} />
          <Tooltip cursor={{ fill: "hsl(var(--accent))" }} contentStyle={tooltipStyle} formatter={(v: number) => [`${fmt(v)}${unit}`, heading]} />
          <Bar dataKey={dataKey} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId || undefined} />

      <div className="max-w-4xl mx-auto px-4 py-6 pb-28 md:pb-8 space-y-6">
        <PageHeader
          back
          title="Ad Manager"
          className="!mb-0 !pb-0"
          actions={<HeaderAction icon={Plus} label="New campaign" primary onClick={() => setShowCreate(true)} />}
        />

        {/* Stats Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statTiles.map((t) => (
            <Card key={t.label} className="p-4">
              <t.icon className="h-5 w-5 mb-2 text-primary" />
              <p className="text-2xl font-bold tabular-nums">{t.value}</p>
              <p className="text-xs text-muted-foreground">{t.label}</p>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="campaigns">
          <TabsList className="w-full">
            <TabsTrigger value="campaigns" className="flex-1">Campaigns</TabsTrigger>
            <TabsTrigger value="analytics" className="flex-1">Analytics</TabsTrigger>
            <TabsTrigger value="credits" className="flex-1">Credits</TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="space-y-3 mt-4">
            {campaigns.length === 0 ? (
              <Card>
                <EmptyState
                  emoji="party"
                  title="No campaigns yet"
                  text="Create your first ad to reach more people in their feed."
                  action={<Button onClick={() => setShowCreate(true)} className="rounded-full">Create campaign</Button>}
                />
              </Card>
            ) : (
              campaigns.map((c) => {
                const s = stats[c.id] ?? { impressions: 0, clicks: 0, spent: 0 };
                const used = c.budget_credits ? Math.round((s.spent / c.budget_credits) * 100) : 0;
                return (
                  <Card key={c.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold truncate">{c.title}</h3>
                          <Badge className={cn("capitalize", statusStyle(c.status))} variant="outline">{c.status}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{c.content}</p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>{fmt(s.spent)} of {fmt(c.budget_credits)} credits used</span>
                          <span className="tabular-nums">{used}%</span>
                        </div>
                        <Progress value={used} className="h-1.5" aria-label={`${used}% of budget used`} />
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-3">
                          <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {fmt(s.impressions)} impressions</span>
                          <span className="flex items-center gap-1"><MousePointerClick className="h-3 w-3" /> {fmt(s.clicks)} clicks</span>
                          <span>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {c.status !== "completed" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={busy === c.id}
                            onClick={() => toggleCampaignStatus(c)}
                            aria-label={c.status === "active" ? "Pause campaign" : "Resume campaign"}
                            title={c.status === "active" ? "Pause" : "Resume"}
                          >
                            {c.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => setPendingDelete(c)} className="text-destructive hover:text-destructive" aria-label="Delete campaign" title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4 mt-4">
            {campaigns.length === 0 ? (
              <Card className="p-8 text-center">
                <BarChart3 className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-lg font-medium">No data yet</p>
                <p className="text-sm text-muted-foreground">Create a campaign to see how it performs.</p>
              </Card>
            ) : (
              <>
                {/* Separate charts: impressions and clicks differ too much in scale to share an axis. */}
                {chartCard("Impressions", "impressions")}
                {chartCard("Clicks", "clicks")}
                {chartCard("Click-through rate", "ctr", "%")}
              </>
            )}
          </TabsContent>

          <TabsContent value="credits" className="mt-4 space-y-4">
            <div className="flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p>
                <span className="font-medium">Demo credits.</span>{" "}
                <span className="text-muted-foreground">Ember doesn't take payments, so credits are free to add for trying out ads.</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {CREDIT_PACKS.map((pack) => (
                <Card key={pack.credits} className="p-4 sm:p-5 flex flex-col items-center text-center hover:border-primary/50 transition-colors">
                  <Coins className="h-7 w-7 text-primary mb-2" />
                  <h3 className="font-bold">{pack.label}</h3>
                  <p className="text-2xl font-bold tabular-nums my-2">{fmt(pack.credits)}</p>
                  <p className="text-xs text-muted-foreground mb-3">credits</p>
                  <Button className="w-full rounded-xl" variant="outline" disabled={busy === `buy-${pack.credits}`} onClick={() => handleBuyCredits(pack.credits)}>
                    Add credits
                  </Button>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Each time your ad is seen costs 1 credit, and each click costs {CLICK_COST}. Unused credits come back if you delete a campaign.
            </p>
          </TabsContent>
        </Tabs>

        {/* Create Campaign Dialog */}
        <Dialog open={showCreate} onOpenChange={(open) => !creating && setShowCreate(open)}>
          <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create ad campaign</DialogTitle>
              <DialogDescription>Your ad appears as a sponsored post in people's feeds.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="ad-title">Headline</Label>
                  <Input id="ad-title" className="mt-1" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My awesome product" />
                </div>
                <div>
                  <Label htmlFor="ad-content">Ad text</Label>
                  <Textarea id="ad-content" className="mt-1 min-h-[80px]" maxLength={500} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Describe what you're promoting..." />
                </div>
                <div>
                  <Label htmlFor="ad-image">Image address (optional)</Label>
                  <Input id="ad-image" className="mt-1" inputMode="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." aria-invalid={imageInvalid} />
                  {imageInvalid && <p className="text-xs text-destructive mt-1">Use an https:// image address</p>}
                </div>
                <div>
                  <Label htmlFor="ad-link">Link (optional)</Label>
                  <Input id="ad-link" className="mt-1" inputMode="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="yoursite.com" aria-invalid={linkInvalid} />
                  {linkInvalid && <p className="text-xs text-destructive mt-1">Enter a web address like yoursite.com</p>}
                </div>
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
                  <div>
                    <Label>Button</Label>
                    <Select value={ctaText} onValueChange={setCtaText}>
                      <SelectTrigger className="mt-1" aria-label="Button text"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CTA_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="ad-budget">Budget (credits)</Label>
                    <Input id="ad-budget" className="mt-1" type="number" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} min={MIN_BUDGET} max={credits} step={1} aria-invalid={!!budgetError} />
                  </div>
                </div>
                {budgetError ? (
                  <p className="text-xs text-destructive">
                    {budgetError}.{" "}
                    {budgetNum > credits && <button type="button" className="underline" onClick={() => setShowCreate(false)}>Add credits</button>}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">About {fmt(budgetNum)} views, or fewer if people click. You have {fmt(credits)} credits.</p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Preview</p>
                <SponsoredPost
                  preview
                  currentUserId={currentUserId ?? ""}
                  campaign={{ id: "preview", title, content, image_url: imageUrl, link_url: linkUrl, cta_text: ctaText }}
                />
              </div>
            </div>
            <Button
              className="w-full rounded-xl"
              onClick={handleCreateCampaign}
              disabled={creating || !title.trim() || !content.trim() || !!budgetError || linkInvalid || imageInvalid}
            >
              {creating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Launching…</> : `Launch campaign (${fmt(budgetNum || 0)} credits)`}
            </Button>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
              <AlertDialogDescription>
                "{pendingDelete?.title}" will stop showing and its unused credits will come back to you.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => pendingDelete && deleteCampaign(pendingDelete)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default Ads;
