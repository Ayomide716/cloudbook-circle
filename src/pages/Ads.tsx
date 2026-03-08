import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Coins, TrendingUp, Eye, MousePointerClick, Pause, Play, Trash2, BarChart3 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";

interface Campaign {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  link_url: string | null;
  cta_text: string;
  status: string;
  budget_credits: number;
  spent_credits: number;
  impressions: number;
  clicks: number;
  created_at: string;
}

const CREDIT_PACKS = [
  { credits: 100, label: "Starter", description: "100 credits" },
  { credits: 500, label: "Growth", description: "500 credits" },
  { credits: 2000, label: "Business", description: "2,000 credits" },
  { credits: 10000, label: "Enterprise", description: "10,000 credits" },
];

const Ads = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [credits, setCredits] = useState(0);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create campaign form
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [ctaText, setCtaText] = useState("Learn More");
  const [budget, setBudget] = useState("100");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/landing"); return; }
    setCurrentUserId(session.user.id);
    await Promise.all([fetchCredits(session.user.id), fetchCampaigns(session.user.id)]);
    setLoading(false);
  };

  const fetchCredits = async (userId: string) => {
    const { data } = await supabase
      .from("ad_credits")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    setCredits(data?.balance ?? 0);
  };

  const fetchCampaigns = async (userId: string) => {
    const { data } = await supabase
      .from("ad_campaigns")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setCampaigns((data as Campaign[]) || []);
  };

  const handleBuyCredits = async (amount: number) => {
    if (!currentUserId) return;

    // Upsert credits
    const { data: existing } = await supabase
      .from("ad_credits")
      .select("*")
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("ad_credits")
        .update({
          balance: existing.balance + amount,
          total_purchased: existing.total_purchased + amount,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", currentUserId);
    } else {
      await supabase
        .from("ad_credits")
        .insert({ user_id: currentUserId, balance: amount, total_purchased: amount });
    }

    // Log transaction
    await supabase.from("credit_transactions").insert({
      user_id: currentUserId,
      amount,
      type: "purchase",
      description: `Purchased ${amount} ad credits`,
    });

    setCredits((prev) => prev + amount);
    toast({ title: `${amount} credits added!` });
  };

  const handleCreateCampaign = async () => {
    if (!currentUserId || !title.trim() || !content.trim()) return;
    const budgetNum = parseInt(budget);
    if (budgetNum > credits) {
      toast({ title: "Insufficient credits", variant: "destructive" });
      return;
    }

    setCreating(true);

    const { error } = await supabase.from("ad_campaigns").insert({
      user_id: currentUserId,
      title: title.trim(),
      content: content.trim(),
      image_url: imageUrl || null,
      link_url: linkUrl || null,
      cta_text: ctaText,
      budget_credits: budgetNum,
      status: "active",
      start_date: new Date().toISOString(),
    });

    if (!error) {
      // Deduct credits
      await supabase
        .from("ad_credits")
        .update({ balance: credits - budgetNum, updated_at: new Date().toISOString() })
        .eq("user_id", currentUserId);

      await supabase.from("credit_transactions").insert({
        user_id: currentUserId,
        amount: -budgetNum,
        type: "spend",
        description: `Campaign: ${title.trim()}`,
      });

      setCredits((prev) => prev - budgetNum);
      setTitle(""); setContent(""); setImageUrl(""); setLinkUrl("");
      setBudget("100"); setShowCreate(false);
      toast({ title: "Campaign launched! 🚀" });
      fetchCampaigns(currentUserId);
    }

    setCreating(false);
  };

  const toggleCampaignStatus = async (campaign: Campaign) => {
    const newStatus = campaign.status === "active" ? "paused" : "active";
    await supabase
      .from("ad_campaigns")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", campaign.id);
    if (currentUserId) fetchCampaigns(currentUserId);
  };

  const deleteCampaign = async (campaign: Campaign) => {
    // Refund remaining budget
    const remaining = campaign.budget_credits - campaign.spent_credits;
    if (remaining > 0 && currentUserId) {
      await supabase
        .from("ad_credits")
        .update({ balance: credits + remaining, updated_at: new Date().toISOString() })
        .eq("user_id", currentUserId);

      await supabase.from("credit_transactions").insert({
        user_id: currentUserId,
        amount: remaining,
        type: "refund",
        description: `Refund for campaign: ${campaign.title}`,
      });

      setCredits((prev) => prev + remaining);
    }

    await supabase.from("ad_campaigns").delete().eq("id", campaign.id);
    if (currentUserId) fetchCampaigns(currentUserId);
    toast({ title: "Campaign deleted. Remaining budget refunded." });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500/10 text-green-600 border-green-500/20";
      case "paused": return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      case "draft": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 rounded-lg bg-primary" />
      </div>
    </div>
  );

  const totalImpressions = campaigns.reduce((a, c) => a + c.impressions, 0);
  const totalClicks = campaigns.reduce((a, c) => a + c.clicks, 0);
  const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : "0";

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId || undefined} />

      <div className="max-w-4xl mx-auto px-4 py-6 mb-20 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Ad Manager</h1>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Create Campaign
          </Button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-4 text-center">
            <Coins className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{credits}</p>
            <p className="text-xs text-muted-foreground">Credits</p>
          </Card>
          <Card className="p-4 text-center">
            <BarChart3 className="h-5 w-5 mx-auto mb-1 text-blue-500" />
            <p className="text-2xl font-bold">{campaigns.length}</p>
            <p className="text-xs text-muted-foreground">Campaigns</p>
          </Card>
          <Card className="p-4 text-center">
            <Eye className="h-5 w-5 mx-auto mb-1 text-green-500" />
            <p className="text-2xl font-bold">{totalImpressions.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Impressions</p>
          </Card>
          <Card className="p-4 text-center">
            <MousePointerClick className="h-5 w-5 mx-auto mb-1 text-orange-500" />
            <p className="text-2xl font-bold">{avgCTR}%</p>
            <p className="text-xs text-muted-foreground">CTR</p>
          </Card>
        </div>

        <Tabs defaultValue="campaigns">
          <TabsList className="w-full">
            <TabsTrigger value="campaigns" className="flex-1">Campaigns</TabsTrigger>
            <TabsTrigger value="analytics" className="flex-1">Analytics</TabsTrigger>
            <TabsTrigger value="credits" className="flex-1">Buy Credits</TabsTrigger>
          </TabsList>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4 mt-4">
            {campaigns.length === 0 ? (
              <Card className="p-8 text-center">
                <BarChart3 className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-lg font-medium">No data yet</p>
                <p className="text-sm text-muted-foreground">Create campaigns to see analytics</p>
              </Card>
            ) : (
              <>
                {/* Impressions & Clicks Bar Chart */}
                <Card className="p-4">
                  <h3 className="font-semibold mb-3">Campaign Performance</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={campaigns.map(c => ({ name: c.title.slice(0, 12), impressions: c.impressions, clicks: c.clicks }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" className="text-xs fill-muted-foreground" />
                      <YAxis className="text-xs fill-muted-foreground" />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                      <Bar dataKey="impressions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="clicks" fill="hsl(var(--primary) / 0.5)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                {/* Budget Usage Pie Chart */}
                <Card className="p-4">
                  <h3 className="font-semibold mb-3">Budget Usage</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Spent", value: campaigns.reduce((s, c) => s + c.spent_credits, 0) },
                          { name: "Remaining", value: campaigns.reduce((s, c) => s + (c.budget_credits - c.spent_credits), 0) },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        <Cell fill="hsl(var(--primary))" />
                        <Cell fill="hsl(var(--muted))" />
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>

                {/* CTR per Campaign */}
                <Card className="p-4">
                  <h3 className="font-semibold mb-3">Click-Through Rate (%)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={campaigns.map(c => ({ name: c.title.slice(0, 12), ctr: c.impressions > 0 ? parseFloat(((c.clicks / c.impressions) * 100).toFixed(2)) : 0 }))}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" className="text-xs fill-muted-foreground" />
                      <YAxis className="text-xs fill-muted-foreground" />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} />
                      <Line type="monotone" dataKey="ctr" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="campaigns" className="space-y-3 mt-4">
            {campaigns.length === 0 ? (
              <Card className="p-8 text-center">
                <TrendingUp className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No campaigns yet</p>
                <p className="text-sm text-muted-foreground mb-4">Create your first ad campaign to reach more people</p>
                <Button onClick={() => setShowCreate(true)}>Create Campaign</Button>
              </Card>
            ) : (
              campaigns.map((c) => (
                <Card key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{c.title}</h3>
                        <Badge className={statusColor(c.status)} variant="outline">{c.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{c.content}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Coins className="h-3 w-3" /> {c.spent_credits}/{c.budget_credits}</span>
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {c.impressions}</span>
                        <span className="flex items-center gap-1"><MousePointerClick className="h-3 w-3" /> {c.clicks}</span>
                        <span>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleCampaignStatus(c)}
                        title={c.status === "active" ? "Pause" : "Resume"}
                      >
                        {c.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteCampaign(c)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="credits" className="mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CREDIT_PACKS.map((pack) => (
                <Card key={pack.credits} className="p-5 flex flex-col items-center text-center hover:border-primary/50 transition-colors">
                  <Coins className="h-8 w-8 text-primary mb-2" />
                  <h3 className="font-bold text-lg">{pack.label}</h3>
                  <p className="text-sm text-muted-foreground mb-3">{pack.description}</p>
                  <Badge variant="secondary" className="mb-3 text-lg px-4 py-1">{pack.credits} credits</Badge>
                  <Button className="w-full" onClick={() => handleBuyCredits(pack.credits)}>
                    Get Credits
                  </Button>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-4">
              1 credit ≈ 1 ad impression. Clicks cost 5 credits each. Credits never expire.
            </p>
          </TabsContent>
        </Tabs>

        {/* Create Campaign Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Ad Campaign</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Campaign Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My awesome product" />
              </div>
              <div>
                <Label>Ad Content</Label>
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Describe what you're promoting..." className="min-h-[80px]" />
              </div>
              <div>
                <Label>Image URL (optional)</Label>
                <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label>Link URL (optional)</Label>
                <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://yoursite.com" />
              </div>
              <div>
                <Label>CTA Button Text</Label>
                <Select value={ctaText} onValueChange={setCtaText}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Learn More">Learn More</SelectItem>
                    <SelectItem value="Shop Now">Shop Now</SelectItem>
                    <SelectItem value="Sign Up">Sign Up</SelectItem>
                    <SelectItem value="Download">Download</SelectItem>
                    <SelectItem value="Get Offer">Get Offer</SelectItem>
                    <SelectItem value="Contact Us">Contact Us</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Budget (credits) — You have {credits}</Label>
                <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} min="10" max={credits.toString()} />
              </div>
              <Button
                className="w-full"
                onClick={handleCreateCampaign}
                disabled={creating || !title.trim() || !content.trim() || parseInt(budget) > credits || parseInt(budget) < 10}
              >
                {creating ? "Launching..." : `Launch Campaign (${budget} credits)`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Ads;
