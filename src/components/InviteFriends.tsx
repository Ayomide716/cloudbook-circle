import { Share2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { inviteMessage, inviteUrl } from "@/lib/referral";
import { cn } from "@/lib/utils";

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.5-.3Z" />
  </svg>
);

/** "Invite friends": straight to WhatsApp (where most invites happen), or any other app. */
const InviteFriends = ({ userId, className, compact = false }: { userId: string; className?: string; compact?: boolean }) => {
  const { toast } = useToast();
  const text = inviteMessage(userId);

  const shareElsewhere = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join me on Ember", text, url: inviteUrl(userId) });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(inviteUrl(userId));
      toast({ title: "Invite link copied" });
    } catch {
      toast({ title: "Your invite link", description: inviteUrl(userId) });
    }
  };

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4", className)} aria-label="Invite friends">
      {!compact && (
        <>
          <h2 className="text-[15px] font-semibold">Ember is better with your friends</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Send them your link. When they join, you'll be friends straight away.</p>
        </>
      )}
      <div className={cn("flex gap-2", !compact && "mt-3")}>
        <Button asChild className="flex-1 rounded-full bg-[#25D366] text-white hover:bg-[#1ebe5a]">
          <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon className="mr-1.5 h-4 w-4" /> WhatsApp
          </a>
        </Button>
        <Button variant="secondary" className="flex-1 rounded-full" onClick={shareElsewhere}>
          <Share2 className="mr-1.5 h-4 w-4" /> More
        </Button>
      </div>
    </section>
  );
};

export default InviteFriends;
