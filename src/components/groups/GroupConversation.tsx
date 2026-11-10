import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import MentionInput from "@/components/MentionInput";
import { features } from "@/lib/features";
import { plainMentions, type Mention } from "@/lib/mentions";
import { useNavigate } from "react-router-dom";
import { setPrivateReply } from "@/lib/private-reply";
import { isRepeatSend } from "@/hooks/use-single-flight";
import GroupInitials from "@/components/groups/GroupInitials";
import { ArrowLeft, BellOff, Camera, Check, Copy, CornerUpLeft, Forward, Keyboard, Loader2, MoreVertical, Paperclip, Phone, Send, Smile, Star, Trash2, Users, Video, X } from "@/components/icons";
import { format, isThisWeek, isToday, isYesterday } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCalls } from "@/hooks/use-calls";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import VirtualizedChatList from "@/components/VirtualizedChatList";
import VoiceMessageRecorder from "@/components/VoiceMessageRecorder";
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
import type { ChatMessage } from "@/components/ChatBubble";
import ChatMediaPanel, { type GalleryTab } from "@/components/chat/ChatMediaPanel";
import { enterMakesNewLine, sendOnEnter, useAutoGrow } from "@/lib/enter-key";
import type { GroupInfo } from "@/lib/group-chats";
import { playSound } from "@/lib/sounds";
import { haptic } from "@/lib/haptics";
import { cn, friendlyError } from "@/lib/utils";
import { dbChannel } from "@/lib/realtime";
import { useResync } from "@/hooks/use-resync";
import { GIPHY_STICKER, stickerMessage } from "@/lib/stickers";
import TypingBubble from "@/components/chat/TypingBubble";
import AttachPanel from "@/components/chat/AttachPanel";
import MediaSendSheet from "@/components/chat/MediaSendSheet";
import ChatAlbum from "@/components/chat/ChatAlbum";
import { EventComposer, PollComposer } from "@/components/chat/ChatComposers";
import { DeleteMessageDialog, PinnedBar } from "@/components/chat/MessageDialogs";
import GroupReadInfo from "@/components/groups/GroupReadInfo";
import WallpaperDialog, { WallpaperLayer } from "@/components/chat/ChatWallpaper";
import { useWallpaper } from "@/lib/chat-wallpaper";
import { useKeyboard } from "@/lib/keyboard-height";
import { groupSeenAt, nameColour } from "@/lib/group-chats";
import type { ChatEvent, ChatFile, ChatPoll } from "@/lib/chat-extras";
import type { TablesInsert } from "@/integrations/supabase/types";
import { shrinkImage } from "@/lib/image-compress";
import { shrinkVideo } from "@/lib/video-compress";
import { uploadMedia } from "@/lib/media-upload";
import { imageSize, limiter, withMediaSize } from "@/lib/chat-media";
import { groupAlbums, lastOf } from "@/lib/chat-albums";
import { publicUrl } from "@/lib/native/platform";

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
const MEDIA_TEXT = ["📷 Photo", "🎥 Video", "GIF"];

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
  const sending = false;
  const [showInfo, setShowInfo] = useState(false);
  // A photo, video or GIF waiting to be sent, and the voice recorder taking over the bar.
  const [media, setMedia] = useState<{ url: string; type: "image" | "video" } | null>(null);
  const uploading = false;
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
  const [forwardingMany, setForwardingMany] = useState<GroupMessage[] | null>(null);
  const [gallery, setGallery] = useState<GalleryTab | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [typing, setTyping] = useState<{ id: string; name: string }[]>([]);
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimer = useRef<number>();
  const amTyping = useRef(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  // People @mentioned in the message being typed (told when it's sent).
  const [picked, setPicked] = useState<Mention[]>([]);
  // The last message sent, so a double tap on Send doesn't send it twice.
  const lastSendRef = useRef<{ text: string; at: number } | null>(null);
  // Emoji / attach in the keyboard's place, and photos picked to send (as in one-to-one chats).
  const [panel, setPanel] = useState<null | "emoji" | "attach">(null);
  const [pickedPhotos, setPickedPhotos] = useState<File[] | null>(null);
  const keyboard = useKeyboard();
  const closingToKeyboard = useRef(false);
  // Part 2 (after the database update): pins, delete for me, message info, polls and events.
  const v2 = features.groupChats2;
  const [pins, setPins] = useState<string[]>([]);
  const [pinIndex, setPinIndex] = useState(0);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [askDelete, setAskDelete] = useState<GroupMessage | null>(null);
  const [infoFor, setInfoFor] = useState<GroupMessage | null>(null);
  const [readTimes, setReadTimes] = useState<Record<string, string | null>>({});
  const [pollOpen, setPollOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [selection, setSelection] = useState<string[] | null>(null);
  // Your own photo behind this chat (or all chats), as on WhatsApp.
  const wallpaper = useWallpaper(currentUserId, `g:${group.id}`);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  // When you last looked at this chat (before now): the "unread messages" line goes there.
  const [seenBefore] = useState(() => groupSeenAt(currentUserId, group.id));
  useAutoGrow(boxRef, text, 150);
  useDraft(currentUserId, `g:${group.id}`, text, setText, !!editing);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const onSeenRef = useRef(onSeen);
  onSeenRef.current = onSeen;
  const onLeftRef = useRef(onLeft);
  onLeftRef.current = onLeft;
  const seenRef = useRef<() => void>(() => onSeen());

  const memberById = new Map(members.map((m) => [m.id, m]));
  const nameOf = useCallback((id: string) => members.find((m) => m.id === id)?.full_name || "Former member", [members]);
  const myName = members.find((m) => m.id === currentUserId)?.full_name?.split(" ")[0] || "Someone";
  const mentionable = useMemo(() => members.filter((m) => m.id !== currentUserId).map((m) => ({ id: m.id, full_name: m.full_name, avatar_url: m.avatar_url ?? null })), [members, currentUserId]);
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
    seenRef.current();
    const channel = dbChannel(`group-conversation-${group.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${group.id}` }, (payload) => {
        const m = payload.new as GroupMessage;
        // Your own message coming back takes its placeholder's place (keeping the photo on screen).
        setMessages((prev) => {
          if (prev.some((x) => x.id === m.id)) return prev;
          const i = prev.findIndex((x) => x.id.startsWith("temp-") && x._status === "sending" && x.content === m.content && x.user_id === m.user_id);
          if (i < 0) return [...prev, m];
          const next = [...prev];
          next[i] = { ...m, _preview: prev[i]._preview, _video: prev[i]._video };
          return next;
        });
        if (m.user_id !== currentUserId && !mutedRef.current) playSound("message");
        seenRef.current();
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

  // ---- Part 2: pins, hidden messages, who has read what (after the database update) ----
  const loadPins = useCallback(async () => {
    if (!v2) return;
    const { data } = await supabase.from("group_pins").select("message_id, pinned_at").eq("group_id", group.id).order("pinned_at", { ascending: false });
    setPins((data ?? []).map((p) => p.message_id));
  }, [v2, group.id]);
  const loadReadTimes = useCallback(async () => {
    if (!v2) return;
    const { data } = await supabase.from("group_members").select("user_id, last_read_at").eq("group_id", group.id);
    setReadTimes(Object.fromEntries((data ?? []).map((r) => [r.user_id, r.last_read_at])));
  }, [v2, group.id]);
  useEffect(() => {
    if (!v2) return;
    void loadPins();
    void supabase.from("hidden_group_messages").select("message_id").eq("user_id", currentUserId).order("created_at", { ascending: false }).limit(2000)
      .then(({ data }) => setHiddenIds(new Set((data ?? []).map((h) => h.message_id))));
    const channel = dbChannel(`group-pins-${group.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_pins", filter: `group_id=eq.${group.id}` }, () => void loadPins())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [v2, group.id, currentUserId, loadPins]);

  // You've read the chat up to now: saved for "read by" (at most every few seconds).
  const lastMarked = useRef(0);
  const seen = useCallback(() => {
    onSeenRef.current();
    if (!v2 || Date.now() - lastMarked.current < 5000) return;
    lastMarked.current = Date.now();
    void supabase.rpc("mark_group_read", { _group: group.id });
  }, [v2, group.id]);
  seenRef.current = seen;

  const togglePin = useCallback(async (m: GroupMessage) => {
    haptic(8);
    if (pins.includes(m.id)) {
      setPins((p) => p.filter((id) => id !== m.id));
      await supabase.from("group_pins").delete().eq("message_id", m.id);
      return;
    }
    if (pins.length >= 3) { toast({ title: "You can pin up to 3 messages", description: "Unpin one first." }); return; }
    setPins((p) => [m.id, ...p]);
    setPinIndex(0);
    const { error } = await supabase.from("group_pins").insert({ message_id: m.id, group_id: group.id, pinned_by: currentUserId });
    if (error) { setPins((p) => p.filter((id) => id !== m.id)); toast({ title: "Couldn't pin the message", description: friendlyError(error), variant: "destructive" }); }
  }, [pins, group.id, currentUserId, toast]);

  const deleteForMe = async (m: GroupMessage) => {
    if (m.id.startsWith("temp-")) { retries.current.delete(m.id); setMessages((prev) => prev.filter((x) => x.id !== m.id)); return; }
    setHiddenIds((prev) => new Set(prev).add(m.id));
    const { error } = await supabase.from("hidden_group_messages").insert({ user_id: currentUserId, message_id: m.id });
    if (error) { setHiddenIds((prev) => { const n = new Set(prev); n.delete(m.id); return n; }); toast({ title: "Couldn't delete it", description: friendlyError(error), variant: "destructive" }); }
  };
  const openInfo = useCallback((m: GroupMessage) => { void loadReadTimes(); setInfoFor(m); }, [loadReadTimes]);

  // Select messages: press and hold → Select, then tap more.
  const toggleSelected = useCallback((ids: string[]) => {
    haptic(8);
    setSelection((prev) => {
      const now = prev ?? [];
      const on = ids.every((id) => now.includes(id));
      const next = on ? now.filter((id) => !ids.includes(id)) : [...now, ...ids.filter((id) => !now.includes(id))];
      return next.length ? next : null;
    });
  }, []);
  const startSelect = useCallback((m: GroupMessage) => toggleSelected([m.id]), [toggleSelected]);

  // The panel in the keyboard's place: tapping the box brings the keyboard back.
  const showKeyboard = () => {
    closingToKeyboard.current = true;
    boxRef.current?.focus();
    window.setTimeout(() => { if (closingToKeyboard.current) { closingToKeyboard.current = false; setPanel(null); } }, matchMedia("(pointer: coarse)").matches ? 600 : 0);
  };
  const togglePanel = (which: "emoji" | "attach") => {
    if (panel === which) { showKeyboard(); return; }
    closingToKeyboard.current = false;
    boxRef.current?.blur();
    setPanel(which);
    haptic(8);
  };
  useEffect(() => {
    if (keyboard.open && panel) { closingToKeyboard.current = false; setPanel(null); }
  }, [keyboard.open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!panel && !selection) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setPanel(null); setSelection(null); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel, selection]);

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

  // Reply privately, as on WhatsApp: their one-to-one chat opens with this message quoted.
  const navigate = useNavigate();
  const replyPrivately = useCallback((m: GroupMessage) => {
    const text = m.content?.startsWith("🎤") ? "🎤 Voice message" : m.image_url && (!m.content || /^(📷 Photo|🎥 Video|GIF)$/.test(m.content)) ? "📷 Photo" : m.content;
    setPrivateReply(m.user_id, { name: nameOf(m.user_id), text: plainMentions(text || "").slice(0, 300), group_id: group.id, group_name: group.name });
    navigate(`/messages?user=${m.user_id}`);
  }, [nameOf, group.id, group.name, navigate]);

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
    if (error) return toast({ title: "Couldn't delete the message", description: friendlyError(error), variant: "destructive" });
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
  };

  // ---- Sending, as in one-to-one chats: the message shows at once and goes; a photo with its
  // upload ring; one that couldn't go stays with a red "!" to try again. ----
  type SendOpts = {
    content: string;
    imageUrl?: string | null;
    upload?: (onProgress: (percent: number) => void) => Promise<string>;
    preview?: string;
    video?: boolean;
    mentioned?: string[];
    extra?: { poll?: ChatPoll; event?: ChatEvent; file?: Omit<ChatFile, "url"> };
  };
  const retries = useRef(new Map<string, () => void>());
  const patch = useCallback((id: string, p: Partial<GroupMessage>) => setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...p } : m))), []);

  const placeholder = (opts: SendOpts, replyTo: string | null): GroupMessage => ({
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    group_id: group.id, user_id: currentUserId, content: opts.content,
    image_url: opts.extra?.file ? null : opts.preview ?? opts.imageUrl ?? null,
    created_at: new Date().toISOString(), reply_to: replyTo,
    _status: "sending", _preview: opts.preview, _video: opts.video || undefined, _progress: opts.upload ? 0 : undefined,
    ...(opts.extra?.poll ? { poll: opts.extra.poll } : {}),
    ...(opts.extra?.event ? { event: opts.extra.event } : {}),
    ...(opts.extra?.file ? { file: { ...opts.extra.file, url: opts.preview ?? "" } } : {}),
  });

  const deliver = async (temp: GroupMessage, opts: SendOpts, url?: Promise<string>): Promise<boolean> => {
    retries.current.set(temp.id, () => {
      patch(temp.id, { _status: "sending", _progress: opts.upload ? 0 : undefined });
      void deliver(temp, opts).then((ok) => { if (ok) { playSound("send"); haptic(); } });
    });
    try {
      const address = url ? await url : opts.upload ? await opts.upload((p) => patch(temp.id, { _progress: p })) : opts.imageUrl ?? null;
      const doc = opts.extra?.file;
      const row: TablesInsert<"group_messages"> = { group_id: group.id, user_id: currentUserId, content: temp.content, image_url: doc ? null : address };
      if (temp.reply_to) row.reply_to = temp.reply_to;
      if (opts.mentioned?.length) row.mentions = opts.mentioned;
      if (doc && address) row.file = { ...doc, url: address };
      if (opts.extra?.poll) row.poll = { ...opts.extra.poll };
      if (opts.extra?.event) row.event = { ...opts.extra.event };
      const { data, error } = await supabase.from("group_messages").insert(row).select().single();
      if (error || !data) throw error ?? new Error("Couldn't send");
      retries.current.delete(temp.id);
      setMessages((prev) => (prev.some((m) => m.id === data.id)
        ? prev.filter((m) => m.id !== temp.id)
        : prev.map((m) => (m.id === temp.id ? { ...(data as GroupMessage), _preview: m._preview, _video: m._video } : m))));
      return true;
    } catch (error) {
      patch(temp.id, { _status: "failed", _progress: undefined });
      toast({ title: "Couldn't send", description: friendlyError(error), variant: "destructive" });
      return false;
    }
  };

  const sendOne = async (opts: SendOpts) => {
    const replyTo = replyingTo?.id ?? null;
    setReplyingTo(null);
    noteTyping(true);
    const temp = placeholder(opts, replyTo);
    setMessages((prev) => [...prev, temp]);
    return deliver(temp, opts);
  };

  /** Sends a message (text, a photo / video / GIF with an optional caption, or a sticker). */
  const post = async (content: string, imageUrl: string | null, _restore?: () => void, mentioned?: string[]) => {
    playSound("send");
    haptic();
    await sendOne({ content, imageUrl, mentioned });
  };

  const retrySend = useCallback((m: GroupMessage) => { haptic(8); retries.current.get(m.id)?.(); }, []);

  /** A photo or video from the phone: made smaller, uploaded, its address with its size. */
  const uploadChatFile = async (file: File, kind: "image" | "video", onProgress: (p: number) => void) => {
    const upload = kind === "image" ? await shrinkImage(file) : await shrinkVideo(file);
    const size = kind === "image" ? await imageSize(upload) : null;
    const url = await uploadMedia("chat-images", `${currentUserId}/${Date.now()}-${upload.name}`, upload, onProgress);
    return size ? withMediaSize(url, size.w, size.h) : url;
  };

  // Photos from the picker: all show at once (an album for 4 or more), upload side by side,
  // and are saved in order. The caption goes on the first.
  const sendPhotos = async (files: File[], caption: string) => {
    setPickedPhotos(null);
    const replyTo = replyingTo?.id ?? null;
    setReplyingTo(null);
    const jobs = files.map((file, i) => {
      const opts: SendOpts = { content: i === 0 && caption ? caption : "📷 Photo", preview: URL.createObjectURL(file), upload: (onProgress) => uploadChatFile(file, "image", onProgress) };
      return { opts, temp: placeholder(opts, i === 0 ? replyTo : null) };
    });
    setMessages((prev) => [...prev, ...jobs.map((j) => j.temp)]);
    const limit = limiter(3);
    const urls = jobs.map((j) => limit(() => j.opts.upload!((p) => patch(j.temp.id, { _progress: p }))));
    urls.forEach((u) => u.catch(() => {}));
    let sent = 0;
    for (const [i, j] of jobs.entries()) if (await deliver(j.temp, j.opts, urls[i])) sent++;
    if (sent) { playSound("send"); haptic(); }
  };

  const sendVideo = async (file: File) => {
    setPanel(null);
    if (file.size > 200 * 1024 * 1024) { toast({ title: "That video is too big", description: "Up to 200 MB.", variant: "destructive" }); return; }
    if (await sendOne({ content: "🎥 Video", video: true, preview: URL.createObjectURL(file), upload: (onProgress) => uploadChatFile(file, "video", onProgress) })) { playSound("send"); haptic(); }
  };

  const sendDocument = async (file: File) => {
    setPanel(null);
    if (file.size > 100 * 1024 * 1024) { toast({ title: "That file is too big", description: "Up to 100 MB.", variant: "destructive" }); return; }
    const meta = { name: file.name.slice(0, 200), size: file.size, type: file.type || "application/octet-stream" };
    if (await sendOne({ content: `📄 ${meta.name}`, preview: URL.createObjectURL(file), upload: (onProgress) => uploadMedia("chat-files", file.name, file, onProgress), extra: { file: meta } })) { playSound("send"); haptic(); }
  };

  const [locating, setLocating] = useState(false);
  const sendLocation = () => {
    if (!navigator.geolocation) { toast({ title: "Location isn't available on this device", variant: "destructive" }); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPanel(null);
        void post(`📍 My location\nhttps://maps.google.com/?q=${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`, null);
      },
      () => { setLocating(false); toast({ title: "Couldn't get your location", description: "Allow Ember to use your location in your phone's settings, then try again.", variant: "destructive" }); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const sendVoice = async (file: File, seconds: number) => {
    const content = `🎤 Voice message (${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")})`;
    if (await sendOne({ content, preview: URL.createObjectURL(file), upload: (onProgress) => uploadMedia("voice-messages", file.name, file, onProgress) })) { playSound("send"); haptic(); }
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
    const sendKey = `${caption}|${media?.url ?? ""}`;
    if (isRepeatSend(lastSendRef.current, sendKey)) return;
    lastSendRef.current = { text: sendKey, at: Date.now() };
    const attached = media;
    const content = caption || (attached ? (mediaKind(attached.url) === "gif" ? "GIF" : attached.type === "video" ? "🎥 Video" : "📷 Photo") : "");
    // Who's @mentioned (and still in the text) is told.
    const mentioned = features.messaging2 ? picked.filter((p) => caption.includes(`@${p.name}`)).map((p) => p.id) : [];
    setText("");
    setMedia(null);
    setPicked([]);
    await post(content, attached?.url ?? null, () => { setText(caption); setMedia(attached); }, mentioned);
  };

  const sendVoiceNote = (url: string, seconds: number) =>
    post(`🎤 Voice message (${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")})`, url);

  // What's on screen: without messages you deleted for yourself, with albums for 4+ photos.
  const visible = useMemo(() => messages.filter((m) => !hiddenIds.has(m.id)), [messages, hiddenIds]);
  const rows = useMemo(() => groupAlbums(visible, (m) => m.user_id), [visible]);
  // The first message from someone else since you last looked: the "unread messages" line.
  const unread = useMemo(() => {
    if (!seenBefore) return null;
    const first = visible.findIndex((m) => m.user_id !== currentUserId && m.created_at > seenBefore && !m.id.startsWith("temp-"));
    if (first < 0) return null;
    return { id: visible[first].id, count: visible.slice(first).filter((m) => m.user_id !== currentUserId).length };
  // Only as the chat opens (not as new messages come in while it's open).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, seenBefore]);
  const unreadRow = unread ? rows.findIndex((r) => (r.album ?? [r.message]).some((m) => m.id === unread.id)) : -1;
  const selectedMessages = selection ? visible.filter((m) => selection.includes(m.id)) : [];

  const renderMessage = useCallback((index: number): ReactElement | null => {
    const row = rows[index];
    if (!row) return null;
    const m = row.message;
    const ids = (row.album ?? [m]).map((x) => x.id);
    const prevRow = index > 0 ? lastOf(rows[index - 1]) : null;
    const day = new Date(m.created_at);
    const newDay = !prevRow || new Date(prevRow.created_at).toDateString() !== day.toDateString();
    const firstInRun = newDay || !prevRow || prevRow.user_id !== m.user_id;
    const sender = memberById.get(m.user_id);
    const quoted = m.reply_to ? messages.find((x) => x.id === m.reply_to) ?? null : null;
    const picked = !!selection && ids.every((id) => selection.includes(id));
    const mine = m.user_id === currentUserId;
    return (
      <>
        {newDay && (
          <div className="flex justify-center pb-1 pt-3">
            <span className="rounded-lg bg-card/90 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm dark:bg-[#1c2530]/90">{dayLabel(day)}</span>
          </div>
        )}
        {index === unreadRow && unread && (
          <div role="separator" className="-mx-4 my-2 bg-card/80 py-1 text-center text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur sm:-mx-5 dark:bg-[#1c2530]/80">
            {unread.count} unread {unread.count === 1 ? "message" : "messages"}
          </div>
        )}
        <div
          className={cn("relative", picked && "before:absolute before:-inset-x-5 before:inset-y-0 before:bg-primary/15", selection && "pl-9")}
          // While selecting, a tap picks or drops the message instead of opening anything.
          onClickCapture={selection ? (e) => { e.preventDefault(); e.stopPropagation(); if (!m.id.startsWith("temp-")) toggleSelected(ids); } : undefined}
          onPointerDownCapture={selection ? (e) => e.stopPropagation() : undefined}
        >
          {selection && (
            <span aria-hidden="true" className={cn("absolute left-0 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border-2", picked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50 bg-background/60")}>
              {picked && <Check className="h-4 w-4" strokeWidth={3} />}
            </span>
          )}
          {row.album ? (
            <div className={cn("flex items-end gap-1.5", firstInRun ? "pt-2" : "pt-0.5", mine ? "justify-end" : "justify-start")}>
              {!mine && (
                <div className="w-8 flex-shrink-0 self-start pt-0.5">
                  {firstInRun && <Avatar className="h-8 w-8"><AvatarImage src={sender?.avatar_url || undefined} /><AvatarFallback className="text-[11px]">{(sender?.full_name || "?")[0]?.toUpperCase()}</AvatarFallback></Avatar>}
                </div>
              )}
              <ChatAlbum
                photos={row.album}
                isCurrentUser={mine}
                isFirstInGroup={firstInRun}
                onReply={startReply}
                onUnsend={(id) => { const x = messages.find((y) => y.id === id); if (x) void deleteMessage(x); }}
                onRetry={retrySend}
                group
                senderName={!mine && firstInRun ? sender?.full_name || "Former member" : undefined}
                senderClass={nameColour(m.user_id)}
              />
            </div>
          ) : (
          <GroupMessageBubble
            message={m}
            mine={mine}
            firstInRun={firstInRun}
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
            onDelete={v2 || m._status === "failed" ? setAskDelete : setDeleting}
            onOpenPhoto={(url) => setViewer({ url })}
            starred={isStarred(m.id)}
            onToggleStar={starMessage}
            onForward={setForwarding}
            onReplyPrivately={features.messaging2 ? replyPrivately : undefined}
            highlighted={highlightId === m.id}
            onRetry={retrySend}
            onSelect={m.id.startsWith("temp-") ? undefined : startSelect}
            onPin={v2 && !m.id.startsWith("temp-") ? togglePin : undefined}
            pinned={pins.includes(m.id)}
            onInfo={v2 && !m.id.startsWith("temp-") ? openInfo : undefined}
            deleteForMe={v2}
          />
          )}
        </div>
      </>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- memberById is rebuilt from members
  }, [rows, messages, currentUserId, members, reactions, nameOf, react, startReply, startEdit, starVersion, highlightId, replyPrivately, selection, unreadRow, unread, pins, retrySend, startSelect, togglePin, openInfo, toggleSelected, v2]);

  /** Copies the picked messages as WhatsApp does: "[12:04] Ada: text", one per line. */
  const copySelected = () => {
    const text = selectedMessages
      .filter((m) => m.content && !m.content.startsWith("🎤") && !MEDIA_TEXT.includes(m.content))
      .map((m) => (selectedMessages.length === 1 ? m.content : `[${format(new Date(m.created_at), "HH:mm")}] ${m.user_id === currentUserId ? "You" : nameOf(m.user_id)}: ${m.content}`))
      .join("\n");
    void navigator.clipboard?.writeText(text);
    toast({ title: selectedMessages.length === 1 ? "Message copied" : `${selectedMessages.length} messages copied` });
    setSelection(null);
  };

  const others = members.filter((m) => m.id !== currentUserId);
  const typingLine = typing.length === 0 ? null
    : typing.length === 1 ? `${typing[0].name} is typing…`
    : typing.length === 2 ? `${typing[0].name} and ${typing[1].name} are typing…`
    : `${typing.length} people are typing…`;
  const subtitle = typingLine ?? (others.length
    ? others.slice(0, 6).map((m) => m.full_name?.split(" ")[0] || "Someone").join(", ") + (others.length > 6 ? ", …" : "")
    : "Only you");

  return (
    <div className={cn("relative isolate flex h-full min-h-0 flex-col", wallpaper && "photo-wallpaper")}>
      <WallpaperLayer wallpaper={wallpaper} />
      {/* Picking messages: what you can do with them, in the header's place (as on WhatsApp). */}
      {selection && (
        <div role="toolbar" aria-label="Selected messages" className="flex flex-shrink-0 items-center gap-1 border-b bg-card px-1.5 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] sm:px-3">
          <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-6" aria-label="Cancel selecting" onClick={() => setSelection(null)}><X /></Button>
          <p className="flex-1 text-lg font-semibold tabular-nums" aria-live="polite">{selection.length}</p>
          {selectedMessages.length === 1 && (
            <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-[22px]" aria-label="Reply" onClick={() => { startReply(selectedMessages[0]); setSelection(null); }}><CornerUpLeft /></Button>
          )}
          <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-[22px]" aria-label="Star" onClick={() => { const anyOff = selectedMessages.some((m) => !isStarred(m.id)); selectedMessages.filter((m) => isStarred(m.id) !== anyOff).forEach((m) => void starMessage(m)); setSelection(null); }}><Star /></Button>
          {selectedMessages.some((m) => m.content && !m.content.startsWith("🎤") && !MEDIA_TEXT.includes(m.content)) && (
            <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-[22px]" aria-label="Copy" onClick={copySelected}><Copy /></Button>
          )}
          <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-[22px]" aria-label="Forward" onClick={() => { setForwardingMany(selectedMessages); setSelection(null); }}><Forward /></Button>
          {selectedMessages.every((m) => m.user_id === currentUserId) && (
            <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive [&_svg]:size-[22px]" aria-label="Delete for everyone" onClick={() => { selectedMessages.forEach((m) => void deleteMessage(m)); setSelection(null); haptic(); }}><Trash2 /></Button>
          )}
        </div>
      )}
      {/* Header: back, picture, name and who's in it (tap for the group's info), calls */}
      {!embedded && !selection && <div className="flex flex-shrink-0 items-center gap-1 border-b bg-card px-1.5 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] sm:px-3">
        <Button variant="ghost" size="icon" className="h-10 w-10 md:hidden [&_svg]:size-6" aria-label="Back to chats" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-0.5 text-left" onClick={() => setShowInfo(true)} aria-label={`${group.name}, group info`}>
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={group.image_url || undefined} />
            <AvatarFallback><GroupInitials id={group.id} name={group.name} className="text-sm" /></AvatarFallback>
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

      {/* Pinned messages (up to 3): tap to go to it, and on to the next. */}
      {pins.length > 0 && !selection && (() => {
        const id = pins[pinIndex % pins.length];
        const pm = messages.find((x) => x.id === id);
        return (
          <PinnedBar pins={pins} index={pinIndex % pins.length} preview={pm ? quoteText(pm) : "Pinned message"}
            onOpen={() => { void jumpTo(id); setPinIndex((i) => (i + 1) % pins.length); }}
            onUnpin={() => { setPins((p) => p.filter((x) => x !== id)); void supabase.from("group_pins").delete().eq("message_id", id); }} />
        );
      })()}

      {loading ? (
        <div className="chat-wallpaper flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : messages.length === 0 ? (
        <div className="chat-wallpaper flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center text-sm text-muted-foreground">
          <Users className="h-8 w-8 opacity-60" />
          No messages yet. Say hello to the group!
        </div>
      ) : (
        <VirtualizedChatList
          itemCount={rows.length}
          scrollToBottomKey={visible.length}
          firstItemKey={rows[0]?.message.id}
          lastIsMine={visible[visible.length - 1]?.user_id === currentUserId}
          startAtIndex={unreadRow > 0 ? unreadRow : undefined}
          dayLabelAt={(i) => (rows[i] ? dayLabel(new Date(rows[i].message.created_at)) : null)}
          estimatedItemSize={64}
          className="chat-wallpaper flex-1 overflow-hidden"
          renderItem={renderMessage}
          scrollToIndex={highlightId ? rows.findIndex((r) => (r.album ?? [r.message]).some((m) => m.id === highlightId)) : undefined}
          onLoadMore={async () => {
            if (loadingMore || !hasMore || !messages[0]) return;
            setLoadingMore(true);
            await loadMessages(messages[0].created_at);
            setLoadingMore(false);
          }}
          isLoadingMore={loadingMore}
          hasMore={hasMore}
          footer={typing.length > 0 ? <TypingBubble name={typing.length === 1 ? typing[0].name : `${typing.length} people`} /> : null}
        />
      )}

      <form onSubmit={send} className={cn("chat-wallpaper flex-shrink-0 px-2 pt-1.5", embedded ? "pb-2" : "pb-[max(0.5rem,env(safe-area-inset-bottom))]")}>
        {embedded && typingLine && <p className="px-3 pb-1 text-xs font-medium text-primary" aria-live="polite">{typingLine}</p>}
        {/* Replying to (or editing) a message: a quote above the box, as in WhatsApp. */}
        {(replyingTo || editing) && !recording && (
          <div className="mb-1 mr-[54px] flex items-start gap-2 rounded-2xl bg-chat-surface p-1.5 pl-2 shadow-sm animate-fade-in">
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
            <div className="flex min-h-12 min-w-0 flex-1 items-end gap-0.5 rounded-3xl bg-chat-surface px-1 py-1 shadow-sm [&_button]:h-10 [&_button]:w-10 [&_button]:shrink-0 [&_button]:rounded-full [&_button_svg]:!h-[22px] [&_button_svg]:!w-[22px] [&_button_svg]:text-muted-foreground">
              {/* 😊 opens emoji, GIFs and stickers in the keyboard's place; ⌨️ goes back to typing. */}
              <button type="button" onClick={() => togglePanel("emoji")} aria-label={panel === "emoji" ? "Show keyboard" : "Emoji, GIFs and stickers"} aria-expanded={panel === "emoji"} className="flex items-center justify-center hover:bg-accent">
                {panel === "emoji" ? <Keyboard /> : <Smile />}
              </button>
              {/* Typing @ suggests the group's members, as on WhatsApp; they're told. */}
              <MentionInput
                ref={boxRef}
                rows={1}
                value={text}
                onChange={(v) => { setText(v); if (v) noteTyping(); }}
                onKeyDown={sendOnEnter}
                onFocus={() => { if (panel) showKeyboard(); }}
                enterKeyHint={enterMakesNewLine() ? "enter" : "send"}
                placeholder={editing ? "Edit message" : media ? "Add a caption" : "Message"}
                aria-label="Message"
                rich={features.messaging2}
                mentions={picked}
                onMention={(m) => setPicked((prev) => [...prev.filter((p) => p.id !== m.id), m])}
                candidates={mentionable}
                wrapperClassName="min-w-0 flex-1"
                className="min-h-0 w-full resize-none rounded-none border-0 bg-transparent px-1 py-2 text-[16px] leading-6 shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {!editing && (
                <>
                  <button type="button" onClick={() => togglePanel("attach")} aria-label={panel === "attach" ? "Show keyboard" : "Attach"} aria-expanded={panel === "attach"} className="flex items-center justify-center hover:bg-accent">
                    {panel === "attach" ? <Keyboard /> : <Paperclip className="-rotate-45" />}
                  </button>
                  {/* The camera, straight away, as on WhatsApp. */}
                  <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-accent [&_svg]:!h-[22px] [&_svg]:!w-[22px] [&_svg]:text-muted-foreground" aria-label="Take a photo">
                    <Camera />
                    <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) { setPanel(null); setPickedPhotos(f); } }} />
                  </label>
                </>
              )}
            </div>
          )}
          {text.trim() || media || editing ? (
            <Button type="submit" size="icon" variant="accent" disabled={sending || uploading} aria-label="Send" className="h-12 w-12 shrink-0 rounded-full [&_svg]:size-5"
              onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()}>
              {uploading ? <Loader2 className="animate-spin" /> : <Send className="translate-x-px" />}
            </Button>
          ) : (
            <VoiceMessageRecorder
              onVoiceMessageSent={sendVoiceNote}
              onRecorded={(file, secs) => void sendVoice(file, secs)}
              disabled={sending}
              onActiveChange={setRecording}
              buttonClassName="h-12 w-12 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground [&_svg]:size-6"
            />
          )}
        </div>
      </form>
      {/* In the keyboard's place, exactly as tall, so the chat doesn't jump when you switch. */}
      {panel && (
        <div role="dialog" data-state="open" aria-label={panel === "emoji" ? "Emoji, GIFs and stickers" : "Attach"}
          className="chat-keyboard-panel flex-shrink-0 overflow-hidden border-t border-border bg-background pb-[env(safe-area-inset-bottom)]" style={{ height: keyboard.height }}>
          {panel === "emoji" ? (
            <GifPicker
              panel
              onDone={() => setPanel(null)}
              onSelect={(pick) => { if (pick.startsWith("http")) setMedia({ url: pick, type: "image" }); else setText((t) => t + pick); }}
              onSticker={(id) => void post(stickerMessage(id), null)}
              onGiphySticker={(url) => void post(GIPHY_STICKER, url)}
            />
          ) : (
            <AttachPanel
              currentUserId={currentUserId}
              locating={locating}
              onPhotos={(files) => { setPanel(null); setPickedPhotos(files); }}
              onVideo={(file) => void sendVideo(file)}
              onLocation={sendLocation}
              onContact={(p) => { setPanel(null); void post(`👤 ${p.full_name || "A friend"} on Ember\n${publicUrl(`/profile/${p.id}`)}`, null); }}
              onDocument={v2 ? (f) => void sendDocument(f) : undefined}
              onPoll={v2 ? () => { setPanel(null); setPollOpen(true); } : undefined}
              onEvent={v2 ? () => { setPanel(null); setEventOpen(true); } : undefined}
            />
          )}
        </div>
      )}
      {pickedPhotos && (
        <MediaSendSheet files={pickedPhotos} toName={group.name} onCancel={() => setPickedPhotos(null)} onSend={(files, caption) => void sendPhotos(files, caption)} />
      )}
      <PollComposer open={pollOpen} onOpenChange={setPollOpen} onSend={(poll) => void sendOne({ content: `📊 Poll: ${poll.question}`, extra: { poll } }).then((ok) => { if (ok) { playSound("send"); haptic(); } })} />
      <EventComposer open={eventOpen} onOpenChange={setEventOpen} onSend={(event) => void sendOne({ content: `📅 ${event.title}`, extra: { event } }).then((ok) => { if (ok) { playSound("send"); haptic(); } })} />
      <DeleteMessageDialog
        message={askDelete as unknown as ChatMessage | null}
        mine={!!askDelete && askDelete.user_id === currentUserId && !askDelete.id.startsWith("temp-")}
        onClose={() => setAskDelete(null)}
        onForEveryone={() => { if (askDelete) void deleteMessage(askDelete); }}
        onForMe={() => { if (askDelete) void deleteForMe(askDelete); }}
      />
      <WallpaperDialog open={wallpaperOpen} onOpenChange={setWallpaperOpen} userId={currentUserId} chatKey={`g:${group.id}`} chatName={group.name} />
      <GroupReadInfo message={infoFor} members={members} readTimes={readTimes} currentUserId={currentUserId} onClose={() => setInfoFor(null)} />

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
          onWallpaper={() => { setShowInfo(false); setWallpaperOpen(true); }}
        />
      )}

      <ForwardDialog message={forwardingMany ?? forwarding} currentUserId={currentUserId} onOpenChange={(open) => { if (!open) { setForwarding(null); setForwardingMany(null); } }} />
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
