import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Users, Globe, Flag, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useEffectEvent } from "@/hooks/use-effect-event";

const PAGE_CATEGORIES = [
  { value: "business", label: "Business" },
  { value: "brand", label: "Brand" },
  { value: "community", label: "Community" },
  { value: "creator", label: "Creator / Public Figure" },
  { value: "entertainment", label: "Entertainment" },
  { value: "education", label: "Education" },
  { value: "nonprofit", label: "Nonprofit" },
  { value: "other", label: "Other" },
];

interface Page {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  description: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  followers_count: number;
  created_at: string;
}

const Pages = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [myPages, setMyPages] = useState<Page[]>([]);
  const [followedPageIds, setFollowedPageIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState("discover");

  // Create form
  const [createName, setCreateName] = useState("");
  const [createCategory, setCreateCategory] = useState("business");
  const [createDesc, setCreateDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const checkAuth = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    setCurrentUserId(session.user.id);
  });

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const loadPages = useEffectEvent(async () => {
    setIsLoading(true);
    let query = supabase.from("pages").select("*");
    if (searchQuery.trim()) {
      query = query.ilike("name", `%${searchQuery.trim()}%`);
    }
    const { data } = await query.order("followers_count", { ascending: false });
    
    const all = data || [];
    setPages(all.filter(p => p.owner_id !== currentUserId));
    setMyPages(all.filter(p => p.owner_id === currentUserId));
    setIsLoading(false);
  });

  const loadFollowed = useEffectEvent(async () => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from("page_followers")
      .select("page_id")
      .eq("user_id", currentUserId);
    setFollowedPageIds(new Set(data?.map(f => f.page_id) || []));
  });

  useEffect(() => {
    if (currentUserId) {
      loadPages();
      loadFollowed();
    }
  }, [currentUserId, searchQuery, loadFollowed, loadPages]);

  const toggleFollow = async (pageId: string) => {
    if (!currentUserId) return;
    const isFollowing = followedPageIds.has(pageId);

    if (isFollowing) {
      await supabase.from("page_followers").delete()
        .eq("user_id", currentUserId).eq("page_id", pageId);
      setFollowedPageIds(prev => { const n = new Set(prev); n.delete(pageId); return n; });
      setPages(prev => prev.map(p => p.id === pageId ? { ...p, followers_count: Math.max(0, p.followers_count - 1) } : p));
    } else {
      await supabase.from("page_followers").insert({ user_id: currentUserId, page_id: pageId });
      setFollowedPageIds(prev => new Set(prev).add(pageId));
      setPages(prev => prev.map(p => p.id === pageId ? { ...p, followers_count: p.followers_count + 1 } : p));
    }
  };

  const handleCreate = async () => {
    if (!currentUserId || !createName.trim()) return;
    setIsCreating(true);

    const { data, error } = await supabase.from("pages").insert({
      owner_id: currentUserId,
      name: createName.trim(),
      category: createCategory,
      description: createDesc.trim() || null,
    }).select().single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Page created!" });
      setShowCreate(false);
      setCreateName("");
      setCreateDesc("");
      navigate(`/pages/${data.id}`);
    }
    setIsCreating(false);
  };

  const getCategoryLabel = (value: string) =>
    PAGE_CATEGORIES.find(c => c.value === value)?.label || value;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation currentUserId={currentUserId || undefined} />

      <div className="flex-1">
        <div className="max-w-[1400px] mx-auto px-2 sm:px-4 lg:px-6 py-4 sm:py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Flag className="h-7 w-7 text-primary" />
              <h1 className="text-2xl sm:text-3xl font-bold font-display">Pages</h1>
            </div>
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" /> Create Page
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create a Page</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Page Name *</Label>
                    <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Your page name" className="mt-1" />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={createCategory} onValueChange={setCreateCategory}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAGE_CATEGORIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} placeholder="Tell people about your page" className="mt-1" rows={3} />
                  </div>
                  <Button className="w-full" onClick={handleCreate} disabled={!createName.trim() || isCreating}>
                    {isCreating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating...</> : "Create Page"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search pages..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="discover">Discover</TabsTrigger>
              <TabsTrigger value="following">Following</TabsTrigger>
              <TabsTrigger value="my-pages">My Pages</TabsTrigger>
            </TabsList>

            <TabsContent value="discover">
              {isLoading ? <PageGridSkeleton /> : (
                <PageGrid
                  pages={pages}
                  followedPageIds={followedPageIds}
                  currentUserId={currentUserId}
                  onToggleFollow={toggleFollow}
                  onNavigate={(id) => navigate(`/pages/${id}`)}
                  getCategoryLabel={getCategoryLabel}
                  emptyMessage="No pages found. Create one!"
                />
              )}
            </TabsContent>

            <TabsContent value="following">
              {isLoading ? <PageGridSkeleton /> : (
                <PageGrid
                  pages={[...pages, ...myPages].filter(p => followedPageIds.has(p.id))}
                  followedPageIds={followedPageIds}
                  currentUserId={currentUserId}
                  onToggleFollow={toggleFollow}
                  onNavigate={(id) => navigate(`/pages/${id}`)}
                  getCategoryLabel={getCategoryLabel}
                  emptyMessage="You're not following any pages yet."
                />
              )}
            </TabsContent>

            <TabsContent value="my-pages">
              {isLoading ? <PageGridSkeleton /> : (
                <PageGrid
                  pages={myPages}
                  followedPageIds={followedPageIds}
                  currentUserId={currentUserId}
                  onToggleFollow={toggleFollow}
                  onNavigate={(id) => navigate(`/pages/${id}`)}
                  getCategoryLabel={getCategoryLabel}
                  emptyMessage="You haven't created any pages yet."
                  isOwner
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

interface PageGridProps {
  pages: Page[];
  followedPageIds: Set<string>;
  currentUserId: string | null;
  onToggleFollow: (id: string) => void;
  onNavigate: (id: string) => void;
  getCategoryLabel: (v: string) => string;
  emptyMessage: string;
  isOwner?: boolean;
}

const PageGrid = ({ pages, followedPageIds, currentUserId, onToggleFollow, onNavigate, getCategoryLabel, emptyMessage, isOwner }: PageGridProps) => {
  if (pages.length === 0) {
    return (
      <div className="text-center py-16">
        <Flag className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
        <p className="text-lg text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
    >
      {pages.map(page => (
        <motion.div
          key={page.id}
          variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
        >
          <Card
            className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group"
            onClick={() => onNavigate(page.id)}
          >
            {/* Cover */}
            <div className="h-24 bg-gradient-to-br from-primary/20 to-primary/5 relative">
              {page.cover_url && (
                <img src={page.cover_url} alt="" className="w-full h-full object-cover" />
              )}
            </div>
            {/* Avatar + Info */}
            <div className="px-4 pb-4">
              <div className="-mt-8 mb-2">
                <div className="h-16 w-16 rounded-xl border-4 border-background bg-secondary overflow-hidden">
                  {page.avatar_url ? (
                    <img src={page.avatar_url} alt={page.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-primary/10">
                      <Flag className="h-6 w-6 text-primary" />
                    </div>
                  )}
                </div>
              </div>
              <h3 className="font-bold text-base line-clamp-1 group-hover:text-primary transition-colors">{page.name}</h3>
              <p className="text-xs text-muted-foreground mb-1">{getCategoryLabel(page.category)}</p>
              {page.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{page.description}</p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" /> {page.followers_count} followers
                </span>
                {!isOwner && page.owner_id !== currentUserId && (
                  <Button
                    size="sm"
                    variant={followedPageIds.has(page.id) ? "secondary" : "default"}
                    className="h-7 text-xs"
                    onClick={(e) => { e.stopPropagation(); onToggleFollow(page.id); }}
                  >
                    {followedPageIds.has(page.id) ? "Following" : "Follow"}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
};

const PageGridSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: 6 }).map((_, i) => (
      <Card key={i} className="overflow-hidden">
        <Skeleton className="h-24 w-full" />
        <div className="px-4 pb-4">
          <Skeleton className="h-16 w-16 rounded-xl -mt-8 mb-2" />
          <Skeleton className="h-5 w-2/3 mb-1" />
          <Skeleton className="h-3 w-1/3 mb-2" />
          <Skeleton className="h-3 w-full" />
        </div>
      </Card>
    ))}
  </div>
);

export default Pages;
