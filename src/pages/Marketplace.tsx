import EmptyState from "@/components/EmptyState";
import { uploadMedia } from "@/lib/media-upload";
import { shrinkImage } from "@/lib/image-compress";
import { useEffect, useMemo, useState } from "react";
import { useSingleFlight } from "@/hooks/use-single-flight";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, HeaderAction, PageSearch, Chips } from "@/components/layout/PageHeader";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, MapPin, Tag, X, ImagePlus, DollarSign, MessageCircle, CheckCircle2, RotateCcw, Trash2, Loader2 } from "@/components/icons";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const CATEGORIES = [
  "All", "Electronics", "Vehicles", "Furniture", "Clothing", "Sports", "Books", "Home & Garden", "Toys", "Other"
];

const CONDITIONS = ["New", "Like New", "Good", "Fair", "Poor"];
const MAX_PRICE = 1_000_000_000;

const priceFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const formatPrice = (n: number) => priceFormat.format(n).replace(/\.00$/, "");

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

/** Thumbnails for picked files, with their object URLs released when no longer shown. */
const usePreviews = (files: File[]) => {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
};

const Marketplace = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  useSEO({ title: "Marketplace", description: "Buy and sell items on Ember Marketplace." });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery.trim());
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [view, setView] = useState<"browse" | "mine">("browse");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailListing, setDetailListing] = useState<Listing | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Listing | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create form state
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCategory, setNewCategory] = useState("Other");
  const [newCondition, setNewCondition] = useState("Good");
  const [newLocation, setNewLocation] = useState("");
  const [newImages, setNewImages] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const previews = usePreviews(newImages);

  const priceValue = Number(newPrice);
  const priceError = newPrice !== "" && (!Number.isFinite(priceValue) || priceValue <= 0 || priceValue > MAX_PRICE)
    ? "Enter a price above 0"
    : null;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { navigate("/auth"); return; }
      setCurrentUserId(data.user.id);
    });
  }, [navigate]);

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      let query = supabase
        .from("marketplace_listings")
        .select("*, profiles(full_name, avatar_url)")
        .order("created_at", { ascending: false });

      // Your own listings include sold ones, so you can relist them.
      query = view === "mine" ? query.eq("user_id", currentUserId) : query.eq("status", "active");
      if (selectedCategory !== "All") query = query.eq("category", selectedCategory.toLowerCase());
      if (debouncedSearch) query = query.ilike("title", `%${debouncedSearch}%`);

      const { data, error } = await query;
      if (cancelled) return;
      if (error) toast({ title: "Couldn't load listings", description: error.message, variant: "destructive" });
      else setListings((data ?? []) as unknown as Listing[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [currentUserId, view, selectedCategory, debouncedSearch, toast]);

  const resetForm = () => {
    setNewTitle(""); setNewDescription(""); setNewPrice("");
    setNewCategory("Other"); setNewCondition("Good"); setNewLocation(""); setNewImages([]);
  };

  // Extra taps while this is saving do nothing (no double posts on a slow network).
  const onceHandleCreateListing = useSingleFlight();
  const handleCreateListing = onceHandleCreateListing(async () => {
    if (!currentUserId || !newTitle.trim() || !newPrice || priceError) return;
    setSubmitting(true);

    const imageUrls: string[] = [];
    let failedUploads = 0;
    for (const picked of newImages) {
      const file = await shrinkImage(picked);
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${currentUserId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      try {
        imageUrls.push(await uploadMedia("marketplace", path, file));
      } catch {
        failedUploads++;
      }
    }

    const { data, error } = await supabase.from("marketplace_listings").insert({
      user_id: currentUserId,
      title: newTitle.trim(),
      description: newDescription.trim() || null,
      price: Math.round(priceValue * 100) / 100,
      category: newCategory.toLowerCase(),
      condition: newCondition.toLowerCase(),
      location: newLocation.trim() || null,
      image_urls: imageUrls,
    }).select("*, profiles(full_name, avatar_url)").single();

    setSubmitting(false);
    if (error) {
      toast({ title: "Couldn't create the listing", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Listing created!",
      description: failedUploads ? `${failedUploads} photo${failedUploads === 1 ? "" : "s"} couldn't be uploaded.` : undefined,
    });
    setCreateOpen(false);
    resetForm();
    if (data) setListings((prev) => [data as unknown as Listing, ...prev]);
  });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    setNewImages((prev) => [...prev, ...files].slice(0, 5));
    e.target.value = "";
  };

  const setStatus = async (listing: Listing, status: "active" | "sold") => {
    setBusyId(listing.id);
    const { error } = await supabase.from("marketplace_listings").update({ status }).eq("id", listing.id);
    setBusyId(null);
    if (error) {
      toast({ title: "Couldn't update the listing", variant: "destructive" });
      return;
    }
    const updated = { ...listing, status };
    setDetailListing(updated);
    setListings((prev) =>
      view === "browse" && status === "sold"
        ? prev.filter((l) => l.id !== listing.id)
        : prev.map((l) => (l.id === listing.id ? updated : l))
    );
    toast({ title: status === "sold" ? "Marked as sold" : "Listed again" });
  };

  const deleteListing = async (listing: Listing) => {
    setPendingDelete(null);
    const { error } = await supabase.from("marketplace_listings").delete().eq("id", listing.id);
    if (error) {
      toast({ title: "Couldn't delete the listing", variant: "destructive" });
      return;
    }
    const marker = "/storage/v1/object/public/marketplace/";
    const paths = listing.image_urls
      .map((u) => (u.includes(marker) ? decodeURIComponent(u.split(marker)[1]) : null))
      .filter((p): p is string => !!p);
    if (paths.length) supabase.storage.from("marketplace").remove(paths);
    setDetailListing(null);
    setListings((prev) => prev.filter((l) => l.id !== listing.id));
    toast({ title: "Listing deleted" });
  };

  if (!currentUserId) return null;

  const isOwn = detailListing?.user_id === currentUserId;

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId} />

      <div className="page-flush max-w-[1200px] mx-auto px-0 sm:px-4 pb-6 sm:py-6">
          <Dialog open={createOpen} onOpenChange={(open) => !submitting && setCreateOpen(open)}>
            <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">Create listing</DialogTitle>
                <DialogDescription>Buyers can message you straight from your listing.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <Input aria-label="Item title" placeholder="Item title" value={newTitle} maxLength={100} onChange={(e) => setNewTitle(e.target.value)} />
                <Textarea aria-label="Description" placeholder="Description (optional)" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={3} />
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
                  <div>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        aria-label="Price"
                        aria-invalid={!!priceError}
                        type="number"
                        inputMode="decimal"
                        placeholder="Price"
                        value={newPrice}
                        onChange={(e) => setNewPrice(e.target.value)}
                        className={cn("pl-9", priceError && "border-destructive focus-visible:ring-destructive")}
                        min="0.01"
                        step="0.01"
                      />
                    </div>
                    {priceError && <p className="text-xs text-destructive mt-1">{priceError}</p>}
                  </div>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.filter((c) => c !== "All").map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
                  <Select value={newCondition} onValueChange={setNewCondition}>
                    <SelectTrigger aria-label="Condition"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONDITIONS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input aria-label="Location" placeholder="Location" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} className="pl-9" />
                  </div>
                </div>

                {/* Image upload */}
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium mb-2">
                    <ImagePlus className="h-4 w-4" /> Photos ({newImages.length}/5)
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {previews.map((url, i) => (
                      <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setNewImages((prev) => prev.filter((_, j) => j !== i))}
                          className="absolute top-1 right-1 bg-background/90 rounded-full p-1 shadow"
                          aria-label={`Remove photo ${i + 1}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {newImages.length < 5 && (
                      <label className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                        <Plus className="h-5 w-5 text-muted-foreground" />
                        <span className="sr-only">Add photos</span>
                        <input type="file" accept="image/*" multiple className="sr-only" onChange={handleImageSelect} />
                      </label>
                    )}
                  </div>
                </div>

                <Button onClick={handleCreateListing} disabled={submitting || !newTitle.trim() || !newPrice || !!priceError} className="w-full rounded-xl">
                  {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Posting…</> : "Post listing"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

        <PageHeader
          back
          title="Marketplace"
          actions={<HeaderAction icon={Plus} label="Sell item" primary onClick={() => setCreateOpen(true)} />}
          className="sm:mb-4"
        >
          <PageSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search marketplace" />
          <Chips
            label="Listings"
            value={view}
            onChange={setView}
            options={[
              { value: "browse", label: "Browse" },
              { value: "mine", label: "Your listings" },
            ]}
          />
        </PageHeader>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto py-3 sm:pt-0 sm:mb-2 scrollbar-hide px-3 sm:px-0" role="group" aria-label="Category">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              aria-pressed={selectedCategory === cat}
              className={cn(
                "h-8 px-3.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors",
                selectedCategory === cat
                  ? "bg-foreground text-background"
                  : "bg-secondary text-foreground hover:bg-secondary/70"
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Listings Grid */}
        {loading && listings.length === 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 px-2 sm:px-0 sm:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-square rounded-xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-5 w-1/3" />
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <EmptyState
            emoji={debouncedSearch ? "search" : "mailbox"}
            title={debouncedSearch ? "No listings match your search" : view === "mine" ? "You haven't listed anything yet" : "No listings yet"}
            text={view === "mine" ? "Tap “Sell item” to list something." : "Be the first to sell something!"}
          />
        ) : (
          <motion.div layout className={cn("grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 px-2 sm:px-0 sm:gap-4 transition-opacity", loading && "opacity-60")}>
            <AnimatePresence>
              {listings.map((listing) => (
                <motion.div
                  key={listing.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="overflow-hidden border-border/50 hover:shadow-lg transition-all duration-200 group">
                    <button type="button" className="block w-full text-left" onClick={() => setDetailListing(listing)}>
                      <div className="aspect-square bg-muted relative overflow-hidden">
                        {listing.image_urls?.length > 0 ? (
                          <img
                            src={listing.image_urls[0]}
                            alt={listing.title}
                            loading="lazy"
                            className={cn("w-full h-full object-cover group-hover:scale-105 transition-transform duration-300", listing.status === "sold" && "grayscale")}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Tag className="h-10 w-10 text-muted-foreground/30" />
                          </div>
                        )}
                        <Badge className="absolute top-2 left-2 bg-background/85 text-foreground hover:bg-background/85 backdrop-blur-sm text-xs capitalize">
                          {listing.category}
                        </Badge>
                        {listing.status === "sold" && (
                          <Badge className="absolute top-2 right-2 bg-foreground text-background hover:bg-foreground">Sold</Badge>
                        )}
                      </div>
                      <CardContent className="p-3">
                        <p className="font-semibold text-base sm:text-lg text-primary">{formatPrice(Number(listing.price))}</p>
                        <p className="text-sm font-medium truncate mt-0.5">{listing.title}</p>
                        {listing.location && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 truncate">
                            <MapPin className="h-3 w-3 shrink-0" /> {listing.location}
                          </p>
                        )}
                      </CardContent>
                    </button>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailListing} onOpenChange={(open) => !open && setDetailListing(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          {detailListing && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display pr-6">{detailListing.title}</DialogTitle>
                <DialogDescription>
                  Listed {formatDistanceToNow(new Date(detailListing.created_at), { addSuffix: true })}
                  {detailListing.status === "sold" && " · Sold"}
                </DialogDescription>
              </DialogHeader>
              {detailListing.image_urls?.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1">
                  {detailListing.image_urls.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`${detailListing.title}, photo ${i + 1}`}
                      className={cn(
                        "h-56 rounded-xl object-cover flex-shrink-0 snap-center",
                        detailListing.image_urls.length === 1 ? "w-full" : "w-[85%]"
                      )}
                    />
                  ))}
                </div>
              )}
              <div className="space-y-3">
                <p className="text-2xl font-bold text-primary">{formatPrice(Number(detailListing.price))}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="capitalize">{detailListing.category}</Badge>
                  <Badge variant="outline" className="capitalize">{detailListing.condition}</Badge>
                </div>
                {detailListing.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{detailListing.description}</p>}
                {detailListing.location && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {detailListing.location}
                  </p>
                )}

                {isOwn ? (
                  <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
                    {detailListing.status === "sold" ? (
                      <Button variant="outline" className="rounded-xl flex-1" disabled={busyId === detailListing.id} onClick={() => setStatus(detailListing, "active")}>
                        <RotateCcw className="h-4 w-4 mr-2" /> List again
                      </Button>
                    ) : (
                      <Button className="rounded-xl flex-1" disabled={busyId === detailListing.id} onClick={() => setStatus(detailListing, "sold")}>
                        <CheckCircle2 className="h-4 w-4 mr-2" /> Mark as sold
                      </Button>
                    )}
                    <Button variant="outline" className="rounded-xl text-destructive hover:text-destructive" onClick={() => setPendingDelete(detailListing)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </Button>
                  </div>
                ) : (
                  detailListing.profiles && (
                    <div className="flex items-center gap-3 pt-3 border-t border-border">
                      <button
                        type="button"
                        className="flex items-center gap-3 min-w-0 text-left"
                        onClick={() => navigate(`/profile/${detailListing.user_id}`)}
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={detailListing.profiles.avatar_url || undefined} alt="" />
                          <AvatarFallback>{detailListing.profiles.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="block font-medium text-sm truncate">{detailListing.profiles.full_name || "User"}</span>
                          <span className="block text-xs text-muted-foreground">Seller</span>
                        </span>
                      </button>
                      <Button className="ml-auto rounded-xl shrink-0" onClick={() => navigate(`/messages?user=${detailListing.user_id}`)}>
                        <MessageCircle className="h-4 w-4 mr-2" /> Message
                      </Button>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this listing?</AlertDialogTitle>
            <AlertDialogDescription>"{pendingDelete?.title}" will be removed for good.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDelete && deleteListing(pendingDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Marketplace;
