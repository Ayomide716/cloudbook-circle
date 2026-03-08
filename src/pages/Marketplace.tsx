import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, MapPin, Tag, Filter, X, ImagePlus, DollarSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "All", "Electronics", "Vehicles", "Furniture", "Clothing", "Sports", "Books", "Home & Garden", "Toys", "Other"
];

const CONDITIONS = ["New", "Like New", "Good", "Fair", "Poor"];

interface Listing {
  id: string;
  title: string;
  description: string | null;
  price: number;
  category: string;
  condition: string;
  location: string | null;
  image_urls: string[];
  status: string;
  user_id: string;
  created_at: string;
  profiles?: { full_name: string | null; avatar_url: string | null };
}

const Marketplace = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailListing, setDetailListing] = useState<Listing | null>(null);

  // Create form state
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCategory, setNewCategory] = useState("Other");
  const [newCondition, setNewCondition] = useState("Good");
  const [newLocation, setNewLocation] = useState("");
  const [newImages, setNewImages] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { navigate("/auth"); return; }
      setCurrentUserId(data.user.id);
    });
  }, [navigate]);

  const loadListings = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("marketplace_listings")
      .select("*, profiles(full_name, avatar_url)")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (selectedCategory !== "All") {
      query = query.eq("category", selectedCategory.toLowerCase());
    }
    if (searchQuery.trim()) {
      query = query.ilike("title", `%${searchQuery.trim()}%`);
    }

    const { data, error } = await query;
    if (!error && data) setListings(data as unknown as Listing[]);
    setLoading(false);
  }, [selectedCategory, searchQuery]);

  useEffect(() => {
    if (currentUserId) loadListings();
  }, [currentUserId, loadListings]);

  const handleCreateListing = async () => {
    if (!currentUserId || !newTitle.trim() || !newPrice) return;
    setSubmitting(true);

    // Upload images
    const imageUrls: string[] = [];
    for (const file of newImages) {
      const ext = file.name.split(".").pop();
      const path = `${currentUserId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("marketplace").upload(path, file);
      if (!error) {
        const { data: urlData } = supabase.storage.from("marketplace").getPublicUrl(path);
        imageUrls.push(urlData.publicUrl);
      }
    }

    const { error } = await supabase.from("marketplace_listings").insert({
      user_id: currentUserId,
      title: newTitle.trim(),
      description: newDescription.trim() || null,
      price: parseFloat(newPrice),
      category: newCategory.toLowerCase(),
      condition: newCondition.toLowerCase(),
      location: newLocation.trim() || null,
      image_urls: imageUrls,
    });

    if (error) {
      toast({ title: "Error creating listing", variant: "destructive" });
    } else {
      toast({ title: "Listing created!" });
      setCreateOpen(false);
      resetForm();
      loadListings();
    }
    setSubmitting(false);
  };

  const resetForm = () => {
    setNewTitle(""); setNewDescription(""); setNewPrice("");
    setNewCategory("Other"); setNewCondition("Good"); setNewLocation(""); setNewImages([]);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setNewImages(prev => [...prev, ...Array.from(e.target.files!).slice(0, 5 - prev.length)]);
    }
  };

  if (!currentUserId) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId} />

      <div className="max-w-[1200px] mx-auto px-4 py-6 pb-24 md:pb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold font-display">Marketplace</h1>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl gap-2">
                <Plus className="h-4 w-4" /> Sell Item
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">Create Listing</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <Input placeholder="Item title" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                <Textarea placeholder="Description (optional)" value={newDescription} onChange={e => setNewDescription(e.target.value)} rows={3} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="number" placeholder="Price" value={newPrice} onChange={e => setNewPrice(e.target.value)} className="pl-9" min="0" step="0.01" />
                  </div>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.filter(c => c !== "All").map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Select value={newCondition} onValueChange={setNewCondition}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONDITIONS.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Location" value={newLocation} onChange={e => setNewLocation(e.target.value)} className="pl-9" />
                  </div>
                </div>

                {/* Image upload */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium mb-2">
                    <ImagePlus className="h-4 w-4" /> Photos ({newImages.length}/5)
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {newImages.map((file, i) => (
                      <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
                        <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                        <button onClick={() => setNewImages(prev => prev.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {newImages.length < 5 && (
                      <label className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                        <Plus className="h-5 w-5 text-muted-foreground" />
                        <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                      </label>
                    )}
                  </div>
                </div>

                <Button onClick={handleCreateListing} disabled={submitting || !newTitle.trim() || !newPrice} className="w-full rounded-xl">
                  {submitting ? "Posting..." : "Post Listing"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search marketplace..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-hide">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 border",
                selectedCategory === cat
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : "bg-secondary/60 text-foreground border-border hover:bg-secondary"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Listings Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-square rounded-xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-5 w-1/3" />
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Tag className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium">No listings found</p>
            <p className="text-sm mt-1">Be the first to sell something!</p>
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <AnimatePresence>
              {listings.map(listing => (
                <motion.div
                  key={listing.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card
                    className="overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-200 group border-border/50"
                    onClick={() => setDetailListing(listing)}
                  >
                    <div className="aspect-square bg-muted relative overflow-hidden">
                      {listing.image_urls?.length > 0 ? (
                        <img
                          src={listing.image_urls[0]}
                          alt={listing.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Tag className="h-10 w-10 text-muted-foreground/30" />
                        </div>
                      )}
                      <Badge className="absolute top-2 left-2 bg-background/80 text-foreground backdrop-blur-sm text-xs capitalize">
                        {listing.category}
                      </Badge>
                    </div>
                    <CardContent className="p-3">
                      <p className="font-semibold text-lg text-primary">${Number(listing.price).toFixed(2)}</p>
                      <p className="text-sm font-medium truncate mt-0.5">{listing.title}</p>
                      {listing.location && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" /> {listing.location}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailListing} onOpenChange={() => setDetailListing(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {detailListing && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">{detailListing.title}</DialogTitle>
              </DialogHeader>
              {detailListing.image_urls?.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {detailListing.image_urls.map((url, i) => (
                    <img key={i} src={url} alt="" className="h-48 rounded-xl object-cover flex-shrink-0" />
                  ))}
                </div>
              )}
              <div className="space-y-3">
                <p className="text-2xl font-bold text-primary">${Number(detailListing.price).toFixed(2)}</p>
                <div className="flex gap-2">
                  <Badge variant="secondary" className="capitalize">{detailListing.category}</Badge>
                  <Badge variant="outline" className="capitalize">{detailListing.condition}</Badge>
                </div>
                {detailListing.description && <p className="text-sm text-muted-foreground">{detailListing.description}</p>}
                {detailListing.location && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {detailListing.location}
                  </p>
                )}
                {detailListing.profiles && (
                  <div className="flex items-center gap-3 pt-3 border-t border-border">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={detailListing.profiles.avatar_url || undefined} />
                      <AvatarFallback>{detailListing.profiles.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{detailListing.profiles.full_name || "User"}</p>
                      <p className="text-xs text-muted-foreground">Seller</p>
                    </div>
                    <Button className="ml-auto rounded-xl" onClick={() => navigate(`/messages`)}>
                      Message Seller
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Marketplace;
