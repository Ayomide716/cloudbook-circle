import { useQueryClient } from "@tanstack/react-query";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { blockUser } from "@/lib/blocking";
import { getErrorMessage } from "@/lib/utils";

interface BlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  name: string | null;
  onBlocked?: () => void;
}

/** "Block Bob?" with what it means, as on Facebook. */
const BlockDialog = ({ open, onOpenChange, userId, name, onBlocked }: BlockDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const who = name || "this person";
  const first = name?.split(" ")[0] || "They";

  const confirm = async () => {
    try {
      await blockUser(userId);
      toast({ title: `You blocked ${who}`, description: "You can unblock them any time in Settings." });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      onBlocked?.();
    } catch (error) {
      toast({ title: "Couldn't block", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Block ${who}?`}
      description={`${first} won't be able to see your posts, comment on them, message you or add you as a friend, and you won't see theirs. If you're friends, this will unfriend them. We won't tell them you blocked them.`}
      confirmLabel="Block"
      onConfirm={confirm}
    />
  );
};

export default BlockDialog;
