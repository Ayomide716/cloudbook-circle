import { Phone, Video, X } from "@/components/icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface GroupCallInviteProps {
  groupName: string;
  fromName: string;
  fromAvatar?: string | null;
  isVoiceOnly: boolean;
  onJoin: () => void;
  onDismiss: () => void;
}

/** "Ada started a video call in Hikers" banner, shown on whatever page you're on. */
const GroupCallInvite = ({ groupName, fromName, fromAvatar, isVoiceOnly, onJoin, onDismiss }: GroupCallInviteProps) => (
  <div
    role="alert"
    className="fixed z-[60] top-[calc(env(safe-area-inset-top)+0.75rem)] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md animate-in fade-in-0 slide-in-from-top-4 duration-300"
  >
    <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-xl p-3 shadow-2xl">
      <div className="relative shrink-0">
        <Avatar className="h-11 w-11">
          <AvatarImage src={fromAvatar || undefined} alt="" />
          <AvatarFallback>{fromName[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full gradient-brand flex items-center justify-center ring-2 ring-card">
          {isVoiceOnly ? <Phone className="h-3 w-3 text-primary-foreground" /> : <Video className="h-3 w-3 text-primary-foreground" />}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{fromName} started a {isVoiceOnly ? "voice" : "video"} call</p>
        <p className="text-xs text-muted-foreground truncate">in {groupName}</p>
      </div>
      <Button size="sm" onClick={onJoin} className="gradient-brand text-primary-foreground rounded-full px-4 shrink-0">
        Join
      </Button>
      <Button size="icon" variant="ghost" onClick={onDismiss} className="h-8 w-8 rounded-full shrink-0" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

export default GroupCallInvite;
