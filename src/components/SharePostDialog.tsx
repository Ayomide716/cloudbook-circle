 import { useState, useEffect } from "react";
 import { Button } from "@/components/ui/button";
 import { Textarea } from "@/components/ui/textarea";
 import { Share2, Loader2 } from "lucide-react";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "@/components/ui/select";
 import { supabase } from "@/integrations/supabase/client";
 import { useToast } from "@/hooks/use-toast";
 import type { TablesInsert } from "@/integrations/supabase/types";
 import { useEffectEvent } from "@/hooks/use-effect-event";
 
 interface SharePostDialogProps {
   postId: string;
   open: boolean;
   onOpenChange: (open: boolean) => void;
   currentUserId: string;
 }
 
 interface Group {
   id: string;
   name: string;
 }
 
 const SharePostDialog = ({ postId, open, onOpenChange, currentUserId }: SharePostDialogProps) => {
   const [content, setContent] = useState("");
   const [shareTarget, setShareTarget] = useState("profile");
   const [groups, setGroups] = useState<Group[]>([]);
   const [isLoading, setIsLoading] = useState(false);
   const { toast } = useToast();
 
   const loadUserGroups = useEffectEvent(async () => {
     const { data } = await supabase
       .from("group_members")
       .select("group_id, groups(id, name)")
       .eq("user_id", currentUserId);
 
     if (data) {
       const userGroups = data
         .filter(m => m.groups)
         .map(m => m.groups as Group);
       setGroups(userGroups);
     }
   });

   useEffect(() => {
     if (open) {
       loadUserGroups();
     }
   }, [open, loadUserGroups]);
 
   const handleShare = async () => {
     setIsLoading(true);
 
     const shareData: TablesInsert<"shared_posts"> = {
       original_post_id: postId,
       user_id: currentUserId,
       content: content.trim() || null,
     };
 
     if (shareTarget !== "profile") {
       shareData.group_id = shareTarget;
     }
 
     const { error } = await supabase
       .from("shared_posts")
       .insert(shareData);
 
     setIsLoading(false);
 
     if (error) {
       toast({ title: "Error sharing post", variant: "destructive" });
     } else {
       toast({ title: "Post shared!" });
       onOpenChange(false);
       setContent("");
       setShareTarget("profile");
     }
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="sm:max-w-md">
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
             <Share2 className="h-5 w-5" />
             Share Post
           </DialogTitle>
         </DialogHeader>
 
         <div className="space-y-4">
           <div>
             <label className="text-sm font-medium mb-2 block">Share to</label>
             <Select value={shareTarget} onValueChange={setShareTarget}>
               <SelectTrigger>
                 <SelectValue />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="profile">Your Profile</SelectItem>
                 {groups.map(group => (
                   <SelectItem key={group.id} value={group.id}>
                     {group.name}
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </div>
 
           <div>
             <label className="text-sm font-medium mb-2 block">Add a comment (optional)</label>
             <Textarea
               placeholder="Say something about this..."
               value={content}
               onChange={(e) => setContent(e.target.value)}
               className="resize-none"
               rows={3}
             />
           </div>
 
           <Button onClick={handleShare} disabled={isLoading} className="w-full">
             {isLoading ? (
               <Loader2 className="h-4 w-4 animate-spin mr-2" />
             ) : (
               <Share2 className="h-4 w-4 mr-2" />
             )}
             Share Now
           </Button>
         </div>
       </DialogContent>
     </Dialog>
   );
 };
 
 export default SharePostDialog;