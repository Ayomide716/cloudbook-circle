import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import type { PostComment } from "@/components/PostCard";
 import Navigation from "@/components/Navigation";
 import PostCard from "@/components/PostCard";
 import { Loader2, Bookmark } from "lucide-react";
 import FeedSkeleton from "@/components/skeletons/FeedSkeleton";
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
  useSEO({ title: "Saved Posts", description: "Your saved posts on CloudBook." });
   const [currentUserId, setCurrentUserId] = useState<string | null>(null);
   const [posts, setPosts] = useState<Post[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const [reactionsData, setReactionsData] = useState<Record<string, { reactions: Record<string, number>; userReaction: string | null }>>({});
   const [commentsData, setCommentsData] = useState<Record<string, PostComment[]>>({});
 
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
 
   if (isLoading || !currentUserId) {
     return (
       <div className="min-h-screen bg-background">
         <Navigation currentUserId={currentUserId || undefined} />
         <FeedSkeleton />
       </div>
     );
   }
 
   return (
     <div className="min-h-screen bg-background pb-safe">
       <Navigation currentUserId={currentUserId} />
 
       <div className="max-w-2xl mx-auto px-4 py-6">
         <div className="flex items-center gap-2 mb-6">
           <Bookmark className="h-6 w-6 text-primary" />
           <h1 className="text-2xl font-bold">Saved Posts</h1>
         </div>
 
         {posts.length === 0 ? (
           <div className="text-center py-12">
             <Bookmark className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
             <p className="text-muted-foreground">No saved posts yet</p>
             <p className="text-sm text-muted-foreground">Posts you save will appear here</p>
           </div>
         ) : (
           <div className="space-y-4">
             {posts.map((post) => (
               <PostCard
                 key={post.id}
                 post={post}
                 currentUserId={currentUserId}
                 reactions={reactionsData[post.id]?.reactions || {}}
                 userReaction={reactionsData[post.id]?.userReaction || null}
                 comments={commentsData[post.id] || []}
                 onReactionToggle={() => {}}
                 onCommentAdded={() => loadSavedPosts(currentUserId)}
                 onDelete={() => loadSavedPosts(currentUserId)}
               />
             ))}
           </div>
         )}
       </div>
     </div>
   );
 };
 
 export default SavedPosts;