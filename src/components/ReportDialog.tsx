import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Flag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

interface ReportDialogProps {
  reportedType: "post" | "reel" | "comment" | "profile";
  reportedId: string;
  currentUserId: string;
  /** Open it from elsewhere (e.g. the hidden-post panel) instead of its own menu item. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const REASONS = [
  "Spam or misleading",
  "Harassment or bullying",
  "Hate speech",
  "Violence or dangerous content",
  "Nudity or sexual content",
  "False information",
  "Other",
];

const ReportDialog = ({ reportedType, reportedId, currentUserId, open: openProp, onOpenChange }: ReportDialogProps) => {
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const setOpen = (next: boolean) => (controlled ? onOpenChange?.(next) : setOpenState(next));
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!reason) return;
    setIsSubmitting(true);
    const { error } = await supabase.from("reports").insert({
      reporter_id: currentUserId,
      reported_type: reportedType,
      reported_id: reportedId,
      reason,
      description: description || null,
    });
    setIsSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Report submitted", description: "We'll review this content shortly." });
      setOpen(false);
      setReason("");
      setDescription("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger asChild>
          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
            <Flag className="h-4 w-4 mr-2" />
            Report
          </DropdownMenuItem>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report this {reportedType}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <div className="grid grid-cols-1 gap-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={reason === r}
                  onClick={() => setReason(r)}
                  className={`text-left px-3 py-2 rounded-xl text-sm border transition-colors ${
                    reason === r
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border hover:bg-secondary/50 text-muted-foreground"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Additional details (optional)</Label>
            <Textarea
              placeholder="Tell us more..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-xl"
              rows={3}
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!reason || isSubmitting}
            className="w-full rounded-xl"
          >
            Submit Report
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReportDialog;
