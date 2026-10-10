import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { ArrowLeft, Loader2, MoreVertical, Phone, Send, Users, Video, X } from "lucide-react";
import { format, isThisWeek, isToday, isYesterday } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCalls } from "@/hooks/use-calls";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import VirtualizedChatList from "@/components/VirtualizedChatList";
import VoiceMessageRecorder from "@/components/VoiceMessageRecorder";
import VoiceMessagePlayer from "@/components/VoiceMessagePlayer";
import ChatImageUpload from "@/components/ChatImageUpload";
import GifPicker from "@/components/GifPicker";
import PhotoViewer from "@/components/PhotoViewer";
import GroupInfoPanel, { type GroupMember } from "./GroupInfoPanel";
import { enterMakesNewLine, sendOnEnter, useAutoGrow } from "@/lib/enter-key";
import { nameColour, type GroupInfo } from "@/lib/group-chats";
import { playSound } from "@/lib/sounds";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

interface GroupMessage {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
}

interface GroupConversationProps {
  group: GroupInfo;
  currentUserId: string;
  onBack: () => void;
  /** Called while the chat is open, so its unread count stays at zero. */
  onSeen: () => void;
  /** You left the group (or were removed): close the chat. */
  onLeft: () => void;
}

const PAGE = 50;

// Text saved with media that has no caption (it's what the chat list shows).
const PLACEHOLDERS = ["📷 Photo", "🎥 Video", "GIF"];
const isVoiceNote = (m: { content: string; image_url: string | null }) => !!m.image_url && m.content.startsWith("🎤");
const mediaKind = (url: string) =>
  /giphy\.com|tenor\.com/.test(url) ? "gif" : /\.(mp4|mov|webm)(\?|$)/i.test(url) ? "video" : "image";
const voiceSeconds = (content: string) => {
  const m = content.match(/\((\d+):(\d{2})\)\s*$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};

const dayLabel = (d: Date) => {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d)) return format(d, "EEEE");
  return format(d, "d MMMM yyyy");
};

/**
 * A group chat in Messages, as on WhatsApp: the group's picture and name with who's in it
 * at the top (tap for the group's info), names in colour above other people's messages, and
 * the same message box as one-to-one chats.
 */
const GroupConversation = ({ group, currentUserId, onBack, onSeen, onLeft }: GroupConversationProps) => {
  const { toast } = useToast();
  const { startGroupCall } = useCalls();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  // A photo, video or GIF waiting to be sent, and the voice recorder taking over the bar.
  const [media, setMedia] = useState<{ url: string; type: "image" | "video" } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [viewer, setViewer] = useState<{ url: string } | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(boxRef, text, 150);
  const onSeenRef = useRef(onSeen);
  onSeenRef.current = onSeen;
  const onLeftRef = useRef(onLeft);
  onLeftRef.current = onLeft;

  const memberById = new Map(members.map((m) => [m.id, m]));

  const loadMembers = useCallback(async () => {
    const { data } = await supabase.from("group_members").select("user_id, role").eq("group_id", group.id);
    const ids = (data ?? []).map((m) => m.user_id);
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids)
      : { data: [] };
    const list = (data ?? []).map((m) => {
      const p = (profiles ?? []).find((x) => x.id === m.user_id);
      return { id: m.user_id, role: m.role, full_name: p?.full_name ?? null, avatar_url: p?.avatar_url ?? null };
    });
    // You first, then admins, then everyone else by name.
    list.sort((a, b) =>
      Number(b.id === currentUserId) - Number(a.id === currentUserId) ||
      Number(b.role === "admin") - Number(a.role === "admin") ||
      (a.full_name ?? "").localeCompare(b.full_name ?? "")
    );
    setMembers(list);
    if (!ids.includes(currentUserId)) onLeftRef.current();
  }, [group.id, currentUserId]);

  const loadMessages = useCallback(async (before?: string) => {
    let q = supabase.from("group_messages").select("*").eq("group_id", group.id).order("created_at", { ascending: false }).limit(PAGE);
    if (before) q = q.lt("created_at", before);
    const { data } = await q;
    const page = (data ?? []).reverse();
    setMessages((prev) => (before ? [...page, ...prev] : page));
    setHasMore((data ?? []).length >= PAGE);
    setLoading(false);
  }, [group.id]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    void loadMessages();
    void loadMembers();
    onSeenRef.current();
    const channel = supabase
      .channel(`group-conversation-${group.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${group.id}` }, (payload) => {
        const m = payload.new as GroupMessage;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev.filter((x) => !(x.id.startsWith("temp-") && x.content === m.content && x.user_id === m.user_id)), m]));
        if (m.user_id !== currentUserId) playSound("message");
        onSeenRef.current();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${group.id}` }, () => void loadMembers())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [group.id, currentUserId, loadMessages, loadMembers]);

  /** Sends a message (text, a photo / video / GIF with an optional caption, or a voice note). */
  const post = async (content: string, imageUrl: string | null, restore?: () => void) => {
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, group_id: group.id, user_id: currentUserId, content, image_url: imageUrl, created_at: new Date().toISOString() }]);
    setSending(true);
    playSound("send");
    haptic();
    const { data, error } = await supabase.from("group_messages").insert({ group_id: group.id, user_id: currentUserId, content, image_url: imageUrl }).select().single();
    setSending(false);
    if (error || !data) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      restore?.();
      toast({ title: "Couldn't send message", description: error?.message, variant: "destructive" });
      return;
    }
    setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev.filter((m) => m.id !== tempId) : prev.map((m) => (m.id === tempId ? data : m))));
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const caption = text.trim();
    if ((!caption && !media) || sending || uploading) return;
    const attached = media;
    const content = caption || (attached ? (mediaKind(attached.url) === "gif" ? "GIF" : attached.type === "video" ? "🎥 Video" : "📷 Photo") : "");
    setText("");
    setMedia(null);
    await post(content, attached?.url ?? null, () => { setText(caption); setMedia(attached); });
  };

  const sendVoiceNote = (url: string, seconds: number) =>
    post(`🎤 Voice message (${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")})`, url);

  const renderMessage = useCallback((index: number): ReactElement | null => {
    const m = messages[index];
    if (!m) return null;
    const prev = messages[index - 1];
    const mine = m.user_id === currentUserId;
    const day = new Date(m.created_at);
    const newDay = !prev || new Date(prev.created_at).toDateString() !== day.toDateString();
    const firstInRun = newDay || !prev || prev.user_id !== m.user_id;
    const sender = memberById.get(m.user_id);
    const name = sender?.full_name || "Former member";
    const voice = isVoiceNote(m);
    const kind = m.image_url && !voice ? mediaKind(m.image_url) : null;
    const showText = !voice && !(m.image_url && PLACEHOLDERS.includes(m.content));
    return (
      <>
        {newDay && (
          <div className="flex justify-center pb-1 pt-3">
            <span className="rounded-lg bg-card/90 px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground shadow-sm dark:bg-[#1c2530]/90">{dayLabel(day)}</span>
          </div>
        )}
        <div className={cn("flex items-end gap-1.5", mine ? "justify-end" : "justify-start", firstInRun ? "pt-2" : "pt-0.5")}>
          {!mine && (
            <div className="w-8 flex-shrink-0">
              {firstInRun && (
                <Avatar className="h-8 w-8">
                  <AvatarImage src={sender?.avatar_url || undefined} />
                  <AvatarFallback className="text-[11px]">{name[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
              )}
            </div>
          )}
          <div
            className={cn(
              "max-w-[78%] rounded-lg px-2.5 pb-1.5 pt-1 shadow-sm",
              (voice || m.image_url) && "w-[78%] max-w-[300px]",
              mine ? "bg-primary text-primary-foreground dark:bg-[#0b5d53] dark:text-white" : "bg-card text-foreground dark:bg-[#22262d]",
              firstInRun && (mine ? "rounded-tr-none" : "rounded-tl-none"),
              m.id.startsWith("temp-") && "opacity-70"
            )}
          >
            {!mine && firstInRun && <p className={cn("text-[13px] font-semibold", nameColour(m.user_id))}>{name}</p>}
            {voice ? (
              <VoiceMessagePlayer audioUrl={m.image_url!} duration={voiceSeconds(m.content)} isOwnMessage={mine} />
            ) : m.image_url && kind === "video" ? (
              <video src={m.image_url} controls playsInline preload="metadata" className="mt-1 max-h-72 w-full rounded-md bg-black" />
            ) : m.image_url ? (
              <button type="button" className="mt-1 block overflow-hidden rounded-md" onClick={() => setViewer({ url: m.image_url! })} aria-label={kind === "gif" ? "GIF" : "Open photo"}>
                <img src={m.image_url} alt="" loading="lazy" className="max-h-80 w-full object-cover" />
              </button>
            ) : null}
            {showText && (
              <p className={cn("whitespace-pre-wrap break-words text-[15px] leading-snug", m.image_url && "mt-1")}>
                {m.content}
                {/* Room for the time, which sits in the bottom corner. */}
                <span className="ml-2 inline-block w-9" aria-hidden="true" />
              </p>
            )}
            <p className={cn("text-right text-[10.5px] leading-none", showText ? "-mt-3.5" : "mt-1", mine ? "text-white/70" : "text-muted-foreground")}>{format(day, "HH:mm")}</p>
          </div>
        </div>
      </>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- memberById is rebuilt from members
  }, [messages, currentUserId, members]);

  const others = members.filter((m) => m.id !== currentUserId);
  const subtitle = others.length
    ? others.slice(0, 6).map((m) => m.full_name?.split(" ")[0] || "Someone").join(", ") + (others.length > 6 ? ", …" : "")
    : "Only you";

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Header: back, picture, name and who's in it (tap for the group's info), calls */}
      <div className="flex flex-shrink-0 items-center gap-1 border-b bg-card px-1.5 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] sm:px-3">
        <Button variant="ghost" size="icon" className="h-10 w-10 md:hidden [&_svg]:size-6" aria-label="Back to chats" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-0.5 text-left" onClick={() => setShowInfo(true)} aria-label={`${group.name}, group info`}>
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={group.image_url || undefined} />
            <AvatarFallback className="bg-secondary"><Users className="h-5 w-5" /></AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate font-semibold">{group.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
          </span>
        </button>
        <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-[22px]" aria-label="Group video call" onClick={() => startGroupCall({ id: group.id, name: group.name }, false, members.map((m) => m.id))}>
          <Video />
        </Button>
        <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-[21px]" aria-label="Group voice call" onClick={() => startGroupCall({ id: group.id, name: group.name }, true, members.map((m) => m.id))}>
          <Phone />
        </Button>
        <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-[22px]" aria-label="Group info" onClick={() => setShowInfo(true)}>
          <MoreVertical />
        </Button>
      </div>

      {loading ? (
        <div className="chat-wallpaper flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : messages.length === 0 ? (
        <div className="chat-wallpaper flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center text-sm text-muted-foreground">
          <Users className="h-8 w-8 opacity-60" />
          No messages yet. Say hello to the group!
        </div>
      ) : (
        <VirtualizedChatList
          itemCount={messages.length}
          scrollToBottomKey={messages.length}
          firstItemKey={messages[0]?.id}
          lastIsMine={messages[messages.length - 1]?.user_id === currentUserId}
          estimatedItemSize={64}
          className="chat-wallpaper flex-1 overflow-hidden"
          renderItem={renderMessage}
          onLoadMore={async () => {
            if (loadingMore || !hasMore || !messages[0]) return;
            setLoadingMore(true);
            await loadMessages(messages[0].created_at);
            setLoadingMore(false);
          }}
          isLoadingMore={loadingMore}
          hasMore={hasMore}
        />
      )}

      <form onSubmit={send} className="chat-wallpaper flex-shrink-0 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
        {media && (
          <div className="relative mb-2 ml-2 inline-block">
            {media.type === "video" ? <video src={media.url} className="h-20 rounded-lg" /> : <img src={media.url} alt="To send" className="h-20 rounded-lg" />}
            <button type="button" onClick={() => setMedia(null)} aria-label="Remove attachment" className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-1.5">
          {!recording && (
            <div className="flex min-h-12 min-w-0 flex-1 items-end gap-0.5 rounded-3xl bg-card px-1 py-1 shadow-sm dark:bg-[#22262d] [&_button]:h-10 [&_button]:w-10 [&_button]:shrink-0 [&_button]:rounded-full [&_button_svg]:!h-[22px] [&_button_svg]:!w-[22px] [&_button_svg]:text-muted-foreground">
              <GifPicker
                onSelect={(picked) => {
                  if (picked.startsWith("http")) setMedia({ url: picked, type: "image" });
                  else setText((t) => t + picked);
                }}
              />
              <textarea
                ref={boxRef}
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={sendOnEnter}
                enterKeyHint={enterMakesNewLine() ? "enter" : "send"}
                placeholder={media ? "Add a caption" : "Message"}
                aria-label="Message"
                className="min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[16px] leading-6 outline-none placeholder:text-muted-foreground"
              />
              <ChatImageUpload
                onMediaUploaded={(url, type) => setMedia({ url, type })}
                onMediaCleared={() => setMedia(null)}
                previewUrl={null}
                mediaType={null}
                isUploading={uploading}
                setIsUploading={setUploading}
              />
            </div>
          )}
          {text.trim() || media ? (
            <Button type="submit" size="icon" disabled={sending || uploading} aria-label="Send" className="h-12 w-12 shrink-0 rounded-full [&_svg]:size-5">
              {uploading ? <Loader2 className="animate-spin" /> : <Send className="translate-x-px" />}
            </Button>
          ) : (
            <VoiceMessageRecorder
              onVoiceMessageSent={sendVoiceNote}
              disabled={sending}
              onActiveChange={setRecording}
              buttonClassName="h-12 w-12 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground [&_svg]:size-6"
            />
          )}
        </div>
      </form>

      <PhotoViewer images={viewer ? [viewer.url] : []} index={viewer ? 0 : null} onIndexChange={(i) => { if (i === null) setViewer(null); }} />

      {showInfo && (
        <GroupInfoPanel
          group={group}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setShowInfo(false)}
          onChanged={() => void loadMembers()}
          onCall={(voice) => startGroupCall({ id: group.id, name: group.name }, voice, members.map((m) => m.id))}
          onLeft={onLeft}
        />
      )}
    </div>
  );
};

export default GroupConversation;
