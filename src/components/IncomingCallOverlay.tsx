import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, PhoneOff, Video } from "lucide-react";
import { cn } from "@/lib/utils";

interface IncomingCallOverlayProps {
  callerName: string;
  callerAvatar?: string | null;
  isVoiceOnly?: boolean;
  onAccept: () => void;
  onReject: () => void;
}

const IncomingCallOverlay = ({
  callerName,
  callerAvatar,
  isVoiceOnly = false,
  onAccept,
  onReject,
}: IncomingCallOverlayProps) => {
  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center">
      <div className="text-center space-y-8 animate-fade-in">
        {/* Pulsing rings */}
        <div className="relative mx-auto w-36 h-36">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute inset-0 rounded-full border-2 border-green-400/30 animate-ping"
              style={{ animationDelay: `${i * 500}ms`, animationDuration: "2s" }}
            />
          ))}
          <Avatar className="h-36 w-36 mx-auto ring-4 ring-green-400/40">
            <AvatarImage src={callerAvatar || undefined} />
            <AvatarFallback className="text-4xl bg-primary/20 text-white">
              {callerName?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
        </div>

        <div>
          <p className="text-white text-2xl font-bold">{callerName}</p>
          <p className="text-white/60 text-sm mt-1 flex items-center justify-center gap-2">
            {isVoiceOnly ? (
              <>
                <Phone className="h-4 w-4" />
                Incoming voice call...
              </>
            ) : (
              <>
                <Video className="h-4 w-4" />
                Incoming video call...
              </>
            )}
          </p>
        </div>

        {/* Accept / Reject buttons */}
        <div className="flex items-center justify-center gap-12">
          <div className="text-center space-y-2">
            <Button
              variant="destructive"
              size="icon"
              className="h-16 w-16 rounded-full shadow-lg shadow-red-500/30"
              onClick={onReject}
            >
              <PhoneOff className="h-7 w-7" />
            </Button>
            <p className="text-white/70 text-xs">Decline</p>
          </div>
          <div className="text-center space-y-2">
            <Button
              size="icon"
              className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/30 animate-pulse"
              onClick={onAccept}
            >
              <Phone className="h-7 w-7 text-white" />
            </Button>
            <p className="text-white/70 text-xs">Accept</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallOverlay;
