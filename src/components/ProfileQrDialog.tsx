import { QRCodeSVG } from "qrcode.react";
import { Share2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ProfileQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  name: string;
  avatarUrl?: string | null;
  onShare: () => void;
}

/**
 * A profile's QR code, as on Facebook and Instagram: a friend points their phone's camera at it
 * and lands on the profile. Black on white so every scanner reads it, also in dark mode.
 */
const ProfileQrDialog = ({ open, onOpenChange, url, name, avatarUrl, onShare }: ProfileQrDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-sm rounded-3xl">
      <DialogHeader>
        <DialogTitle className="text-center">QR code</DialogTitle>
        <DialogDescription className="text-center">Friends can scan this with their phone's camera to see your profile.</DialogDescription>
      </DialogHeader>
      <div className="mx-auto flex flex-col items-center gap-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <Avatar className="h-14 w-14 ring-4 ring-white">
          <AvatarImage src={avatarUrl || undefined} alt="" />
          <AvatarFallback>{name[0]?.toUpperCase() || "U"}</AvatarFallback>
        </Avatar>
        <p className="max-w-[220px] truncate text-base font-bold text-black">{name}</p>
        <QRCodeSVG value={url} size={208} level="M" fgColor="#111111" bgColor="#ffffff" marginSize={1} title={`QR code for ${name}'s Ember profile`} />
        <p className="text-xs font-semibold tracking-wide text-[#e8552b]">EMBER</p>
      </div>
      <Button variant="secondary" className="w-full rounded-full" onClick={onShare}>
        <Share2 className="mr-2 h-4 w-4" /> Share profile link
      </Button>
    </DialogContent>
  </Dialog>
);

export default ProfileQrDialog;
