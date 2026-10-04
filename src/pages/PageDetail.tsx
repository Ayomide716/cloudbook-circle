import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Flag, Users, Globe, MapPin, Mail, Phone, ThumbsUp, MessageCircle,
  Trash2, Edit, Camera, Loader2, Send
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { useEffectEvent } from "@/hooks/use-effect-event";

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
  profiles: { id: string; full_name: string | null; avatar_url: string | null };
}

const PageDetail = () => {
  const { pageId } = useParams<{ pageId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [page, setPage] = useState<PageData | null>(null);
  const [posts, setPosts] = useState<PagePost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [newPost, setNewPost] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editAbout, setEditAbout] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

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
    const { data, error } = await supabase.from("pages").select("*").eq("id", pageId!).single();
    if (error || !data) { navigate("/pages"); return; }
    setPage(data);
    setEditAbout(data.about || "");
    setEditDesc(data.description || "");
    setEditWebsite(data.website || "");
    setEditEmail(data.email || "");
    setEditPhone(data.phone || "");
    setEditLocation(data.location || "");
    setIsLoading(false);
  });

  const loadPosts = useEffectEvent(async () => {
    const { data: postsData } = await supabase
      .from("page_posts")
      .select("*")
      .eq("page_id", pageId!)
      .order("created_at", { ascending: false });

    if (!postsData) { setPosts([]); return; }

    const postIds = postsData.map(p => p.id);

    const [likesRes, commentsRes, userLikesRes] = await Promise.all([
      supabase.from("page_post_likes").select("post_id").in("post_id", postIds),
      supabase.from("page_post_comments").select("post_id").in("post_id", postIds),
      currentUserId
        ? supabase.from("page_post_likes").select("post_id").in("post_id", postIds).eq("user_id", currentUserId)
        : Promise.resolve({ data: [] }),
    ]);

    const likeCounts: Record<string, number> = {};
    likesRes.data?.forEach(l => { likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1; });
    const commentCounts: Record<string, number> = {};
    commentsRes.data?.forEach(c => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1; });
    const userLikedSet = new Set(userLikesRes.data?.map(l => l.post_id) || []);

    setPosts(postsData.map(p => ({
      ...p,
      likes_count: likeCounts[p.id] || 0,
      comments_count: commentCounts[p.id] || 0,
      user_liked: userLikedSet.has(p.id),
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
      loadPage();
      loadPosts();
      checkFollowing();
    }
  }, [currentUserId, pageId, checkFollowing, loadPage, loadPosts]);

  const toggleFollow = async () => {
    if (!currentUserId || !page) return;
    if (isFollowing) {
      await supabase.from("page_followers").delete().eq("page_id", page.id).eq("user_id", currentUserId);
      setIsFollowing(false);
      setPage(prev => prev ? { ...prev, followers_count: Math.max(0, prev.followers_count - 1) } : prev);
    } else {
      await supabase.from("page_followers").insert({ page_id: page.id, user_id: currentUserId });
      setIsFollowing(true);
      setPage(prev => prev ? { ...prev, followers_count: prev.followers_count + 1 } : prev);
    }
  };

  const handlePost = async () => {
    if (!currentUserId || !page || !newPost.trim()) return;
    setIsPosting(true);
    const { error } = await supabase.from("page_posts").insert({
      page_id: page.id,
      user_id: currentUserId,
      content: newPost.trim(),
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setNewPost("");
      loadPosts();
    }
    setIsPosting(false);
  };

  const toggleLike = async (postId: string) => {
    if (!currentUserId) return;
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    if (post.user_liked) {
      await supabase.from("page_post_likes").delete().eq("post_id", postId).eq("user_id", currentUserId);
    } else {
      await supabase.from("page_post_likes").insert({ post_id: postId, user_id: currentUserId });
    }
    setPosts(prev => prev.map(p => p.id === postId ? {
      ...p,
      user_liked: !p.user_liked,
      likes_count: p.user_liked ? Math.max(0, p.likes_count - 1) : p.likes_count + 1,
    } : p));
  };

  const loadComments = async (postId: string) => {
    const { data } = await supabase.from("page_post_comments")
      .select(`*, profiles:user_id (id, full_name, avatar_url)`)
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    setCommentsMap(prev => ({ ...prev, [postId]: data || [] }));
  };

  const toggleComments = (postId: string) => {
    const isShowing = !showComments[postId];
    setShowComments(prev => ({ ...prev, [postId]: isShowing }));
    if (isShowing && !commentsMap[postId]) loadComments(postId);
  };

  const submitComment = async (postId: string) => {
    if (!currentUserId || !commentInputs[postId]?.trim()) return;
    await supabase.from("page_post_comments").insert({
      post_id: postId,
      user_id: currentUserId,
      content: commentInputs[postId].trim(),
    });
    setCommentInputs(prev => ({ ...prev, [postId]: "" }));
    loadComments(postId);
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p));
  };

  const saveEdit = async () => {
    if (!page) return;
    setIsSavingEdit(true);
    await supabase.from("pages").update({
      about: editAbout.trim() || null,
      description: editDesc.trim() || null,
      website: editWebsite.trim() || null,
      email: editEmail.trim() || null,
      phone: editPhone.trim() || null,
      location: editLocation.trim() || null,
    }).eq("id", page.id);
    setShowEdit(false);
    loadPage();
    setIsSavingEdit(false);
    toast({ title: "Page updated!" });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!page || !currentUserId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const path = `${currentUserId}/${page.id}/avatar.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from("page-images").upload(path, file, { upsert: true });
    if (error) { toast({ title: "Upload failed", variant: "destructive" }); return; }
    const { data: urlData } = supabase.storage.from("page-images").getPublicUrl(path);
    await supabase.from("pages").update({ avatar_url: urlData.publicUrl }).eq("id", page.id);
    loadPage();
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!page || !currentUserId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const path = `${currentUserId}/${page.id}/cover.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from("page-images").upload(path, file, { upsert: true });
    if (error) { toast({ title: "Upload failed", variant: "destructive" }); return; }
    const { data: urlData } = supabase.storage.from("page-images").getPublicUrl(path);
    await supabase.from("pages").update({ cover_url: urlData.publicUrl }).eq("id", page.id);
    loadPage();
  };

  const isOwner = currentUserId === page?.owner_id;

  if (isLoading || !page) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
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
        <div className="max-w-3xl mx-auto px-2 sm:px-4 py-4 sm:py-6">
          {/* Cover + Avatar */}
          <Card className="overflow-hidden mb-6">
            <div className="relative h-40 sm:h-56 bg-gradient-to-br from-primary/20 to-primary/5">
              {page.cover_url && (
                <img src={page.cover_url} alt="" className="w-full h-full object-cover" />
              )}
              {isOwner && (
                <label className="absolute bottom-3 right-3 bg-background/80 backdrop-blur rounded-full p-2 cursor-pointer hover:bg-background transition-colors">
                  <Camera className="h-4 w-4" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                </label>
              )}
            </div>
            <div className="px-4 sm:px-6 pb-6">
              <div className="flex items-end gap-4 -mt-12">
                <div className="relative">
                  <div className="h-24 w-24 rounded-2xl border-4 border-background bg-secondary overflow-hidden shadow-lg">
                    {page.avatar_url ? (
                      <img src={page.avatar_url} alt={page.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-primary/10">
                        <Flag className="h-8 w-8 text-primary" />
                      </div>
                    )}
                  </div>
                  {isOwner && (
                    <label className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1.5 cursor-pointer hover:bg-primary/90 transition-colors shadow">
                      <Camera className="h-3 w-3" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                    </label>
                  )}
                </div>
                <div className="flex-1 pt-12">
                  <h1 className="text-xl sm:text-2xl font-bold">{page.name}</h1>
                  <p className="text-sm text-muted-foreground">{page.category} · {page.followers_count} followers</p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                {!isOwner && (
                  <Button onClick={toggleFollow} variant={isFollowing ? "secondary" : "default"} className="flex-1 sm:flex-none">
                    {isFollowing ? "Following" : "Follow"}
                  </Button>
                )}
                {isOwner && (
                  <Dialog open={showEdit} onOpenChange={setShowEdit}>
                    <DialogTrigger asChild>
                      <Button variant="secondary" className="gap-2">
                        <Edit className="h-4 w-4" /> Edit Page
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader><DialogTitle>Edit Page Details</DialogTitle></DialogHeader>
                      <div className="space-y-3 pt-2">
                        <div><Label>Description</Label><Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="mt-1" rows={2} /></div>
                        <div><Label>About</Label><Textarea value={editAbout} onChange={(e) => setEditAbout(e.target.value)} className="mt-1" rows={3} /></div>
                        <div><Label>Website</Label><Input value={editWebsite} onChange={(e) => setEditWebsite(e.target.value)} className="mt-1" /></div>
                        <div><Label>Email</Label><Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="mt-1" /></div>
                        <div><Label>Phone</Label><Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="mt-1" /></div>
                        <div><Label>Location</Label><Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className="mt-1" /></div>
                        <Button className="w-full" onClick={saveEdit} disabled={isSavingEdit}>
                          {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save Changes
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </Card>

          {/* About Section */}
          {(page.about || page.website || page.email || page.phone || page.location) && (
            <Card className="p-4 sm:p-6 mb-4">
              <h2 className="font-bold text-lg mb-3">About</h2>
              {page.about && <p className="text-sm text-muted-foreground mb-3 whitespace-pre-wrap">{page.about}</p>}
              <div className="space-y-2">
                {page.website && (
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <a href={page.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{page.website}</a>
                  </div>
                )}
                {page.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{page.email}</span>
                  </div>
                )}
                {page.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{page.phone}</span>
                  </div>
                )}
                {page.location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{page.location}</span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Create Post (owner only) */}
          {isOwner && (
            <Card className="p-4 mb-4">
              <Textarea
                placeholder={`Post as ${page.name}...`}
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                rows={3}
              />
              <div className="flex justify-end mt-2">
                <Button onClick={handlePost} disabled={!newPost.trim() || isPosting} size="sm">
                  {isPosting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Post
                </Button>
              </div>
            </Card>
          )}

          {/* Posts Feed */}
          {posts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No posts on this page yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map(post => (
                <motion.div key={post.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden">
                        {page.avatar_url ? (
                          <img src={page.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Flag className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{page.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {isOwner && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={async () => {
                          await supabase.from("page_posts").delete().eq("id", post.id);
                          loadPosts();
                        }}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap mb-3">{post.content}</p>
                    {post.image_url && (
                      <img src={post.image_url} alt="" className="rounded-lg w-full mb-3" />
                    )}
                    <div className="flex items-center gap-4 pt-2 border-t border-border/50">
                      <Button
                        variant="ghost" size="sm"
                        className={cn("gap-1.5 h-8 text-xs", post.user_liked && "text-primary")}
                        onClick={() => toggleLike(post.id)}
                      >
                        <ThumbsUp className={cn("h-3.5 w-3.5", post.user_liked && "fill-current")} />
                        {post.likes_count > 0 && post.likes_count}
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="gap-1.5 h-8 text-xs"
                        onClick={() => toggleComments(post.id)}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        {post.comments_count > 0 && post.comments_count}
                      </Button>
                    </div>

                    {/* Comments */}
                    {showComments[post.id] && (
                      <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                        {commentsMap[post.id]?.map(c => (
                          <div key={c.id} className="flex gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={c.profiles?.avatar_url || undefined} />
                              <AvatarFallback className="text-[10px]">{c.profiles?.full_name?.[0] || "U"}</AvatarFallback>
                            </Avatar>
                            <div className="bg-secondary rounded-xl px-3 py-1.5 flex-1">
                              <p className="text-xs font-semibold">{c.profiles?.full_name || "User"}</p>
                              <p className="text-xs">{c.content}</p>
                            </div>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <Input
                            placeholder="Write a comment..."
                            value={commentInputs[post.id] || ""}
                            onChange={(e) => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === "Enter" && submitComment(post.id)}
                            className="h-8 text-xs"
                          />
                          <Button size="icon" className="h-8 w-8" onClick={() => submitComment(post.id)} disabled={!commentInputs[post.id]?.trim()}>
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PageDetail;
