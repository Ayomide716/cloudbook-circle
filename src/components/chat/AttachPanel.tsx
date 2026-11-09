import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Images, Loader2, MapPin, UserRound, Video, ChevronLeft, FileText, BarChart3, CalendarDays } from "@/components/icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { DOCUMENT_ACCEPT } from "@/lib/chat-extras";

interface AttachPanelProps {
  currentUserId: string;
  /** Photos picked from the gallery or taken with the camera (shown before sending). */
  onPhotos: (files: File[]) => void;
  onVideo: (file: File) => void;
  onLocation: () => void;
  onContact: (person: { id: string; full_name: string | null }) => void;
  locating?: boolean;
  /** Document, Poll and Event (after the database update; lib/features messaging2). */
  onDocument?: (file: File) => void;
  onPoll?: () => void;
  onEvent?: () => void;
}

const OPTIONS = [
  { key: "gallery", label: "Gallery", icon: Images, color: "text-blue-500" },
  { key: "camera", label: "Camera", icon: Camera, color: "text-rose-500" },
  { key: "video", label: "Video", icon: Video, color: "text-violet-500" },
  { key: "location", label: "Location", icon: MapPin, color: "text-emerald-500" },
  { key: "contact", label: "Contact", icon: UserRound, color: "text-sky-500" },
  { key: "document", label: "Document", icon: FileText, color: "text-indigo-500" },
  { key: "poll", label: "Poll", icon: BarChart3, color: "text-amber-500" },
  { key: "event", label: "Event", icon: CalendarDays, color: "text-pink-500" },
] as const;

/**
 * What the 📎 button opens, in the keyboard's place (as in WhatsApp): Gallery (several photos),
 * Camera, Video, your Location, or a friend's profile as a Contact card.
 */
const AttachPanel = ({ currentUserId, onPhotos, onVideo, onLocation, onContact, locating, onDocument, onPoll, onEvent }: AttachPanelProps) => {
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLInputElement>(null);
  const doc = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"menu" | "contact">("menu");
  const [friends, setFriends] = useState<{ id: string; full_name: string | null; avatar_url: string | null }[] | null>(null);
  const [search, setSearch] = useState("");

  const openContacts = async () => {
    setView("contact");
    if (friends) return;
    const { data: links } = await supabase.from("friendships").select("user_id, friend_id").or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`).eq("status", "accepted");
    const ids = (links ?? []).map((f) => (f.user_id === currentUserId ? f.friend_id : f.user_id));
    const { data } = ids.length ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids).order("full_name") : { data: [] };
    setFriends(data ?? []);
  };

  const pick = (key: (typeof OPTIONS)[number]["key"]) => {
    if (key === "gallery") gallery.current?.click();
    else if (key === "camera") camera.current?.click();
    else if (key === "video") video.current?.click();
    else if (key === "location") onLocation();
    else if (key === "document") doc.current?.click();
    else if (key === "poll") onPoll?.();
    else if (key === "event") onEvent?.();
    else void openContacts();
  };

  const files = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    return list;
  };

  if (view === "contact") {
    const shown = (friends ?? []).filter((f) => (f.full_name ?? "").toLowerCase().includes(search.trim().toLowerCase()));
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-2 pb-2 pt-1">
          <button type="button" onClick={() => setView("menu")} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent" aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Share a friend's profile" aria-label="Search friends"
            className="h-10 flex-1 rounded-full bg-secondary px-4 text-[15px] outline-none placeholder:text-muted-foreground" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
          {friends === null ? <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-muted-foreground" />
            : shown.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No friends found</p>
            : shown.map((f) => (
              <button key={f.id} type="button" onClick={() => onContact(f)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-accent">
                <Avatar className="h-10 w-10"><AvatarImage src={f.avatar_url || undefined} className="object-cover" /><AvatarFallback className="bg-secondary">{f.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback></Avatar>
                <span className="truncate text-[15px] font-semibold">{f.full_name || "Friend"}</span>
              </button>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 content-start gap-x-2 gap-y-5 px-4 pt-5">
      <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => { const f = files(e); if (f.length) onPhotos(f.slice(0, 10)); }} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = files(e); if (f.length) onPhotos(f); }} />
      <input ref={video} type="file" accept="video/*" hidden onChange={(e) => { const f = files(e); if (f[0]) onVideo(f[0]); }} />
      <input ref={doc} type="file" accept={DOCUMENT_ACCEPT} hidden onChange={(e) => { const f = files(e); if (f[0]) onDocument?.(f[0]); }} />
      {OPTIONS.filter(({ key }) => (key === "document" ? !!onDocument : key === "poll" ? !!onPoll : key === "event" ? !!onEvent : true)).map(({ key, label, icon: Icon, color }) => (
        <button key={key} type="button" onClick={() => pick(key)} className="flex flex-col items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
          <span className="flex h-14 w-16 items-center justify-center rounded-[22px] border border-border bg-card">
            {key === "location" && locating ? <Loader2 className="h-6 w-6 animate-spin" /> : <Icon className={cn("h-7 w-7", color)} />}
          </span>
          {label}
        </button>
      ))}
    </div>
  );
};

export default AttachPanel;
