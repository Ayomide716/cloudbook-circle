import { useState, useEffect } from "react";
import { usePostInteractions } from "@/hooks/use-post-interactions";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import type { PostComment } from "@/components/PostCard";
 import Navigation from "@/components/Navigation";
 import PostCard from "@/components/PostCard";
import { PageHeader } from "@/components/layout/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { features } from "@/lib/features";
import { cn, friendlyError } from "@/lib/utils";
 import { Check, ChevronDown, Folder, Loader2, Plus } from "@/components/icons";
 import { PostSkeleton } from "@/components/skeletons/FeedSkeleton";
 import { useEffectEvent } from "@/hooks/use-effect-event";
 
 interface Post {
   id: string;
   content: string;
   image_url: string | null;
   video_url?: string | null;
   created_at: string;
   user_id: string;
   profiles: {
     id: string;
     full_name: string | null;
     avatar_url: string | null;
   };
 }
 
 const SavedPosts = () => {
  const navigate = useNavigate();
  useSEO({ title: "Saved Posts", description: "Your saved posts on Ember." });
   const [currentUserId, setCurrentUserId] = useState<string | null>(null);
   const [posts, setPosts] = useState<Post[]>([]);
  const { toast } = useToast();
  // Collections ("Recipes", "Ideas"): which one each saved post is in, and which one is open.
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [placedIn, setPlacedIn] = useState<Record<string, string | null>>({});
  const [openCollection, setOpenCollection] = useState<string | null>(null);
  const [naming, setNaming] = useState<{ forPost?: string } | null>(null);
  const [newName, setNewName] = useState("");
   const [isLoading, setIsLoading] = useState(true);
  const { reactionsData, setReactionsData, commentsData, setCommentsData, toggleReaction, reloadComments } = usePostInteractions();
 
   const checkAuth = useEffectEvent(async () => {
     const { data: { session } } = await supabase.auth.getSession();
     if (!session) {
       navigate("/auth");
       return;
     }
     setCurrentUserId(session.user.id);
     loadSavedPosts(session.user.id);
   });

   useEffect(() => {
     checkAuth();
   }, [checkAuth]);
 
   const loadSavedPosts = async (userId: string) => {
     setIsLoading(true);
 
     if (features.savedCollections) {
       const [{ data: cols }, { data: places }] = await Promise.all([
         supabase.from("saved_collections").select("id, name").eq("user_id", userId).order("created_at"),
         supabase.from("saved_posts").select("post_id, collection_id").eq("user_id", userId),
       ]);
       setCollections(cols ?? []);
       setPlacedIn(Object.fromEntries((places ?? []).map((p) => [p.post_id, p.collection_id])));
     }
     const { data: savedData } = await supabase
       .from("saved_posts")
       .select(`
         post_id,
         posts (
           id,
           content,
           image_url,
           video_url,
           created_at,
           user_id,
           profiles:user_id (id, full_name, avatar_url)
         )
       `)
       .eq("user_id", userId)
       .order("created_at", { ascending: false });
 
     if (savedData) {
       const postsArray = savedData
         .filter(s => s.posts)
         .map(s => s.posts as Post);
       setPosts(postsArray);
 
       // Load reactions and comments
       const postIds = postsArray.map(p => p.id);
       
       const { data: reactData } = await supabase
         .from("reactions")
         .select("post_id, user_id, reaction_type")
         .in("post_id", postIds);
 
       const { data: commentData } = await supabase
         .from("comments")
         .select(`*, profiles:user_id (id, full_name, avatar_url)`)
         .in("post_id", postIds)
         .order("created_at", { ascending: true });
 
       const reactionsMap: Record<string, { reactions: Record<string, number>; userReaction: string | null }> = {};
       postIds.forEach(id => {
         const postReactions = reactData?.filter(r => r.post_id === id) || [];
         const reactionCounts: Record<string, number> = {};
         postReactions.forEach(r => {
           reactionCounts[r.reaction_type] = (reactionCounts[r.reaction_type] || 0) + 1;
         });
         const userReaction = postReactions.find(r => r.user_id === userId);
         reactionsMap[id] = { reactions: reactionCounts, userReaction: userReaction?.reaction_type || null };
       });
 
       const commentsMap: Record<string, PostComment[]> = {};
       postIds.forEach(id => {
         commentsMap[id] = commentData?.filter(c => c.post_id === id) || [];
       });
 
       setReactionsData(reactionsMap);
       setCommentsData(commentsMap);
     }
 
     setIsLoading(false);
   };
 
  const moveTo = async (postId: string, collectionId: string | null) => {
    const before = placedIn[postId] ?? null;
    setPlacedIn((m) => ({ ...m, [postId]: collectionId }));
    const { error } = await supabase.from("saved_posts").update({ collection_id: collectionId }).eq("user_id", currentUserId!).eq("post_id", postId);
    if (error) {
      setPlacedIn((m) => ({ ...m, [postId]: before }));
      toast({ title: "Couldn't move it", description: friendlyError(error), variant: "destructive" });
    }
  };

  const createCollection = async () => {
    const name = newName.trim();
    if (!name || !currentUserId) return;
    const { data, error } = await supabase.from("saved_collections").insert({ user_id: currentUserId, name: name.slice(0, 40) }).select("id, name").single();
    if (error || !data) {
      toast({ title: "Couldn't make the collection", description: friendlyError(error), variant: "destructive" });
      return;
    }
    setCollections((c) => [...c, data]);
    if (naming?.forPost) void moveTo(naming.forPost, data.id);
    setNaming(null);
    setNewName("");
  };

  const shownPosts = openCollection ? posts.filter((p) => placedIn[p.id] === openCollection) : posts;

   if (isLoading || !currentUserId) {
     return (
       <div className="min-h-screen bg-background">
         <Navigation currentUserId={currentUserId || undefined} />
         <div className="page-flush max-w-2xl mx-auto px-0 sm:px-4 pb-6 sm:py-6 space-y-2 sm:space-y-3" aria-busy="true" aria-label="Loading saved posts">
          <PageHeader back title="Saved" className="sm:mb-4" />
          <PostSkeleton />
          <PostSkeleton photo={false} />
        </div>
       </div>
     );
   }
 
   return (
     <div className="content-fade min-h-screen bg-background">
       <Navigation currentUserId={currentUserId} />
 
       <div className="page-flush max-w-2xl mx-auto px-0 sm:px-4 pb-6 sm:py-6">
         <PageHeader back title="Saved" subtitle={posts.length > 0 ? `${posts.length} saved ${posts.length === 1 ? "post" : "posts"}` : undefined} className="sm:mb-4" />
 
         {features.savedCollections && posts.length > 0 && (
           <div role="group" aria-label="Collections" className="-mx-0 mb-2 flex gap-1.5 overflow-x-auto px-4 py-1 scrollbar-hide sm:px-0">
             {[{ id: null as string | null, name: "All saved" }, ...collections].map((c) => (
               <button
                 key={c.id ?? "all"}
                 type="button"
                 aria-pressed={openCollection === c.id}
                 onClick={() => setOpenCollection(c.id)}
                 className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold", openCollection === c.id ? "bg-foreground text-background" : "bg-secondary text-foreground")}
               >
                 {c.id && <Folder className="h-3.5 w-3.5" aria-hidden="true" />}
                 {c.name}
               </button>
             ))}
             <button type="button" onClick={() => setNaming({})} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-3 text-[13px] font-semibold">
               <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New collection
             </button>
           </div>
         )}

         <Dialog open={!!naming} onOpenChange={(o) => { if (!o) { setNaming(null); setNewName(""); } }}>
           <DialogContent className="sm:max-w-sm">
             <DialogHeader><DialogTitle>New collection</DialogTitle></DialogHeader>
             <form onSubmit={(e) => { e.preventDefault(); void createCollection(); }} className="space-y-3">
               <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} placeholder="Recipes, Ideas, Trips…" aria-label="Collection name" />
               <Button type="submit" className="w-full" disabled={!newName.trim()}>Create</Button>
             </form>
           </DialogContent>
         </Dialog>

         {openCollection && shownPosts.length === 0 && posts.length > 0 && (
           <EmptyState emoji="bookmark" title="Nothing here yet" text="Use “Add to collection” above a saved post to put it here." />
         )}

         {posts.length === 0 ? (
           <EmptyState
             emoji="bookmark"
             title="No saved posts yet"
             text="Tap ··· on any post and choose Save to keep it here."
             action={<Button onClick={() => navigate("/")} className="rounded-full px-5">Browse your feed</Button>}
           />
         ) : (
           <div className="space-y-2 sm:space-y-4 mt-2 sm:mt-0">
             {shownPosts.map((post) => (
               <div key={post.id}>
               {features.savedCollections && (
                 <div className="flex justify-end px-4 pb-1 sm:px-0">
                   <DropdownMenu>
                     <DropdownMenuTrigger asChild>
                       <button type="button" className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground">
                         <Folder className="h-3.5 w-3.5" aria-hidden="true" />
                         {collections.find((c) => c.id === placedIn[post.id])?.name ?? "Add to collection"}
                         <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                       </button>
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="end" className="w-52">
                       {collections.map((c) => (
                         <DropdownMenuItem key={c.id} onSelect={() => void moveTo(post.id, c.id)}>
                           <Folder className="mr-2 h-4 w-4" /> <span className="flex-1 truncate">{c.name}</span>
                           {placedIn[post.id] === c.id && <Check className="h-4 w-4" />}
                         </DropdownMenuItem>
                       ))}
                       {placedIn[post.id] && (
                         <DropdownMenuItem onSelect={() => void moveTo(post.id, null)}>Take out of collection</DropdownMenuItem>
                       )}
                       {collections.length > 0 && <DropdownMenuSeparator />}
                       <DropdownMenuItem onSelect={() => setNaming({ forPost: post.id })}>
                         <Plus className="mr-2 h-4 w-4" /> New collection
                       </DropdownMenuItem>
                     </DropdownMenuContent>
                   </DropdownMenu>
                 </div>
               )}
               <PostCard
                 key={post.id}
                 post={post}
                 currentUserId={currentUserId}
                 reactions={reactionsData[post.id]?.reactions || {}}
                 userReaction={reactionsData[post.id]?.userReaction || null}
                 firstReactorName={reactionsData[post.id]?.firstReactor}
                 comments={commentsData[post.id] || []}
                 onReactionToggle={(type) => toggleReaction(post.id, type)}
                 onCommentAdded={() => reloadComments(post.id)}
                 onDelete={() => loadSavedPosts(currentUserId)}
               />
               </div>
             ))}
           </div>
         )}
       </div>
     </div>
   );
 };
 
 export default SavedPosts;