 import { useState, useEffect } from "react";
 import { supabase } from "@/integrations/supabase/client";
 import { cn } from "@/lib/utils";
 import { useToast } from "@/hooks/use-toast";
 import { useEffectEvent } from "@/hooks/use-effect-event";
 
 interface PollDisplayProps {
   pollId: string;
   question: string;
   options: string[];
   currentUserId: string;
 }
 
 const PollDisplay = ({ pollId, question, options, currentUserId }: PollDisplayProps) => {
   const [votes, setVotes] = useState<Record<number, number>>({});
   const [userVote, setUserVote] = useState<number | null>(null);
   const [isLoading, setIsLoading] = useState(false);
   const { toast } = useToast();
 
   const loadVotes = useEffectEvent(async () => {
     const { data } = await supabase
       .from("poll_votes")
       .select("option_index, user_id")
       .eq("poll_id", pollId);
 
     if (data) {
       const voteCounts: Record<number, number> = {};
       data.forEach(vote => {
         voteCounts[vote.option_index] = (voteCounts[vote.option_index] || 0) + 1;
         if (vote.user_id === currentUserId) {
           setUserVote(vote.option_index);
         }
       });
       setVotes(voteCounts);
     }
   });

   useEffect(() => {
     loadVotes();
   }, [pollId, loadVotes]);
 
   const handleVote = async (optionIndex: number) => {
     if (isLoading) return;
     setIsLoading(true);
 
     if (userVote === optionIndex) {
       // Already voted for this option, do nothing
       setIsLoading(false);
       return;
     }
 
     if (userVote !== null) {
       // Update existing vote
       const { error } = await supabase
         .from("poll_votes")
         .update({ option_index: optionIndex })
         .eq("poll_id", pollId)
         .eq("user_id", currentUserId);
 
       if (error) {
         toast({ title: "Error updating vote", variant: "destructive" });
       } else {
         // Update local state
         setVotes(prev => ({
           ...prev,
           [userVote]: Math.max(0, (prev[userVote] || 1) - 1),
           [optionIndex]: (prev[optionIndex] || 0) + 1
         }));
         setUserVote(optionIndex);
       }
     } else {
       // New vote
       const { error } = await supabase
         .from("poll_votes")
         .insert({
           poll_id: pollId,
           user_id: currentUserId,
           option_index: optionIndex
         });
 
       if (error) {
         toast({ title: "Error voting", variant: "destructive" });
       } else {
         setVotes(prev => ({
           ...prev,
           [optionIndex]: (prev[optionIndex] || 0) + 1
         }));
         setUserVote(optionIndex);
       }
     }
 
     setIsLoading(false);
   };
 
   const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
 
   return (
     <div className="bg-secondary/50 rounded-xl p-4 mt-3">
       <p className="font-semibold mb-3">{question}</p>
       <div className="space-y-2">
         {options.map((option, index) => {
           const voteCount = votes[index] || 0;
           const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
           const isSelected = userVote === index;
 
           return (
             <button
               key={index}
               onClick={() => handleVote(index)}
               disabled={isLoading}
               className={cn(
                 "w-full relative overflow-hidden rounded-lg p-3 text-left transition-all",
                 isSelected
                   ? "ring-2 ring-primary bg-primary/10"
                   : "bg-secondary hover:bg-secondary/80"
               )}
             >
               <div
                 className="absolute inset-0 bg-primary/20 transition-all"
                 style={{ width: `${percentage}%` }}
               />
               <div className="relative flex justify-between items-center">
                 <span className={cn("font-medium", isSelected && "text-primary")}>
                   {option}
                 </span>
                 <span className="text-sm text-muted-foreground">
                   {voteCount} ({percentage.toFixed(0)}%)
                 </span>
               </div>
             </button>
           );
         })}
       </div>
       <p className="text-xs text-muted-foreground mt-2 text-center">
         {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
       </p>
     </div>
   );
 };
 
 export default PollDisplay;