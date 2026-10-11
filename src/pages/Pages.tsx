import { useState, useEffect } from "react";
import { useSingleFlight } from "@/hooks/use-single-flight";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, HeaderAction, PageSearch } from "@/components/layout/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Users, Globe, Flag, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSEO } from "@/hooks/useSEO";
import { PAGE_CATEGORIES, pageCategoryLabel } from "@/lib/page-categories";


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
  const debouncedSearch = useDebouncedValue(searchQuery.trim());
  useSEO({ title: "Pages", description: "Discover and follow pages on Ember." });
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
    if (debouncedSearch) query = query.ilike("name", `%${debouncedSearch}%`);
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
  }, [currentUserId, debouncedSearch, loadFollowed, loadPages]);

  const toggleFollow = async (pageId: string) => {
    if (!currentUserId) return;
    const was = followedPageIds.has(pageId);
    const apply = (following: boolean) => {
      setFollowedPageIds(prev => { const n = new Set(prev); if (following) n.add(pageId); else n.delete(pageId); return n; });
      setPages(prev => prev.map(p => p.id === pageId ? { ...p, followers_count: Math.max(0, p.followers_count + (following ? 1 : -1)) } : p));
    };
    apply(!was);
    const { error } = was
      ? await supabase.from("page_followers").delete().eq("user_id", currentUserId).eq("page_id", pageId)
      : await supabase.from("page_followers").insert({ user_id: currentUserId, page_id: pageId });
    if (error) {
      apply(was);
      toast({ title: "Couldn't update follow", variant: "destructive" });
    }
  };

  // Extra taps while this is saving do nothing (no double posts on a slow network).
  const onceHandleCreate = useSingleFlight();
  const handleCreate = onceHandleCreate(async () => {
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
      setShowCreate(false);
      setCreateName("");
      setCreateDesc("");
      navigate(`/pages/${data.id}`);
    }
    setIsCreating(false);
  });

  const getCategoryLabel = pageCategoryLabel;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation currentUserId={currentUserId || undefined} />

      <div className="flex-1">
        <div className="page-flush max-w-[1400px] mx-auto px-0 sm:px-4 lg:px-6 pb-6 sm:py-6">
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create a Page</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label htmlFor="page-name">Page name *</Label>
                    <Input id="page-name" maxLength={80} value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Your page name" className="mt-1" />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={createCategory} onValueChange={setCreateCategory}>
                      <SelectTrigger className="mt-1" aria-label="Category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAGE_CATEGORIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="page-desc">Description</Label>
                    <Textarea id="page-desc" value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} placeholder="Tell people about your page" className="mt-1" rows={3} />
                  </div>
                  <Button className="w-full" onClick={handleCreate} disabled={!createName.trim() || isCreating}>
                    {isCreating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating...</> : "Create Page"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

          <PageHeader
            title="Pages"
            actions={<HeaderAction icon={Plus} label="Create page" primary onClick={() => setShowCreate(true)} />}
            className="sm:mb-4"
          >
            <PageSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search pages" />
          </PageHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="feed-section w-full bg-card sm:bg-transparent px-2 sm:px-0 mb-2 sm:mb-4">
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
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4"
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
            className="feed-section overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            role="link"
            tabIndex={0}
            aria-label={page.name}
            onClick={() => onNavigate(page.id)}
            onKeyDown={(e) => { if (e.key === "Enter") onNavigate(page.id); }}
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
                  <Users className="h-3 w-3" /> {page.followers_count} {page.followers_count === 1 ? "follower" : "followers"}
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
