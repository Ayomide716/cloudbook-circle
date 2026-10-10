import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { ArrowLeft, BellOff, Loader2, MoreVertical, Phone, Send, Users, Video, X } from "lucide-react";
import { format, isThisWeek, isToday, isYesterday } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCalls } from "@/hooks/use-calls";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import VirtualizedChatList from "@/components/VirtualizedChatList";
import VoiceMessageRecorder from "@/components/VoiceMessageRecorder";
import ChatImageUpload from "@/components/ChatImageUpload";
import GifPicker from "@/components/GifPicker";
import PhotoViewer from "@/components/PhotoViewer";
import GroupInfoPanel, { type GroupMember } from "./GroupInfoPanel";
import GroupMessageBubble from "./GroupMessageBubble";
import { mediaKind, quoteText, type GroupMessage } from "@/lib/group-messages";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { ChatReaction } from "@/lib/chat-reactions";
import { useDraft } from "@/lib/chat-drafts";
import { useStarred } from "@/lib/starred";
import ForwardDialog from "@/components/chat/ForwardDialog";
import ChatMediaPanel, { type GalleryTab } from "@/components/chat/ChatMediaPanel";
import { enterMakesNewLine, sendOnEnter, useAutoGrow } from "@/lib/enter-key";
import type { GroupInfo } from "@/lib/group-chats";
import { playSound } from "@/lib/sounds";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { dbChannel } from "@/lib/realtime";
import { useResync } from "@/hooks/use-resync";

interface GroupConversationProps {
  group: GroupInfo;
  currentUserId: string;
  onBack: () => void;
  /** Called while the chat is open, so its unread count stays at zero. */
  onSeen: () => void;
  /** You left the group (or were removed): close the chat. */
  onLeft: () => void;
  /** Inside a community group's page, which has its own header: just the messages and the bar. */
  embedded?: boolean;
  /** Muted chats don't make a sound when a message comes in. */
  muted?: boolean;
  onToggleMute?: () => void;
  /** The group's name, description or picture changed. */
  onGroupUpdated?: () => void;
  /** Open at this message (from Starred messages). */
  focusMessageId?: string | null;
}

const PAGE = 50;

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
const GroupConversation = ({ group, currentUserId, onBack, onSeen, onLeft, embedded = false, muted = false, onToggleMute, onGroupUpdated, focusMessageId }: GroupConversationProps) => {
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
  // Replying to or editing a message, reactions on the loaded messages, and who's typing.
  const [replyingTo, setReplyingTo] = useState<GroupMessage | null>(null);
  const [editing, setEditing] = useState<GroupMessage | null>(null);
  const [deleting, setDeleting] = useState<GroupMessage | null>(null);
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  // Forwarding, starring, the media gallery, and a message being jumped to.
  const { isStarred, toggle: toggleStar, version: starVersion } = useStarred(currentUserId);
  const [forwarding, setForwarding] = useState<GroupMessage | null>(null);
  const [gallery, setGallery] = useState<GalleryTab | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [typing, setTyping] = useState<{ id: string; name: string }[]>([]);
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimer = useRef<number>();
  const amTyping = useRef(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(boxRef, text, 150);
  useDraft(currentUserId, `g:${group.id}`, text, setText, !!editing);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const onSeenRef = useRef(onSeen);
  onSeenRef.current = onSeen;
  const onLeftRef = useRef(onLeft);
  onLeftRef.current = onLeft;

  const memberById = new Map(members.map((m) => [m.id, m]));
  const nameOf = useCallback((id: string) => members.find((m) => m.id === id)?.full_name || "Former member", [members]);
  const myName = members.find((m) => m.id === currentUserId)?.full_name?.split(" ")[0] || "Someone";
  const messageIds = useRef<Set<string>>(new Set());
  messageIds.current = new Set(messages.map((m) => m.id));

  /** Reactions for these messages (all loaded ones when none are given). */
  const loadReactions = useCallback(async (ids?: string[]) => {
    const wanted = (ids ?? [...messageIds.current]).filter((id) => !id.startsWith("temp-"));
    if (!wanted.length) return;
    const found: ChatReaction[] = [];
    // A few at a time, to keep each request's address short.
    for (let i = 0; i < wanted.length; i += 100) {
      const { data, error } = await supabase.from("group_message_reactions").select("message_id, user_id, reaction_type").in("message_id", wanted.slice(i, i + 100));
      if (error) return; // the database update isn't there yet: no reactions
      found.push(...(data ?? []));
    }
    const set = new Set(wanted);
    setReactions((prev) => [...prev.filter((r) => !set.has(r.message_id)), ...found]);
  }, []);

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
    const page = (data ?? []).reverse() as GroupMessage[];
    setMessages((prev) => (before ? [...page, ...prev] : page));
    setHasMore((data ?? []).length >= PAGE);
    setLoading(false);
    void loadReactions(page.map((m) => m.id));
  }, [group.id, loadReactions]);

  // Catch up after being away, and every little while in case the live connection stopped:
  // messages that arrived meanwhile, plus edits and reactions on the latest ones.
  const messagesRef = useRef<GroupMessage[]>([]);
  messagesRef.current = messages;
  useResync(() => {
    void (async () => {
      const saved = messagesRef.current.filter((m) => !m.id.startsWith("temp-"));
      const last = saved[saved.length - 1];
      let q = supabase.from("group_messages").select("*").eq("group_id", group.id).order("created_at", { ascending: true }).limit(200);
      if (last) q = q.gt("created_at", last.created_at);
      const { data } = await q;
      const fresh = (data ?? []) as GroupMessage[];
      if (fresh.length) {
        setMessages((prev) => {
          const have = new Set(prev.map((m) => m.id));
          const added = fresh.filter((m) => !have.has(m.id));
          const sentNow = new Set(added.filter((m) => m.user_id === currentUserId).map((m) => m.content));
          return [...prev.filter((m) => !(m.id.startsWith("temp-") && sentNow.has(m.content))), ...added];
        });
        onSeenRef.current();
      }
      void loadReactions(saved.slice(-40).map((m) => m.id).concat(fresh.map((m) => m.id)));
    })();
  }, 15000);

  /** Scrolls to a message and marks it for a moment, loading back to it if it's older. */
  const jumpTo = useCallback(async (id: string) => {
    if (!messageIds.current.has(id)) {
      const { data: target } = await supabase.from("group_messages").select("created_at").eq("id", id).maybeSingle();
      if (!target) return toast({ title: "That message is no longer here" });
      const { data } = await supabase.from("group_messages").select("*").eq("group_id", group.id).gte("created_at", target.created_at).order("created_at", { ascending: true }).limit(1000);
      setMessages((data ?? []) as GroupMessage[]);
      setHasMore(true);
      void loadReactions((data ?? []).map((m) => m.id));
    }
    setHighlightId(id);
    window.setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 2500);
  }, [group.id, loadReactions, toast]);

  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!loading && focusMessageId && focused.current !== focusMessageId) {
      focused.current = focusMessageId;
      void jumpTo(focusMessageId);
    }
  }, [loading, focusMessageId, jumpTo]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setReactions([]);
    void loadMessages();
    void loadMembers();
    onSeenRef.current();
    const channel = dbChannel(`group-conversation-${group.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${group.id}` }, (payload) => {
        const m = payload.new as GroupMessage;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev.filter((x) => !(x.id.startsWith("temp-") && x.content === m.content && x.user_id === m.user_id)), m]));
        if (m.user_id !== currentUserId && !mutedRef.current) playSound("message");
        onSeenRef.current();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "group_messages", filter: `group_id=eq.${group.id}` }, (payload) => {
        const m = payload.new as GroupMessage;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
      })
      // Deletions only carry the message's id, so they can't be filtered by group.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "group_messages" }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) setMessages((prev) => prev.filter((x) => x.id !== id));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_message_reactions" }, (payload) => {
        const row = (payload.new ?? {}) as Partial<ChatReaction>;
        if (payload.eventType === "INSERT" && row.message_id && !messageIds.current.has(row.message_id)) return;
        void loadReactions();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${group.id}` }, () => void loadMembers())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [group.id, currentUserId, loadMessages, loadMembers, loadReactions]);

  // "Ada is typing…": everyone in the chat shares who's typing (nothing is saved).
  useEffect(() => {
    const channel = supabase.channel(`group-typing-${group.id}`, { config: { presence: { key: currentUserId } } });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ userId: string; name: string; isTyping: boolean }>();
        const list: { id: string; name: string }[] = [];
        for (const presences of Object.values(state)) {
          const p = presences[presences.length - 1];
          if (p && p.userId !== currentUserId && p.isTyping) list.push({ id: p.userId, name: p.name });
        }
        setTyping(list);
      })
      .subscribe();
    typingChannel.current = channel;
    return () => {
      window.clearTimeout(typingTimer.current);
      amTyping.current = false;
      typingChannel.current = null;
      void supabase.removeChannel(channel);
    };
  }, [group.id, currentUserId]);

  /** Says you're typing when you start, and that you've stopped after a pause (not every key). */
  const noteTyping = (stopNow = false) => {
    const channel = typingChannel.current;
    if (!channel) return;
    window.clearTimeout(typingTimer.current);
    if (stopNow) {
      if (amTyping.current) void channel.track({ userId: currentUserId, name: myName, isTyping: false });
      amTyping.current = false;
      return;
    }
    if (!amTyping.current) {
      amTyping.current = true;
      void channel.track({ userId: currentUserId, name: myName, isTyping: true });
    }
    typingTimer.current = window.setTimeout(() => noteTyping(true), 2500);
  };

  const react = useCallback(async (messageId: string, type: string | null) => {
    const mine = reactions.find((r) => r.message_id === messageId && r.user_id === currentUserId)?.reaction_type ?? null;
    const next = type === mine ? null : type;
    haptic(8);
    setReactions((prev) => [
      ...prev.filter((r) => !(r.message_id === messageId && r.user_id === currentUserId)),
      ...(next ? [{ message_id: messageId, user_id: currentUserId, reaction_type: next }] : []),
    ]);
    if (mine) await supabase.from("group_message_reactions").delete().eq("message_id", messageId).eq("user_id", currentUserId);
    if (next) {
      const { error } = await supabase.from("group_message_reactions").insert({ message_id: messageId, user_id: currentUserId, reaction_type: next });
      if (error) toast({ title: "Couldn't react", description: /group_message_reactions/.test(error.message) ? "This needs the latest database update." : error.message, variant: "destructive" });
    }
    void loadReactions([messageId]);
  }, [reactions, currentUserId, loadReactions, toast]);

  const startReply = useCallback((m: GroupMessage) => {
    setEditing(null);
    setReplyingTo(m);
    requestAnimationFrame(() => boxRef.current?.focus());
  }, []);

  const startEdit = useCallback((m: GroupMessage) => {
    setReplyingTo(null);
    setMedia(null);
    setEditing(m);
    setText(m.content);
    requestAnimationFrame(() => boxRef.current?.focus());
  }, []);

  const starMessage = useCallback(async (m: GroupMessage) => {
    haptic(8);
    const error = await toggleStar(m.id, "group");
    if (error) toast({ title: "Couldn't star the message", description: error, variant: "destructive" });
  }, [toggleStar, toast]);

  const deleteMessage = async (m: GroupMessage) => {
    const { error } = await supabase.from("group_messages").delete().eq("id", m.id);
    if (error) return toast({ title: "Couldn't delete the message", description: error.message, variant: "destructive" });
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
  };

  /** Sends a message (text, a photo / video / GIF with an optional caption, or a voice note). */
  const post = async (content: string, imageUrl: string | null, restore?: () => void) => {
    const tempId = `temp-${Date.now()}`;
    const replyTo = replyingTo?.id ?? null;
    setReplyingTo(null);
    noteTyping(true);
    setMessages((prev) => [...prev, { id: tempId, group_id: group.id, user_id: currentUserId, content, image_url: imageUrl, created_at: new Date().toISOString(), reply_to: replyTo }]);
    setSending(true);
    playSound("send");
    haptic();
    const { data, error } = await supabase
      .from("group_messages")
      .insert({ group_id: group.id, user_id: currentUserId, content, image_url: imageUrl, ...(replyTo ? { reply_to: replyTo } : {}) })
      .select()
      .single();
    setSending(false);
    if (error || !data) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      restore?.();
      toast({ title: "Couldn't send message", description: error?.message, variant: "destructive" });
      return;
    }
    setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev.filter((m) => m.id !== tempId) : prev.map((m) => (m.id === tempId ? (data as GroupMessage) : m))));
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const caption = text.trim();
    if (editing) {
      if (!caption) return;
      const target = editing;
      setEditing(null);
      setText("");
      if (caption === target.content) return;
      setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, content: caption, edited_at: new Date().toISOString() } : m)));
      const { error } = await supabase.rpc("edit_group_message", { _id: target.id, _content: caption });
      if (error) {
        setMessages((prev) => prev.map((m) => (m.id === target.id ? target : m)));
        toast({ title: "Couldn't edit the message", description: /edit_group_message/.test(error.message) ? "This needs the latest database update." : error.message, variant: "destructive" });
      }
      return;
    }
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
    const day = new Date(m.created_at);
    const newDay = !prev || new Date(prev.created_at).toDateString() !== day.toDateString();
    const sender = memberById.get(m.user_id);
    const quoted = m.reply_to ? messages.find((x) => x.id === m.reply_to) ?? null : null;
    return (
      <>
        {newDay && (
          <div className="flex justify-center pb-1 pt-3">
            <span className="rounded-lg bg-card/90 px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground shadow-sm dark:bg-[#1c2530]/90">{dayLabel(day)}</span>
          </div>
        )}
        <GroupMessageBubble
          message={m}
          mine={m.user_id === currentUserId}
          firstInRun={newDay || !prev || prev.user_id !== m.user_id}
          senderName={sender?.full_name || "Former member"}
          senderAvatar={sender?.avatar_url ?? null}
          quoted={quoted}
          quotedName={quoted ? (quoted.user_id === currentUserId ? "You" : nameOf(quoted.user_id)) : ""}
          reactions={reactions.filter((r) => r.message_id === m.id)}
          currentUserId={currentUserId}
          nameOf={nameOf}
          onReact={(id, type) => void react(id, type)}
          onReply={startReply}
          onEdit={startEdit}
          onDelete={setDeleting}
          onOpenPhoto={(url) => setViewer({ url })}
          starred={isStarred(m.id)}
          onToggleStar={starMessage}
          onForward={setForwarding}
          highlighted={highlightId === m.id}
        />
      </>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- memberById is rebuilt from members
  }, [messages, currentUserId, members, reactions, nameOf, react, startReply, startEdit, starVersion, highlightId]);

  const others = members.filter((m) => m.id !== currentUserId);
  const typingLine = typing.length === 0 ? null
    : typing.length === 1 ? `${typing[0].name} is typing…`
    : typing.length === 2 ? `${typing[0].name} and ${typing[1].name} are typing…`
    : `${typing.length} people are typing…`;
  const subtitle = typingLine ?? (others.length
    ? others.slice(0, 6).map((m) => m.full_name?.split(" ")[0] || "Someone").join(", ") + (others.length > 6 ? ", …" : "")
    : "Only you");

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Header: back, picture, name and who's in it (tap for the group's info), calls */}
      {!embedded && <div className="flex flex-shrink-0 items-center gap-1 border-b bg-card px-1.5 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] sm:px-3">
        <Button variant="ghost" size="icon" className="h-10 w-10 md:hidden [&_svg]:size-6" aria-label="Back to chats" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-0.5 text-left" onClick={() => setShowInfo(true)} aria-label={`${group.name}, group info`}>
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={group.image_url || undefined} />
            <AvatarFallback className="bg-secondary"><Users className="h-5 w-5" /></AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="flex items-center gap-1 font-semibold">
              <span className="truncate">{group.name}</span>
              {muted && <BellOff className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-label="Muted" />}
            </span>
            <span className={cn("block truncate text-xs", typingLine ? "font-medium text-primary" : "text-muted-foreground")}>{subtitle}</span>
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
      </div>}

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
          scrollToIndex={highlightId ? messages.findIndex((m) => m.id === highlightId) : undefined}
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

      <form onSubmit={send} className={cn("chat-wallpaper flex-shrink-0 px-2 pt-1.5", embedded ? "pb-2" : "pb-[max(0.5rem,env(safe-area-inset-bottom))]")}>
        {embedded && typingLine && <p className="px-3 pb-1 text-xs font-medium text-primary" aria-live="polite">{typingLine}</p>}
        {/* Replying to (or editing) a message: a quote above the box, as in WhatsApp. */}
        {(replyingTo || editing) && !recording && (
          <div className="mb-1 mr-[54px] flex items-start gap-2 rounded-2xl bg-card p-1.5 pl-2 shadow-sm animate-fade-in dark:bg-[#232327]">
            <div className="min-w-0 flex-1 rounded-lg border-l-4 border-primary bg-black/5 px-2 py-1 dark:bg-white/5">
              <p className="text-xs font-semibold text-primary">
                {editing ? "Editing message" : replyingTo!.user_id === currentUserId ? "You" : nameOf(replyingTo!.user_id)}
              </p>
              <p className="truncate text-[13px] text-muted-foreground">{quoteText((editing ?? replyingTo)!).substring(0, 80)}</p>
            </div>
            <button
              type="button"
              aria-label={editing ? "Cancel editing" : "Cancel reply"}
              className="mt-0.5 rounded-full p-1 text-muted-foreground hover:bg-accent"
              onClick={() => { setReplyingTo(null); if (editing) { setEditing(null); setText(""); } }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
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
            <div className="flex min-h-12 min-w-0 flex-1 items-end gap-0.5 rounded-3xl bg-card px-1 py-1 shadow-sm dark:bg-[#232327] [&_button]:h-10 [&_button]:w-10 [&_button]:shrink-0 [&_button]:rounded-full [&_button_svg]:!h-[22px] [&_button_svg]:!w-[22px] [&_button_svg]:text-muted-foreground">
              {!editing && <GifPicker
                onSelect={(picked) => {
                  if (picked.startsWith("http")) setMedia({ url: picked, type: "image" });
                  else setText((t) => t + picked);
                }}
              />}
              <textarea
                ref={boxRef}
                rows={1}
                value={text}
                onChange={(e) => { setText(e.target.value); if (e.target.value) noteTyping(); }}
                onKeyDown={sendOnEnter}
                enterKeyHint={enterMakesNewLine() ? "enter" : "send"}
                placeholder={editing ? "Edit message" : media ? "Add a caption" : "Message"}
                aria-label="Message"
                className="min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[16px] leading-6 outline-none placeholder:text-muted-foreground"
              />
              {!editing && <ChatImageUpload
                onMediaUploaded={(url, type) => setMedia({ url, type })}
                onMediaCleared={() => setMedia(null)}
                previewUrl={null}
                mediaType={null}
                isUploading={uploading}
                setIsUploading={setUploading}
              />}
            </div>
          )}
          {text.trim() || media || editing ? (
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
          muted={muted}
          onToggleMute={onToggleMute}
          onGroupUpdated={onGroupUpdated}
          onOpenGallery={(tab) => { setShowInfo(false); setGallery(tab); }}
        />
      )}

      <ForwardDialog message={forwarding} currentUserId={currentUserId} onOpenChange={(open) => { if (!open) setForwarding(null); }} />
      {gallery && (
        <ChatMediaPanel
          scope={{ kind: "group", groupId: group.id }}
          currentUserId={currentUserId}
          initialTab={gallery}
          onClose={() => setGallery(null)}
          onJump={(item) => { setGallery(null); void jumpTo(item.id); }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        title="Delete this message?"
        description="It will be deleted for everyone in the group."
        confirmLabel="Delete"
        onConfirm={() => { if (deleting) void deleteMessage(deleting); setDeleting(null); }}
      />
    </div>
  );
};

export default GroupConversation;
