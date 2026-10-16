 import { useState } from "react";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { X, Plus, BarChart3 } from "@/components/icons";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
 } from "@/components/ui/dialog";
 
 interface PollCreatorProps {
   onCreatePoll: (question: string, options: string[]) => void;
 }
 
 const PollCreator = ({ onCreatePoll }: PollCreatorProps) => {
   const [open, setOpen] = useState(false);
   const [question, setQuestion] = useState("");
   const [options, setOptions] = useState(["", ""]);
 
   const addOption = () => {
     if (options.length < 6) {
       setOptions([...options, ""]);
     }
   };
 
   const removeOption = (index: number) => {
     if (options.length > 2) {
       setOptions(options.filter((_, i) => i !== index));
     }
   };
 
   const updateOption = (index: number, value: string) => {
     const newOptions = [...options];
     newOptions[index] = value;
     setOptions(newOptions);
   };
 
   const handleCreate = () => {
     const validOptions = options.filter(o => o.trim());
     if (question.trim() && validOptions.length >= 2) {
       onCreatePoll(question.trim(), validOptions);
       setOpen(false);
       setQuestion("");
       setOptions(["", ""]);
     }
   };
 
   const isValid = question.trim() && options.filter(o => o.trim()).length >= 2;
 
   return (
     <Dialog open={open} onOpenChange={setOpen}>
       <DialogTrigger asChild>
         <Button variant="ghost" size="sm" className="text-muted-foreground gap-2">
           <BarChart3 className="h-5 w-5 text-orange-500" />
           <span className="hidden sm:inline">Poll</span>
         </Button>
       </DialogTrigger>
       <DialogContent className="sm:max-w-md">
         <DialogHeader>
           <DialogTitle>Create a Poll</DialogTitle>
         </DialogHeader>
         
         <div className="space-y-4">
           <div>
             <Input
               placeholder="Ask a question..."
               value={question}
               onChange={(e) => setQuestion(e.target.value)}
               className="text-lg"
             />
           </div>
 
           <div className="space-y-2">
             {options.map((option, index) => (
               <div key={index} className="flex gap-2">
                 <Input
                   placeholder={`Option ${index + 1}`}
                   value={option}
                   onChange={(e) => updateOption(index, e.target.value)}
                 />
                 {options.length > 2 && (
                   <Button
                     variant="ghost"
                     size="icon"
                     onClick={() => removeOption(index)}
                   >
                     <X className="h-4 w-4" />
                   </Button>
                 )}
               </div>
             ))}
           </div>
 
           {options.length < 6 && (
             <Button
               variant="outline"
               onClick={addOption}
               className="w-full gap-2"
             >
               <Plus className="h-4 w-4" />
               Add Option
             </Button>
           )}
 
           <Button
             onClick={handleCreate}
             disabled={!isValid}
             className="w-full"
           >
             Create Poll
           </Button>
         </div>
       </DialogContent>
     </Dialog>
   );
 };
 
 export default PollCreator;