import { useState, useEffect, useMemo } from "react";
import { useSingleFlight } from "@/hooks/use-single-flight";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/useSEO";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Flag, Globe, MapPin, Mail, Phone, ThumbsUp, MessageCircle, ArrowLeft,
  Trash2, Edit, Camera, Loader2, Send, ImagePlus, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { PAGE_CATEGORIES, pageCategoryLabel } from "@/lib/page-categories";
import { displayUrl, safeWebsiteUrl } from "@/lib/safe-url";

interface PageData {
  id: string;
  owner_id: string;
  name: string;
  category: string;
  description: string | null;
  about: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  followers_count: number;
  created_at: string;
}

interface PagePost {
  id: string;
  page_id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  likes_count: number;
  comments_count: number;
  user_liked: boolean;
}

interface PostComment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
}

/** Each upload gets its own file name: re-using one would need overwrite rights and get cached. */
const uploadPageImage = async (userId: string, pageId: string, kind: string, file: File) => {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/${pageId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("page-images").upload(path, file, { contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("page-images").getPublicUrl(path).data.publicUrl;
};

const emptyEdit = { name: "", category: "business", description: "", about: "", website: "", email: "", phone: "", location: "" };

const PageDetail = () => {
  const { pageId } = useParams<{ pageId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [page, setPage] = useState<PageData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [posts, setPosts] = useState<PagePost[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [newPost, setNewPost] = useState("");
  const [postImage, setPostImage] = useState<File | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [edit, setEdit] = useState(emptyEdit);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "cover" | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "page" } | { kind: "post"; id: string } | null>(null);
  useSEO({ title: page?.name ?? "Page", description: page?.description ?? "A page on Ember." });

  const postImagePreview = useMemo(() => (postImage ? URL.createObjectURL(postImage) : null), [postImage]);
  useEffect(() => () => { if (postImagePreview) URL.revokeObjectURL(postImagePreview); }, [postImagePreview]);

  // Comments state
  const [commentsMap, setCommentsMap] = useState<Record<string, PostComment[]>>({});
  const [showComments, setShowComments] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  const checkAuth = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    setCurrentUserId(session.user.id);
  });

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const loadPage = useEffectEvent(async () => {
    const { data } = await supabase.from("pages").select("*").eq("id", pageId!).maybeSingle();
    if (!data) { setStatus("missing"); return; }
    setPage(data);
    setStatus("ready");
  });

  const loadPosts = useEffectEvent(async () => {
    const { data: postsData } = await supabase
      .from("page_posts")
      .select("*")
      .eq("page_id", pageId!)
      .order("created_at", { ascending: false });

    if (!postsData?.length) { setPosts([]); return; }
    const postIds = postsData.map((p) => p.id);

    const [likesRes, commentsRes] = await Promise.all([
      supabase.from("page_post_likes").select("post_id, user_id").in("post_id", postIds),
      supabase.from("page_post_comments").select("post_id").in("post_id", postIds),
    ]);

    const likeCounts: Record<string, number> = {};
    const liked = new Set<string>();
    for (const l of likesRes.data ?? []) {
      likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
      if (l.user_id === currentUserId) liked.add(l.post_id);
    }
    const commentCounts: Record<string, number> = {};
    for (const c of commentsRes.data ?? []) commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1;

    setPosts(postsData.map((p) => ({
      ...p,
      likes_count: likeCounts[p.id] || 0,
      comments_count: commentCounts[p.id] || 0,
      user_liked: liked.has(p.id),
    })));
  });

  const checkFollowing = useEffectEvent(async () => {
    if (!currentUserId) return;
    const { data } = await supabase.from("page_followers")
      .select("id").eq("page_id", pageId!).eq("user_id", currentUserId).maybeSingle();
    setIsFollowing(!!data);
  });

  useEffect(() => {
    if (currentUserId && pageId) {
      setStatus("loading");
      loadPage();
      loadPosts();
      checkFollowing();
    }
  }, [currentUserId, pageId, checkFollowing, loadPage, loadPosts]);

  const toggleFollow = async () => {
    if (!currentUserId || !page) return;
    const was = isFollowing;
    const apply = (following: boolean) => {
      setIsFollowing(following);
      setPage((prev) => prev ? { ...prev, followers_count: Math.max(0, prev.followers_count + (following ? 1 : -1)) } : prev);
    };
    apply(!was);
    const { error } = was
      ? await supabase.from("page_followers").delete().eq("page_id", page.id).eq("user_id", currentUserId)
      : await supabase.from("page_followers").insert({ page_id: page.id, user_id: currentUserId });
    if (error) {
      apply(was);
      toast({ title: "Couldn't update follow", variant: "destructive" });
    }
  };

  // Extra taps while this is saving do nothing (no double posts on a slow network).
  const onceHandlePost = useSingleFlight();
  const handlePost = onceHandlePost(async () => {
    if (!currentUserId || !page || (!newPost.trim() && !postImage)) return;
    setIsPosting(true);
    try {
      const imageUrl = postImage ? await uploadPageImage(currentUserId, page.id, "post", postImage) : null;
      const { error } = await supabase.from("page_posts").insert({
        page_id: page.id,
        user_id: currentUserId,
        content: newPost.trim(),
        image_url: imageUrl,
      });
      if (error) throw error;
      setNewPost("");
      setPostImage(null);
      loadPosts();
    } catch (e) {
      toast({ title: "Couldn't publish the post", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setIsPosting(false);
    }
  });

  const deletePost = async (postId: string) => {
    const { error } = await supabase.from("page_posts").delete().eq("id", postId);
    if (error) {
      toast({ title: "Couldn't delete the post", variant: "destructive" });
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const toggleLike = async (postId: string) => {
    if (!currentUserId) return;
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const apply = (liked: boolean) =>
      setPosts((prev) => prev.map((p) => p.id === postId
        ? { ...p, user_liked: liked, likes_count: Math.max(0, p.likes_count + (liked ? 1 : -1)) }
        : p));
    apply(!post.user_liked);
    const { error } = post.user_liked
      ? await supabase.from("page_post_likes").delete().eq("post_id", postId).eq("user_id", currentUserId)
      : await supabase.from("page_post_likes").insert({ post_id: postId, user_id: currentUserId });
    if (error) apply(post.user_liked);
  };

  const loadComments = async (postId: string) => {
    const { data } = await supabase.from("page_post_comments")
      .select(`*, profiles:user_id (id, full_name, avatar_url)`)
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    setCommentsMap((prev) => ({ ...prev, [postId]: (data ?? []) as PostComment[] }));
  };

  const toggleComments = (postId: string) => {
    const isShowing = !showComments[postId];
    setShowComments((prev) => ({ ...prev, [postId]: isShowing }));
    if (isShowing && !commentsMap[postId]) loadComments(postId);
  };

  // Extra taps while this is saving do nothing (no double posts on a slow network).
  const onceSubmitComment = useSingleFlight();
  const submitComment = onceSubmitComment(async (postId: string) => {
    const content = commentInputs[postId]?.trim();
    if (!currentUserId || !content) return;
    const { error } = await supabase.from("page_post_comments").insert({ post_id: postId, user_id: currentUserId, content });
    if (error) {
      toast({ title: "Couldn't post your comment", variant: "destructive" });
      return;
    }
    setCommentInputs((prev) => ({ ...prev, [postId]: "" }));
    loadComments(postId);
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p)));
  });

  const deleteComment = async (postId: string, commentId: string) => {
    const { error } = await supabase.from("page_post_comments").delete().eq("id", commentId);
    if (error) return;
    setCommentsMap((prev) => ({ ...prev, [postId]: (prev[postId] ?? []).filter((c) => c.id !== commentId) }));
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, comments_count: Math.max(0, p.comments_count - 1) } : p)));
  };

  const openEdit = () => {
    if (!page) return;
    setEdit({
      name: page.name,
      category: page.category,
      description: page.description ?? "",
      about: page.about ?? "",
      website: page.website ?? "",
      email: page.email ?? "",
      phone: page.phone ?? "",
      location: page.location ?? "",
    });
    setShowEdit(true);
  };

  const websiteInvalid = !!edit.website.trim() && !safeWebsiteUrl(edit.website);
  const emailInvalid = !!edit.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(edit.email.trim());

  const saveEdit = async () => {
    if (!page || !edit.name.trim() || websiteInvalid || emailInvalid) return;
    setIsSavingEdit(true);
    const changes = {
      name: edit.name.trim(),
      category: edit.category,
      about: edit.about.trim() || null,
      description: edit.description.trim() || null,
      website: safeWebsiteUrl(edit.website),
      email: edit.email.trim() || null,
      phone: edit.phone.trim() || null,
      location: edit.location.trim() || null,
    };
    const { error } = await supabase.from("pages").update(changes).eq("id", page.id);
    setIsSavingEdit(false);
    if (error) {
      toast({ title: "Couldn't save your changes", description: error.message, variant: "destructive" });
      return;
    }
    setPage({ ...page, ...changes });
    setShowEdit(false);
  };

  const deletePage = async () => {
    if (!page) return;
    const { error } = await supabase.from("pages").delete().eq("id", page.id);
    if (error) {
      toast({ title: "Couldn't delete the page", variant: "destructive" });
      return;
    }
    toast({ title: `${page.name} was deleted` });
    navigate("/pages", { replace: true });
  };

  const handleImage = async (kind: "avatar" | "cover", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!page || !currentUserId || !file) return;
    setUploading(kind);
    try {
      const url = await uploadPageImage(currentUserId, page.id, kind, file);
      const column = kind === "avatar" ? "avatar_url" : "cover_url";
      const { error } = await supabase.from("pages").update({ [column]: url }).eq("id", page.id);
      if (error) throw error;
      setPage({ ...page, [column]: url });
    } catch {
      toast({ title: "Upload failed", description: "Please try another image.", variant: "destructive" });
    } finally {
      setUploading(null);
    }
  };

  const isOwner = currentUserId === page?.owner_id;
  const website = safeWebsiteUrl(page?.website);

  if (status === "missing") {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <div className="max-w-md mx-auto px-6 py-20 text-center">
          <Flag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-xl font-semibold">This page isn't available</h1>
          <p className="text-sm text-muted-foreground mt-1">It may have been deleted.</p>
          <Button asChild className="mt-6 rounded-full"><Link to="/pages">Browse pages</Link></Button>
        </div>
      </div>
    );
  }

  if (status === "loading" || !page) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation currentUserId={currentUserId || undefined} />

      <div className="flex-1">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 pb-28 md:pb-8">
          <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 rounded-full">
            <Link to="/pages"><ArrowLeft className="h-4 w-4 mr-1.5" /> Pages</Link>
          </Button>

          {/* Cover + Avatar */}
          <Card className="overflow-hidden mb-4">
            <div className="relative h-36 sm:h-56 bg-gradient-to-br from-primary/20 to-primary/5">
              {page.cover_url && <img src={page.cover_url} alt="" className="w-full h-full object-cover" />}
              {isOwner && (
                <label className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-background/85 backdrop-blur rounded-full px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-background transition-colors">
                  {uploading === "cover" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  {page.cover_url ? "Change cover" : "Add cover"}
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => handleImage("cover", e)} disabled={!!uploading} />
                </label>
              )}
            </div>
            <div className="px-4 sm:px-6 pb-5">
              <div className="flex items-end gap-4 -mt-10">
                <div className="relative shrink-0">
                  <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl border-4 border-card bg-secondary overflow-hidden shadow-lg">
                    {page.avatar_url ? (
                      <img src={page.avatar_url} alt={page.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-primary/10">
                        <Flag className="h-8 w-8 text-primary" />
                      </div>
                    )}
                  </div>
                  {isOwner && (
                    <label className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1.5 cursor-pointer hover:bg-primary/90 transition-colors shadow" aria-label="Change page photo">
                      {uploading === "avatar" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                      <input type="file" accept="image/*" className="sr-only" onChange={(e) => handleImage("avatar", e)} disabled={!!uploading} />
                    </label>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <h1 className="text-xl sm:text-2xl font-bold break-words">{page.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {pageCategoryLabel(page.category)} · {page.followers_count} {page.followers_count === 1 ? "follower" : "followers"}
                </p>
                {page.description && <p className="text-sm mt-2">{page.description}</p>}
              </div>
              <div className="flex gap-2 mt-4">
                {isOwner ? (
                  <Button variant="secondary" className="gap-2 rounded-xl" onClick={openEdit}>
                    <Edit className="h-4 w-4" /> Edit page
                  </Button>
                ) : (
                  <Button onClick={toggleFollow} variant={isFollowing ? "secondary" : "default"} className="flex-1 sm:flex-none rounded-xl min-w-28" aria-pressed={isFollowing}>
                    {isFollowing ? "Following" : "Follow"}
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* About Section */}
          {(page.about || website || page.email || page.phone || page.location) && (
            <Card className="p-4 sm:p-6 mb-4">
              <h2 className="font-bold text-lg mb-3">About</h2>
              {page.about && <p className="text-sm text-muted-foreground mb-3 whitespace-pre-wrap">{page.about}</p>}
              <div className="space-y-2.5 text-sm">
                {website && (
                  <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-2 text-primary hover:underline break-all">
                    <Globe className="h-4 w-4 text-muted-foreground shrink-0" /> {displayUrl(website)}
                  </a>
                )}
                {page.email && (
                  <a href={`mailto:${page.email}`} className="flex items-center gap-2 hover:text-primary break-all">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" /> {page.email}
                  </a>
                )}
                {page.phone && (
                  <a href={`tel:${page.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 hover:text-primary">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" /> {page.phone}
                  </a>
                )}
                {page.location && (
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" /> {page.location}
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Create Post (owner only) */}
          {isOwner && (
            <Card className="p-4 mb-4">
              <Textarea
                aria-label={`Post as ${page.name}`}
                placeholder={`Post as ${page.name}...`}
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                rows={3}
              />
              {postImagePreview && (
                <div className="relative mt-2 inline-block">
                  <img src={postImagePreview} alt="" className="max-h-48 rounded-lg" />
                  <Button size="icon" variant="secondary" className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full" onClick={() => setPostImage(null)} aria-label="Remove photo">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer rounded-lg px-2 py-1.5 hover:bg-accent">
                  <ImagePlus className="h-4 w-4 text-primary" /> Photo
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => { setPostImage(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                </label>
                <Button onClick={handlePost} disabled={(!newPost.trim() && !postImage) || isPosting} size="sm" className="rounded-xl px-5">
                  {isPosting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Post
                </Button>
              </div>
            </Card>
          )}

          {/* Posts Feed */}
          {posts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">{isOwner ? "Write your first post above." : "No posts on this page yet."}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <motion.div key={post.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                        {page.avatar_url ? <img src={page.avatar_url} alt="" className="w-full h-full object-cover" /> : <Flag className="h-5 w-5 text-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{page.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {isOwner && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Delete post" onClick={() => setConfirm({ kind: "post", id: post.id })}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                    {post.content && <p className="text-sm whitespace-pre-wrap mb-3 break-words">{post.content}</p>}
                    {post.image_url && <img src={post.image_url} alt="" loading="lazy" className="rounded-lg w-full mb-3" />}
                    <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                      <Button
                        variant="ghost" size="sm"
                        className={cn("gap-1.5 h-8 text-xs", post.user_liked && "text-primary")}
                        onClick={() => toggleLike(post.id)}
                        aria-pressed={post.user_liked}
                      >
                        <ThumbsUp className={cn("h-3.5 w-3.5", post.user_liked && "fill-current")} />
                        {post.likes_count > 0 ? post.likes_count : "Like"}
                      </Button>
                      <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => toggleComments(post.id)} aria-expanded={!!showComments[post.id]}>
                        <MessageCircle className="h-3.5 w-3.5" />
                        {post.comments_count > 0 ? post.comments_count : "Comment"}
                      </Button>
                    </div>

                    {/* Comments */}
                    {showComments[post.id] && (
                      <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                        {commentsMap[post.id]?.map((c) => (
                          <div key={c.id} className="flex gap-2 group/comment">
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={c.profiles?.avatar_url || undefined} alt="" />
                              <AvatarFallback className="text-[10px]">{c.profiles?.full_name?.[0] || "U"}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="bg-secondary rounded-xl px-3 py-1.5">
                                <p className="text-xs font-semibold">{c.profiles?.full_name || "User"}</p>
                                <p className="text-sm break-words">{c.content}</p>
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5 ml-3 flex gap-3">
                                {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                                {c.user_id === currentUserId && (
                                  <button className="hover:text-destructive" onClick={() => deleteComment(post.id, c.id)}>Delete</button>
                                )}
                              </p>
                            </div>
                          </div>
                        ))}
                        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submitComment(post.id); }}>
                          <Input
                            aria-label="Write a comment"
                            placeholder="Write a comment..."
                            value={commentInputs[post.id] || ""}
                            onChange={(e) => setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))}
                            className="h-9 text-sm rounded-full"
                          />
                          <Button type="submit" size="icon" className="h-9 w-9 rounded-full shrink-0" disabled={!commentInputs[post.id]?.trim()} aria-label="Send comment">
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        </form>
                      </div>
                    )}
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit page</DialogTitle>
            <DialogDescription>This is what visitors see on your page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label htmlFor="pg-name">Name</Label><Input id="pg-name" maxLength={80} value={edit.name} onChange={(e) => setEdit((p) => ({ ...p, name: e.target.value }))} className="mt-1" /></div>
            <div>
              <Label>Category</Label>
              <Select value={edit.category} onValueChange={(v) => setEdit((p) => ({ ...p, category: v }))}>
                <SelectTrigger className="mt-1" aria-label="Category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label htmlFor="pg-desc">Short description</Label><Textarea id="pg-desc" value={edit.description} onChange={(e) => setEdit((p) => ({ ...p, description: e.target.value }))} className="mt-1" rows={2} /></div>
            <div><Label htmlFor="pg-about">About</Label><Textarea id="pg-about" value={edit.about} onChange={(e) => setEdit((p) => ({ ...p, about: e.target.value }))} className="mt-1" rows={3} /></div>
            <div>
              <Label htmlFor="pg-web">Website</Label>
              <Input id="pg-web" inputMode="url" placeholder="example.com" value={edit.website} onChange={(e) => setEdit((p) => ({ ...p, website: e.target.value }))} className="mt-1" aria-invalid={websiteInvalid} />
              {websiteInvalid && <p className="text-xs text-destructive mt-1">Enter a web address like example.com</p>}
            </div>
            <div>
              <Label htmlFor="pg-email">Email</Label>
              <Input id="pg-email" type="email" value={edit.email} onChange={(e) => setEdit((p) => ({ ...p, email: e.target.value }))} className="mt-1" aria-invalid={emailInvalid} />
              {emailInvalid && <p className="text-xs text-destructive mt-1">Enter a valid email address</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label htmlFor="pg-phone">Phone</Label><Input id="pg-phone" type="tel" value={edit.phone} onChange={(e) => setEdit((p) => ({ ...p, phone: e.target.value }))} className="mt-1" /></div>
              <div><Label htmlFor="pg-loc">Location</Label><Input id="pg-loc" value={edit.location} onChange={(e) => setEdit((p) => ({ ...p, location: e.target.value }))} className="mt-1" /></div>
            </div>
            <Button className="w-full" onClick={saveEdit} disabled={isSavingEdit || !edit.name.trim() || websiteInvalid || emailInvalid}>
              {isSavingEdit && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save changes
            </Button>
            <div className="pt-3 border-t">
              <Button variant="ghost" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => { setShowEdit(false); setConfirm({ kind: "page" }); }}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete this page
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.kind === "page" ? `Delete ${page.name}?` : "Delete this post?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "page"
                ? "The page, its posts and its followers will be removed for good."
                : "The post and its likes and comments will be removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirm?.kind === "page") deletePage();
                else if (confirm?.kind === "post") deletePost(confirm.id);
                setConfirm(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PageDetail;
