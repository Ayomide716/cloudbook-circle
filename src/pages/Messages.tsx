import { useEffect, useState, useRef, useCallback, useMemo, ReactElement } from "react";
import { isRepeatSend } from "@/hooks/use-single-flight";
import { features } from "@/lib/features";
import { playSound } from "@/lib/sounds";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import { useCalls } from "@/hooks/use-calls";
import Navigation from "@/components/Navigation";

import NewConversation from "@/components/NewConversation";
import OnlineStatusIndicator from "@/components/OnlineStatusIndicator";
import VoiceMessageRecorder from "@/components/VoiceMessageRecorder";
import GifPicker from "@/components/GifPicker";
import ChatBubble from "@/components/ChatBubble";
import type { ChatMessage } from "@/components/ChatBubble";
import ChatSettingsModal from "@/components/ChatSettingsModal";
import MessageSearch from "@/components/MessageSearch";
import AIChatCompanion from "@/components/AIChatCompanion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Send, ArrowLeft, Video, Phone, Search, Settings, X, Bot, Sparkles, MoreVertical, MoreHorizontal, Archive, Image as ImageIcon, Star, Timer, MessageSquarePlus, Smile, Keyboard, Paperclip, Camera, Check, Copy, CornerUpLeft, Forward, Trash2, Lock, LockOpen, ImagePlus } from "@/components/icons";
import { ActionMenu, ActionMenuContent, ActionMenuItem, ActionMenuTrigger } from "@/components/ui/action-menu";
import VirtualizedChatList from "@/components/VirtualizedChatList";
import ConversationRow from "@/components/ConversationRow";
import { useChatPrefs } from "@/lib/chat-prefs";
import { useChatDrafts, useDraft } from "@/lib/chat-drafts";
import { useStarred } from "@/lib/starred";
import ForwardDialog from "@/components/chat/ForwardDialog";
import ChatMediaPanel, { type GalleryItem, type GalleryScope, type GalleryTab } from "@/components/chat/ChatMediaPanel";
import { groupActivity, useGroupChats, type GroupChatSummary } from "@/lib/group-chats";
import GroupConversation from "@/components/groups/GroupConversation";
import { GroupChatRow, GroupInviteCards } from "@/components/groups/GroupListItems";
import NewGroupChatDialog from "@/components/groups/NewGroupChatDialog";
import MessagesSkeleton from "@/components/skeletons/MessagesSkeleton";
import { format, isThisWeek, isToday, isYesterday } from "date-fns";
import { cn, friendlyError } from "@/lib/utils";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { explainError } from "@/lib/blocking";
import { haptic } from "@/lib/haptics";
import { enterMakesNewLine, sendOnEnter, useAutoGrow } from "@/lib/enter-key";
import { dbChannel } from "@/lib/realtime";
import { useResync } from "@/hooks/use-resync";
import EnablePushBanner from "@/components/EnablePushBanner";
import { GIPHY_STICKER, stickerMessage } from "@/lib/stickers";
import { VIEW_ONCE } from "@/lib/view-once";
import { THEME_WASH, useSharedTheme } from "@/lib/chat-themes";
import { isGiphyMedia } from "@/lib/giphy";
import EmptyState from "@/components/EmptyState";
import ActiveNow from "@/components/chat/ActiveNow";
import { useOnlineFriends } from "@/hooks/use-online-friends";
import { useInboxTyping } from "@/hooks/use-inbox-typing";
import TypingBubble from "@/components/chat/TypingBubble";
import AttachPanel from "@/components/chat/AttachPanel";
import MediaSendSheet from "@/components/chat/MediaSendSheet";
import { useKeyboard } from "@/lib/keyboard-height";
import { uploadMedia } from "@/lib/media-upload";
import { shrinkImage } from "@/lib/image-compress";
import { shrinkVideo } from "@/lib/video-compress";
import { imageSize, limiter, settleSent, withMediaSize } from "@/lib/chat-media";
import { groupAlbums, lastOf } from "@/lib/chat-albums";
import ChatAlbum from "@/components/chat/ChatAlbum";
import WallpaperDialog, { WallpaperLayer } from "@/components/chat/ChatWallpaper";
import { useWallpaper } from "@/lib/chat-wallpaper";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { previewText } from "@/lib/stickers";
import type { ChatEvent, ChatFile, ChatPoll, ChatQuote } from "@/lib/chat-extras";
import { takePrivateReply } from "@/lib/private-reply";
import { unlockChats, unlockWithPassword } from "@/lib/chat-lock";
import { EventComposer, PollComposer } from "@/components/chat/ChatComposers";
import { DeleteMessageDialog, MessageInfoDialog, PinnedBar } from "@/components/chat/MessageDialogs";
import { publicUrl } from "@/lib/native/platform";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Conversation {
  profile: Profile;
  lastMessage?: ChatMessage;
  unreadCount: number;
}

/** The label between days in a chat, as WhatsApp shows it: Today, Yesterday, Monday, 12 March 2026. */
const dayLabel = (d: Date) => {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d)) return format(d, "EEEE");
  return format(d, "d MMMM yyyy");
};

/** Compact timestamp for the conversation list: 13:38, Yesterday, Mon, 12 Mar. */
const shortTime = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d)) return format(d, "EEE");
  return format(d, "d MMM");
};

interface TypingPresence {
  userId: string;
  userName: string;
  isTyping: boolean;
  /** Recording a voice note ("recording audio…", as on WhatsApp). */
  isRecording?: boolean;
}

interface TypingUser {
  id: string;
  name: string;
  recording?: boolean;
}

const Messages = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  useSEO({ title: "Messages", description: "Chat with your friends on Ember." });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Search the chat list by name, and the new-message picker opened from anywhere on the page.
  const [chatQuery, setChatQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const onlineFriends = useOnlineFriends(currentUserId);
  // "typing…" under a name in the chat list.
  const inboxTyping = useInboxTyping(currentUserId);
  const onlineIds = useMemo(() => new Set(onlineFriends.map((f) => f.id)), [onlineFriends]);
  const [currentUserName, setCurrentUserName] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const { prefs: chatPrefs, toggle: toggleChatPref } = useChatPrefs(currentUserId);
  const [showArchived, setShowArchived] = useState(false);
  // Groups are chats too (as on WhatsApp), with their invites at the top of the list.
  const { groups: groupChats, invites: allInvites, reload: reloadGroups, markSeen: markGroupSeen } = useGroupChats(currentUserId);
  // Invites to group chats are answered here; community invites on the Groups tab.
  const groupInvites = allInvites.filter((i) => i.group.is_chat === true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const selectedGroup = groupChats.find((g) => g.group.id === selectedGroupId)?.group ?? null;
  const [chatFilter, setChatFilter] = useState<"all" | "unread" | "groups">("all");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const openPerson = (profile: Profile) => { setSelectedGroupId(null); setShowAIChat(false); setSelectedConversation(profile); };
  const openGroup = (groupId: string) => { setSelectedConversation(null); setShowAIChat(false); setSelectedGroupId(groupId); };
  // Pinned chats first (then newest first, as loaded); archived ones in their own list.
  // Locked chats live in their own list, opened with the phone's fingerprint or PIN.
  const [showLocked, setShowLocked] = useState(false);
  const [lockPrompt, setLockPrompt] = useState(false);
  const isLocked = (id: string) => chatPrefs.locked.includes(id);
  const listedConversations = useMemo(() => {
    const inView = conversations.filter((c) => (showLocked ? chatPrefs.locked.includes(c.profile.id) : !chatPrefs.locked.includes(c.profile.id) && chatPrefs.archived.includes(c.profile.id) === showArchived));
    return [...inView].sort((a, b) => Number(chatPrefs.pinned.includes(b.profile.id)) - Number(chatPrefs.pinned.includes(a.profile.id)));
  }, [conversations, chatPrefs, showArchived, showLocked]);
  const archivedCount = conversations.filter((c) => chatPrefs.archived.includes(c.profile.id)).length + groupChats.filter((g) => chatPrefs.archived.includes(g.group.id)).length;
  // People and groups together, newest first (pinned people stay on top).
  type ChatRowItem = { kind: "dm"; conv: Conversation } | { kind: "group"; chat: GroupChatSummary };
  const unreadChats = conversations.filter((c) => c.unreadCount > 0 && !chatPrefs.archived.includes(c.profile.id)).length + groupChats.filter((g) => g.unread > 0 && !chatPrefs.archived.includes(g.group.id)).length;
  const chatRows: ChatRowItem[] = (() => {
    const q = chatQuery.trim().toLowerCase();
    const matches = (name: string | null | undefined) => !q || (name ?? "").toLowerCase().includes(q);
    const groupsInView = groupChats.filter((g) => (showLocked ? chatPrefs.locked.includes(g.group.id) : !chatPrefs.locked.includes(g.group.id) && chatPrefs.archived.includes(g.group.id) === showArchived));
    const people = showArchived || showLocked ? listedConversations : chatFilter === "groups" ? [] : listedConversations.filter((c) => chatFilter !== "unread" || c.unreadCount > 0);
    const groups = showArchived || showLocked ? groupsInView : groupsInView.filter((g) => chatFilter !== "unread" || g.unread > 0);
    const time = (row: ChatRowItem) => (row.kind === "group" ? groupActivity(row.chat) : row.conv.lastMessage?.created_at ?? "");
    const pinned = (row: ChatRowItem) => chatPrefs.pinned.includes(row.kind === "group" ? row.chat.group.id : row.conv.profile.id);
    return [
      ...people.filter((c) => matches(c.profile.full_name)).map((conv) => ({ kind: "dm" as const, conv })),
      ...groups.filter((g) => matches(g.group.name)).map((chat) => ({ kind: "group" as const, chat })),
    ]
      .sort((a, b) => Number(pinned(b)) - Number(pinned(a)) || time(b).localeCompare(time(a)));
  })();
  const [selectedConversation, setSelectedConversation] = useState<Profile | null>(null);
  const [showAIChat, setShowAIChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageContent, setMessageContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending] = useState(false);
  const [unread, setUnread] = useState<{ id: string; count: number } | null>(null);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  // While a voice note is being recorded/previewed, the recorder takes the whole composer row.
  const [voiceActive, setVoiceActive] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [viewOnce, setViewOnce] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  
  // New Messenger features
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  // What you were typing in each chat stays there when you leave it.
  const drafts = useChatDrafts(currentUserId);
  useDraft(currentUserId, selectedConversation?.id, messageContent, setMessageContent, !!editingMessage);
  // Starring, forwarding, and the media / starred messages panel.
  const { isStarred, toggle: toggleStar, version: starVersion } = useStarred(currentUserId);
  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  const [forwardingMany, setForwardingMany] = useState<ChatMessage[] | null>(null);
  const [gallery, setGallery] = useState<{ scope: GalleryScope; tab: GalleryTab } | null>(null);
  // A message to show once its chat has opened (from Starred messages).
  const [pendingJump, setPendingJump] = useState<{ chatId: string; messageId: string } | null>(null);
  const [groupFocus, setGroupFocus] = useState<string | null>(null);
  const [ownTheme, setChatTheme] = useState("default");
  // The theme both of you see (once either of you has picked one), else your own choice.
  const sharedTheme = useSharedTheme(currentUserId, selectedConversation?.id);
  const chatTheme = sharedTheme ?? ownTheme;
  const [disappearingMinutes, setDisappearingMinutes] = useState<number | null>(null);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // The last message sent, so a double tap on Send doesn't send it twice.
  const lastSendRef = useRef<{ text: string; at: number } | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { startCall } = useCalls();
  const callPeer = selectedConversation
    ? { id: selectedConversation.id, name: selectedConversation.full_name || "Anonymous", avatar: selectedConversation.avatar_url }
    : null;

  // Scroll to highlighted message
  useEffect(() => {
    if (highlightedMessageId) {
      const el = document.getElementById(`msg-${highlightedMessageId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedMessageId]);

  const checkAuth = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    setCurrentUserId(session.user.id);
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", session.user.id).single();
    if (profile?.full_name) setCurrentUserName(profile.full_name);
    // Online status is now handled globally in Navigation
  });

  useEffect(() => {
    checkAuth();
  }, [navigate, checkAuth]);

  const loadChatPrefs = useEffectEvent(async (otherUserId: string) => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from("chat_preferences")
      .select("*")
      .eq("user_id", currentUserId)
      .eq("other_user_id", otherUserId)
      .maybeSingle();
    if (data) {
      setChatTheme(data.theme);
      setDisappearingMinutes(data.disappearing_minutes);
    } else {
      setChatTheme("default");
      setDisappearingMinutes(null);
    }
  });

  const loadConversations = useCallback(async () => {
    if (!currentUserId) return;
    const { data: messagesData } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
      .order("created_at", { ascending: false });

    const conversationMap = new Map<string, Conversation>();
    for (const message of messagesData || []) {
      const otherUserId = message.sender_id === currentUserId ? message.receiver_id : message.sender_id;
      if (!conversationMap.has(otherUserId)) {
        const { data: profileData } = await supabase.from("profiles").select("*").eq("id", otherUserId).single();
        if (profileData) {
          const self = otherUserId === currentUserId;
          const unreadCount = self ? 0 : (messagesData || []).filter(
            (m) => m.sender_id === otherUserId && m.receiver_id === currentUserId && !m.read
          ).length;
          // Your chat with yourself (notes to self), as on WhatsApp.
          const profile = self ? { ...profileData, full_name: `${profileData.full_name || "You"} (You)` } : profileData;
          conversationMap.set(otherUserId, { profile, lastMessage: message as ChatMessage, unreadCount });
        }
      }
    }
    setConversations(Array.from(conversationMap.values()));
    setIsLoading(false);
  }, [currentUserId]);

  const PAGE_SIZE = 50;
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadMessages = useEffectEvent(async (otherUserId: string, before?: string) => {
    if (!currentUserId) return;
    let query = supabase
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data } = await query;
    const fetched = ((data || []) as ChatMessage[]).reverse();

    if (before) {
      // Prepend older messages
      setMessages((prev) => [...fetched, ...prev]);
    } else {
      // Messages that came while you were away: a line above the first, and the chat opens there.
      const unreadOnes = fetched.filter((m) => m.sender_id === otherUserId && !m.read);
      setUnread(unreadOnes.length ? { id: unreadOnes[0].id, count: unreadOnes.length } : null);
      setMessages(fetched);
    }

    setHasMoreMessages((data || []).length >= PAGE_SIZE);

    // Mark as read
    if (!before) {
      await supabase.from("messages").update({ read: true }).eq("sender_id", otherUserId).eq("receiver_id", currentUserId).eq("read", false);
      loadConversations();
    }
  });

  const loadOlderMessages = useCallback(async () => {
    if (!selectedConversation || isLoadingMore || !hasMoreMessages || messages.length === 0) return;
    setIsLoadingMore(true);
    await loadMessages(selectedConversation.id, messages[0].created_at);
    setIsLoadingMore(false);
  }, [selectedConversation, isLoadingMore, hasMoreMessages, messages, loadMessages]);

  const selectedConversationRef = useRef<Profile | null>(null);
  selectedConversationRef.current = selectedConversation;

  const setupRealtimeSubscription = useCallback(() => {
    if (!currentUserId) return null;
    const channel = dbChannel("messages-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const selected = selectedConversationRef.current;
        if (payload.eventType === "UPDATE") {
          const updated = payload.new as ChatMessage;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
          // Ticks in the chat list (delivered / read) follow too.
          loadConversations();
          return;
        }
        if (payload.eventType === "INSERT") {
          const newMessage = payload.new as ChatMessage;
          if (selected && currentUserId) {
            if (
              (newMessage.sender_id === currentUserId && newMessage.receiver_id === selected.id) ||
              (newMessage.sender_id === selected.id && newMessage.receiver_id === currentUserId)
            ) {
              // Your own message coming back takes its placeholder's place (only that one: others
              // may still be sending).
              setMessages((prev) => settleSent(prev, newMessage));
              // Read only if you're actually looking; otherwise it's marked read when you come back.
              if (newMessage.sender_id === selected.id && document.visibilityState === "visible") {
                // Query builders are lazy: without then() the update was never sent,
                // so the sender never saw the "read" ticks for messages read in an open chat.
                supabase.from("messages").update({ read: true }).eq("id", newMessage.id).then(() => loadConversations());
              }
            }
          }
          // Debounce conversation list reload
          loadConversations();
        }
      })
      .subscribe();
    return channel;
  }, [currentUserId, loadConversations]);

  // Catch up after being away (phones drop the live connection in the background), and every
  // little while with a chat open in case the live connection quietly stopped: new messages,
  // and the latest ticks on what you sent.
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const catchUp = useCallback(async () => {
    if (!currentUserId) return;
    loadConversations();
    const selected = selectedConversationRef.current;
    if (!selected) return;
    const between = `and(sender_id.eq.${currentUserId},receiver_id.eq.${selected.id}),and(sender_id.eq.${selected.id},receiver_id.eq.${currentUserId})`;
    const saved = messagesRef.current.filter((m) => !m.id.startsWith("temp-"));
    const last = saved[saved.length - 1];
    let newer = supabase.from("messages").select("*").or(between).order("created_at", { ascending: true }).limit(200);
    if (last) newer = newer.gt("created_at", last.created_at);
    const recentIds = saved.slice(-40).map((m) => m.id);
    const [{ data: fresh }, { data: recent }] = await Promise.all([
      newer,
      recentIds.length ? supabase.from("messages").select("*").in("id", recentIds) : Promise.resolve({ data: [] as ChatMessage[] }),
    ]);
    if (selectedConversationRef.current?.id !== selected.id) return;
    const updates = new Map((recent ?? []).map((m) => [m.id, m as ChatMessage]));
    setMessages((prev) => {
      const merged = prev.map((m) => { const u = updates.get(m.id); return u ? { ...m, ...u } : m; });
      const have = new Set(merged.map((m) => m.id));
      const added = ((fresh ?? []) as ChatMessage[]).filter((m) => !have.has(m.id));
      if (!added.length) return merged;
      // A message we just sent arrives here too: it takes its placeholder's place.
      return added.reduce((list, m) => settleSent(list, m), merged);
    });
    // You're looking at the chat: whatever they sent is read now.
    const unread = [...(fresh ?? []), ...messagesRef.current].some((m) => m.sender_id === selected.id && !m.read);
    if (unread) {
      await supabase.from("messages").update({ read: true }).eq("sender_id", selected.id).eq("receiver_id", currentUserId).eq("read", false);
    }
  }, [currentUserId, loadConversations]);
  useResync(() => void catchUp(), selectedConversation ? 15000 : undefined, !!currentUserId);

  useEffect(() => {
    if (currentUserId) {
      loadConversations();
      const channel = setupRealtimeSubscription();
      return () => { if (channel) supabase.removeChannel(channel); };
    }
  }, [currentUserId, loadConversations, setupRealtimeSubscription]);

  // Open a specific chat from links like /messages?user=<id> (contacts, profiles, online friends).
  const [searchParams, setSearchParams] = useSearchParams();
  const targetUserId = searchParams.get("user");
  const openRequestedChat = useEffectEvent(async (userId: string) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    if (profile) openPerson(profile);
    // Drop the param so closing the chat or going back doesn't reopen it.
    setSearchParams({}, { replace: true });
  });

  useEffect(() => {
    if (currentUserId && targetUserId && targetUserId !== currentUserId) openRequestedChat(targetUserId);
  }, [currentUserId, targetUserId, openRequestedChat]);

  // /messages?group=<id> opens that group's chat (from group pages and notifications).
  const targetGroupId = searchParams.get("group");
  useEffect(() => {
    if (!targetGroupId || !groupChats.some((g) => g.group.id === targetGroupId)) return;
    openGroup(targetGroupId);
    setSearchParams({}, { replace: true });
  }, [targetGroupId, groupChats, setSearchParams]);

  const setupTypingChannel = useEffectEvent(() => {
    if (!selectedConversation || !currentUserId) return;
    const roomId = [currentUserId, selectedConversation.id].sort().join("-");
    typingChannelRef.current = supabase
      .channel(`typing-${roomId}`)
      .on("presence", { event: "sync" }, () => {
        const state = typingChannelRef.current?.presenceState() || {};
        const typingList: TypingUser[] = [];
        Object.values(state).forEach((presences) => {
          (presences as unknown as TypingPresence[]).forEach((p) => {
            if (p.userId !== currentUserId && (p.isTyping || p.isRecording)) typingList.push({ id: p.userId, name: p.userName, recording: !!p.isRecording });
          });
        });
        setTypingUsers(typingList);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await typingChannelRef.current?.track({ userId: currentUserId, userName: currentUserName, isTyping: false });
        }
      });
  });

  const shownChatRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedConversation && currentUserId) {
      // Another chat: start empty, so it opens at its own place (not the last chat's).
      if (shownChatRef.current !== selectedConversation.id) { shownChatRef.current = selectedConversation.id; setMessages([]); setUnread(null); }
      loadMessages(selectedConversation.id);
      loadChatPrefs(selectedConversation.id);
      setupTypingChannel();
    }
    return () => {
      if (typingChannelRef.current) supabase.removeChannel(typingChannelRef.current);
    };
  }, [selectedConversation, currentUserId, loadChatPrefs, loadMessages, setupTypingChannel]);

  // Announce typing only when it starts and stops. Tracking on every keystroke hit the realtime
  // presence rate limit, which closed the channel and broke the indicator for the rest of the session.
  const isTypingRef = useRef(false);
  const handleTyping = useCallback(() => {
    if (!typingChannelRef.current || !currentUserId) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      typingChannelRef.current.track({ userId: currentUserId, userName: currentUserName, isTyping: true });
      if (selectedConversation) inboxTyping.announce(selectedConversation.id, true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      typingChannelRef.current?.track({ userId: currentUserId, userName: currentUserName, isTyping: false });
      if (selectedConversation) inboxTyping.announce(selectedConversation.id, false);
    }, 2500);
  }, [currentUserId, currentUserName, selectedConversation, inboxTyping]);

  // The message box grows with what you type (Enter adds lines on phones), up to about 6 lines.
  const messageBoxRef = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(messageBoxRef, messageContent, 150);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageContent(e.target.value);
    handleTyping();
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!messageContent.trim() && !imageUrl) || !selectedConversation || !currentUserId) return;

    // Edit mode
    if (editingMessage) {
      await supabase.from("messages").update({ content: messageContent.trim(), edited: true }).eq("id", editingMessage.id);
      setMessages((prev) => prev.map((m) => (m.id === editingMessage.id ? { ...m, content: messageContent.trim(), edited: true } : m)));
      setEditingMessage(null);
      setMessageContent("");
      return;
    }

    // A view-once photo: the message carries no picture; it's kept apart and opened once.
    const once = features.viewOnce && viewOnce && !!imageUrl && mediaType === "image";
    const content = once ? VIEW_ONCE : messageContent.trim() || (imageUrl ? "Sent an image" : "");
    const sendKey = `${selectedConversation.id}|${content}|${imageUrl ?? ""}`;
    if (isRepeatSend(lastSendRef.current, sendKey)) return;
    lastSendRef.current = { text: sendKey, at: Date.now() };
    const sentUrl = imageUrl;
    // A view-once photo goes on its own; any text typed stays in the box to send next.
    if (!once) setMessageContent("");
    setImageUrl(null);
    setViewOnce(false);
    const quote = quoting;
    setQuoting(null);
    if (await sendOne({ content, imageUrl: sentUrl, once, extra: quote ? { quote } : undefined })) { playSound("send"); haptic(); }
  };

  // ---- Sending: the message shows at once, then goes; a photo with its upload ring; one that
  // couldn't go stays with a red "!" to try again (as on WhatsApp). ----
  const retriesRef = useRef(new Map<string, () => void>());
  const patchMessage = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  type SendOpts = {
    content: string;
    imageUrl?: string | null;
    once?: boolean;
    /** Uploads the file and resolves with its address (with its size, lib/chat-media). */
    upload?: (onProgress: (percent: number) => void) => Promise<string>;
    /** Shown at once while it uploads. */
    preview?: string;
    video?: boolean;
    /** A document, poll, event or quote riding on the message (lib/chat-extras). */
    extra?: { poll?: ChatPoll; event?: ChatEvent; quote?: ChatQuote; file?: Omit<ChatFile, "url"> };
  };

  /** The message as it shows while it's on its way. */
  const placeholder = (to: string, opts: SendOpts, replyTo: string | null): ChatMessage => {
    const once = !!opts.once && features.viewOnce;
    return {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sender_id: currentUserId!, receiver_id: to, content: once ? VIEW_ONCE : opts.content,
      image_url: once ? null : opts.preview ?? opts.imageUrl ?? null, view_once: once || undefined,
      created_at: new Date().toISOString(), read: false, reply_to: replyTo,
      _status: "sending", _preview: opts.preview, _video: opts.video || undefined,
      _progress: opts.upload ? 0 : undefined,
      ...(opts.extra?.poll ? { poll: opts.extra.poll } : {}),
      ...(opts.extra?.event ? { event: opts.extra.event } : {}),
      ...(opts.extra?.quote ? { quote: opts.extra.quote } : {}),
      // A document shows at once, opening the file on this phone until it's up.
      ...(opts.extra?.file ? { file: { ...opts.extra.file, url: opts.preview ?? "" }, image_url: null } : {}),
    };
  };

  /** Uploads (if there's a file) and saves the message behind a placeholder. */
  const deliver = async (temp: ChatMessage, opts: SendOpts, url?: Promise<string | null>): Promise<boolean> => {
    const to = temp.receiver_id;
    const once = !!temp.view_once;
    retriesRef.current.set(temp.id, () => {
      patchMessage(temp.id, { _status: "sending", _progress: opts.upload ? 0 : undefined });
      void deliver(temp, opts).then((ok) => { if (ok) { playSound("send"); haptic(); } });
    });
    try {
      const address = url ? await url : opts.upload ? await opts.upload((p) => patchMessage(temp.id, { _progress: p })) : opts.imageUrl ?? null;
      const doc = opts.extra?.file;
      const insertObj: TablesInsert<"messages"> = { sender_id: temp.sender_id, receiver_id: to, content: temp.content, image_url: once || doc ? null : address, reply_to: temp.reply_to ?? null };
      if (doc && address) insertObj.file = { ...doc, url: address };
      if (opts.extra?.poll) insertObj.poll = { ...opts.extra.poll };
      if (opts.extra?.event) insertObj.event = { ...opts.extra.event };
      if (opts.extra?.quote) insertObj.quote = { ...opts.extra.quote };
      if (once) insertObj.view_once = true;
      if (disappearingMinutes) insertObj.expires_at = new Date(Date.now() + disappearingMinutes * 60000).toISOString();
      const { data, error } = await supabase.from("messages").insert(insertObj).select().single();
      if (error) throw error;
      if (once && address) {
        const { error: mediaError } = await supabase.from("view_once_media").insert({ message_id: data.id, url: address });
        if (mediaError) {
          // Without its photo the message is empty: take it back.
          await supabase.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", data.id);
          throw mediaError;
        }
      }
      retriesRef.current.delete(temp.id);
      setMessages((prev) => settleSent(prev, data as ChatMessage, temp.id));
      return true;
    } catch (error) {
      patchMessage(temp.id, { _status: "failed", _progress: undefined });
      toast({ title: "Couldn't send", description: error instanceof Error && error.message.startsWith("Couldn't upload") ? error.message : await explainError(error as { message: string; code?: string }, to), variant: "destructive" });
      return false;
    }
  };

  /**
   * Sends one message: from the text box, a photo from the picker (with its caption, or view
   * once), your location, or a friend's profile card.
   */
  const sendOne = async (opts: SendOpts) => {
    if (!selectedConversation || !currentUserId) return false;
    const replyTo = replyingTo?.id || null;
    setReplyingTo(null);
    const temp = placeholder(selectedConversation.id, opts, replyTo);
    setMessages((prev) => [...prev, temp]);
    return deliver(temp, opts);
  };

  /** A photo or video from the phone: made smaller, uploaded, its address with its size. */
  const uploadChatFile = async (file: File, kind: "image" | "video", onProgress: (percent: number) => void) => {
    const upload = kind === "image" ? await shrinkImage(file) : await shrinkVideo(file);
    const ext = upload.name.split(".").pop();
    const size = kind === "image" ? await imageSize(upload) : null;
    const url = await uploadMedia("chat-images", `${currentUserId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`, upload, onProgress);
    return size ? withMediaSize(url, size.w, size.h) : url;
  };

  // Photos from the picker: all show at once (an album when there are 4 or more, as on
  // WhatsApp), upload side by side, and are saved in order. The caption goes on the first.
  const sendPhotos = async (files: File[], caption: string, once: boolean) => {
    setPickedPhotos(null);
    if (!selectedConversation || !currentUserId) return;
    const replyTo = replyingTo?.id || null;
    setReplyingTo(null);
    const jobs = files.map((file, i) => {
      const preview = URL.createObjectURL(file);
      const opts: SendOpts = {
        content: i === 0 && caption ? caption : "Sent an image",
        once: once && files.length === 1,
        preview,
        upload: (onProgress) => uploadChatFile(file, "image", onProgress),
      };
      return { opts, temp: placeholder(selectedConversation.id, opts, i === 0 ? replyTo : null) };
    });
    setMessages((prev) => [...prev, ...jobs.map((j) => j.temp)]);
    // Up to three uploads at a time; each message is saved once it and those before it are up.
    const limit = limiter(3);
    const urls = jobs.map((j) => limit(() => j.opts.upload!((p) => patchMessage(j.temp.id, { _progress: p }))));
    urls.forEach((u) => u.catch(() => {})); // each one's failure is handled where it's awaited
    let sent = 0;
    for (const [i, j] of jobs.entries()) if (await deliver(j.temp, j.opts, urls[i])) sent++;
    if (sent) { playSound("send"); haptic(); }
  };

  const sendVideo = async (file: File) => {
    closePanel();
    if (file.size > 200 * 1024 * 1024) { toast({ title: "That video is too big", description: "Up to 200 MB.", variant: "destructive" }); return; }
    if (await sendOne({ content: "Sent a video", video: true, preview: URL.createObjectURL(file), upload: (onProgress) => uploadChatFile(file, "video", onProgress) })) { playSound("send"); haptic(); }
  };

  const [locating, setLocating] = useState(false);
  const sendLocation = () => {
    if (!navigator.geolocation) { toast({ title: "Location isn't available on this device", variant: "destructive" }); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocating(false);
        closePanel();
        const { latitude, longitude } = pos.coords;
        if (await sendOne({ content: `📍 My location\nhttps://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}` })) { playSound("send"); haptic(); }
      },
      () => {
        setLocating(false);
        toast({ title: "Couldn't get your location", description: "Allow Ember to use your location in your phone's settings, then try again.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const sendContact = async (person: { id: string; full_name: string | null }) => {
    closePanel();
    if (await sendOne({ content: `👤 ${person.full_name || "A friend"} on Ember\n${publicUrl(`/profile/${person.id}`)}` })) { playSound("send"); haptic(); }
  };

  // ---- The panel in the keyboard's place: emoji/GIFs/stickers, or attach (as on WhatsApp) ----
  const [panel, setPanel] = useState<null | "emoji" | "attach">(null);
  const [pickedPhotos, setPickedPhotos] = useState<File[] | null>(null);
  const keyboard = useKeyboard();
  const closingToKeyboard = useRef(false);
  const closePanel = useCallback(() => setPanel(null), []);
  // Switching from a panel to typing: the keyboard comes up, then the panel goes (no jump).
  const showKeyboard = () => {
    closingToKeyboard.current = true;
    messageBoxRef.current?.focus();
    // No on-screen keyboard (a computer): just close the panel.
    window.setTimeout(() => { if (closingToKeyboard.current) { closingToKeyboard.current = false; setPanel(null); } }, matchMedia("(pointer: coarse)").matches ? 600 : 0);
  };
  const togglePanel = (which: "emoji" | "attach") => {
    if (panel === which) { showKeyboard(); return; }
    closingToKeyboard.current = false;
    messageBoxRef.current?.blur();
    setPanel(which);
    haptic(8);
  };
  useEffect(() => {
    if (keyboard.open && panel) { closingToKeyboard.current = false; setPanel(null); }
  }, [keyboard.open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Changing chats, or Android's back button / Escape, closes it.
  useEffect(() => { setPanel(null); setPickedPhotos(null); }, [selectedConversation?.id]);
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPanel(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel]);

  const retrySend = useCallback((message: ChatMessage) => { haptic(8); retriesRef.current.get(message.id)?.(); }, []);

  const handleUnsend = async (messageId: string) => {
    // One that never went (couldn't send): it's only on this phone.
    if (messageId.startsWith("temp-")) { retriesRef.current.delete(messageId); setMessages((prev) => prev.filter((m) => m.id !== messageId)); return; }
    await supabase.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", messageId);
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deleted_at: new Date().toISOString() } : m)));
  };

  const handleEdit = (message: ChatMessage) => {
    setEditingMessage(message);
    setMessageContent(message.content);
    setReplyingTo(null);
  };

  const handleReply = (message: ChatMessage) => {
    setReplyingTo(message);
    setEditingMessage(null);
    // Straight to typing, as after a swipe on WhatsApp.
    requestAnimationFrame(() => messageBoxRef.current?.focus());
  };

  const handleToggleStar = useCallback(async (message: ChatMessage) => {
    haptic(8);
    const error = await toggleStar(message.id, "dm");
    if (error) toast({ title: "Couldn't star the message", description: error, variant: "destructive" });
  }, [toggleStar, toast]);

  /** Scrolls to a message in the open chat, loading back to it if it's older than what's shown. */
  const jumpToMessage = async (messageId: string) => {
    if (!messages.some((m) => m.id === messageId) && selectedConversation && currentUserId) {
      const { data: target } = await supabase.from("messages").select("created_at").eq("id", messageId).maybeSingle();
      if (!target?.created_at) return toast({ title: "That message is no longer here" });
      const other = selectedConversation.id;
      const { data } = await supabase
        .from("messages")
        .select("*")
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${other}),and(sender_id.eq.${other},receiver_id.eq.${currentUserId})`)
        .gte("created_at", target.created_at)
        .order("created_at", { ascending: true })
        .limit(1000);
      setMessages((data ?? []) as ChatMessage[]);
      setHasMoreMessages(true);
    }
    setHighlightedMessageId(messageId);
    window.setTimeout(() => setHighlightedMessageId((h) => (h === messageId ? null : h)), 2500);
  };

  // Opened a chat from Starred messages: go to the message once the chat has loaded.
  useEffect(() => {
    if (!pendingJump || selectedConversation?.id !== pendingJump.chatId) return;
    if (!messages.some((m) => m.sender_id === pendingJump.chatId || m.receiver_id === pendingJump.chatId)) return;
    setPendingJump(null);
    void jumpToMessage(pendingJump.messageId);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the chat's messages arrive
  }, [messages, pendingJump, selectedConversation?.id]);

  /** From Starred messages: open the message's chat at that message. */
  const openStarred = async (item: GalleryItem) => {
    setGallery(null);
    if (item.chatKind === "group") {
      setGroupFocus(item.id);
      openGroup(item.chatId);
      return;
    }
    if (selectedConversation?.id === item.chatId) return void jumpToMessage(item.id);
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", item.chatId).maybeSingle();
    if (!profile) return;
    setPendingJump({ chatId: item.chatId, messageId: item.id });
    openPerson(profile as Profile);
  };

  // A sticker goes out on its own as soon as it's picked, as on WhatsApp.
  // `id` is one of Ember's 3D stickers; or pass GIPHY_STICKER with the GIPHY sticker's address.
  const sendSticker = async (content: string, imageUrl: string | null = null) => {
    if (!selectedConversation || !currentUserId) return;
    const tempId = `temp-sticker-${Date.now()}`;
    const replyTo = replyingTo?.id || null;
    setReplyingTo(null);
    setMessages((prev) => [...prev, { id: tempId, sender_id: currentUserId, receiver_id: selectedConversation.id, content, image_url: imageUrl, created_at: new Date().toISOString(), read: false, reply_to: replyTo }]);
    const insertObj: TablesInsert<"messages"> = { sender_id: currentUserId, receiver_id: selectedConversation.id, content, image_url: imageUrl, reply_to: replyTo };
    if (disappearingMinutes) insertObj.expires_at = new Date(Date.now() + disappearingMinutes * 60000).toISOString();
    const { data, error } = await supabase.from("messages").insert(insertObj).select().single();
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast({ title: "Couldn't send the sticker", description: await explainError(error, selectedConversation.id), variant: "destructive" });
      return;
    }
    playSound("send");
    haptic();
    if (data) setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as ChatMessage) : m)));
  };

  const handleVoiceMessageSent = async (audioUrl: string, duration: number) => {
    if (!selectedConversation || !currentUserId) return;
    const content = `🎤 Voice message (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")})`;
    const tempId = `temp-voice-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, sender_id: currentUserId, receiver_id: selectedConversation.id, content, image_url: audioUrl, created_at: new Date().toISOString(), read: false }]);
    const { data, error } = await supabase.from("messages").insert({ sender_id: currentUserId, receiver_id: selectedConversation.id, content, image_url: audioUrl }).select().single();
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast({ title: "Couldn't send voice message", description: await explainError(error, selectedConversation.id), variant: "destructive" });
      return;
    }
    playSound("send");
    haptic();
    if (data) setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as ChatMessage) : m)));
  };

  /** A voice note: shows at once (playable), uploads, then sends, as a photo does. */
  const sendVoiceNote = async (file: File, duration: number) => {
    const content = `🎤 Voice message (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")})`;
    const preview = URL.createObjectURL(file);
    if (await sendOne({ content, preview, upload: (onProgress) => uploadMedia("voice-messages", file.name, file, onProgress) })) { playSound("send"); haptic(); }
  };

  /** Tells the other person you're recording a voice note. */
  const announceRecording = (on: boolean) => {
    if (!typingChannelRef.current || !currentUserId) return;
    void typingChannelRef.current.track({ userId: currentUserId, userName: currentUserName, isTyping: false, isRecording: on });
  };

  // ---- Part 2 (after the database update, features.messaging2) ----
  const [quoting, setQuoting] = useState<ChatQuote | null>(null);
  // Your own photo behind this chat (or all chats), as on WhatsApp.
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const dmWallpaper = useWallpaper(currentUserId, selectedConversation?.id ?? "all");
  const [pollOpen, setPollOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [deleting, setDeleting] = useState<ChatMessage | null>(null);
  const [infoFor, setInfoFor] = useState<ChatMessage | null>(null);
  const [pins, setPins] = useState<string[]>([]);
  const [pinIndex, setPinIndex] = useState(0);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  // Read receipts: off on either side, no blue ticks for either (as on WhatsApp).
  const [receipts, setReceipts] = useState({ mine: true, theirs: true });
  const isSelfChat = !!selectedConversation && selectedConversation.id === currentUserId;
  const pair = selectedConversation && currentUserId ? [currentUserId, selectedConversation.id].sort() : null;

  const loadPins = useEffectEvent(async () => {
    if (!features.messaging2 || !pair) { setPins([]); return; }
    const { data } = await supabase.from("chat_pins").select("message_id, pinned_at").eq("user_a", pair[0]).eq("user_b", pair[1]).order("pinned_at", { ascending: false });
    setPins((data ?? []).map((p) => p.message_id));
    setPinIndex(0);
  });
  useEffect(() => {
    void loadPins();
    if (!features.messaging2 || !pair) return;
    const channel = dbChannel(`chat-pins-${pair.join("-")}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_pins", filter: `user_a=eq.${pair[0]}` }, () => void loadPins())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the pair is the chat
  }, [pair?.join("-"), loadPins]);

  useEffect(() => {
    if (!features.messaging2 || !currentUserId) return;
    void supabase.from("hidden_messages").select("message_id").eq("user_id", currentUserId).order("created_at", { ascending: false }).limit(2000)
      .then(({ data }) => setHiddenIds(new Set((data ?? []).map((h) => h.message_id))));
  }, [currentUserId]);

  useEffect(() => {
    if (!features.messaging2 || !selectedConversation || !currentUserId) { setReceipts({ mine: true, theirs: true }); return; }
    void supabase.from("profiles").select("id, read_receipts").in("id", [currentUserId, selectedConversation.id]).then(({ data }) => {
      const of = (id: string) => data?.find((p) => p.id === id)?.read_receipts !== false;
      setReceipts({ mine: of(currentUserId), theirs: of(selectedConversation.id) });
    });
  }, [selectedConversation, currentUserId]);
  const showRead = receipts.mine && receipts.theirs;

  // "Reply privately" from a group chat (GroupConversation) opens here with the quote ready.
  useEffect(() => {
    if (!selectedConversation?.id) return;
    const q = takePrivateReply(selectedConversation.id);
    setQuoting(q);
    if (q) requestAnimationFrame(() => messageBoxRef.current?.focus());
  }, [selectedConversation?.id]);

  const togglePin = useCallback(async (message: ChatMessage) => {
    if (!pair || !currentUserId) return;
    haptic(8);
    if (pins.includes(message.id)) {
      setPins((p) => p.filter((id) => id !== message.id));
      await supabase.from("chat_pins").delete().eq("message_id", message.id);
      return;
    }
    if (pins.length >= 3) { toast({ title: "You can pin up to 3 messages", description: "Unpin one first." }); return; }
    setPins((p) => [message.id, ...p]);
    setPinIndex(0);
    const { error } = await supabase.from("chat_pins").insert({ message_id: message.id, user_a: pair[0], user_b: pair[1], pinned_by: currentUserId });
    if (error) { setPins((p) => p.filter((id) => id !== message.id)); toast({ title: "Couldn't pin the message", description: friendlyError(error), variant: "destructive" }); }
  }, [pair, pins, currentUserId, toast]);

  const deleteForMe = async (message: ChatMessage) => {
    if (!currentUserId) return;
    if (message.id.startsWith("temp-")) return void handleUnsend(message.id);
    setHiddenIds((prev) => new Set(prev).add(message.id));
    const { error } = await supabase.from("hidden_messages").insert({ user_id: currentUserId, message_id: message.id });
    if (error) { setHiddenIds((prev) => { const n = new Set(prev); n.delete(message.id); return n; }); toast({ title: "Couldn't delete it", description: friendlyError(error), variant: "destructive" }); }
  };
  const askDelete = useCallback((message: ChatMessage) => setDeleting(message), []);
  const showInfo = useCallback((message: ChatMessage) => setInfoFor(message), []);

  const sendDocument = async (file: File) => {
    closePanel();
    if (file.size > 100 * 1024 * 1024) { toast({ title: "That file is too big", description: "Up to 100 MB.", variant: "destructive" }); return; }
    const meta = { name: file.name.slice(0, 200), size: file.size, type: file.type || "application/octet-stream" };
    const ok = await sendOne({
      content: `📄 ${meta.name}`,
      preview: URL.createObjectURL(file),
      upload: (onProgress) => uploadMedia("chat-files", file.name, file, onProgress),
      extra: { file: meta },
    });
    if (ok) { playSound("send"); haptic(); }
  };
  const sendPoll = async (poll: ChatPoll) => { if (await sendOne({ content: `📊 Poll: ${poll.question}`, extra: { poll } })) { playSound("send"); haptic(); } };
  const sendEvent = async (event: ChatEvent) => { if (await sendOne({ content: `📅 ${event.title}`, extra: { event } })) { playSound("send"); haptic(); } };

  /** Opens your chat with yourself. */
  const messageYourself = async () => {
    if (!currentUserId) return;
    const { data } = await supabase.from("profiles").select("id, full_name, avatar_url").eq("id", currentUserId).maybeSingle();
    if (data) openPerson({ ...data, full_name: `${data.full_name || "You"} (You)` });
  };

  // Locked chats: the phone's fingerprint or PIN (or your password on the website).
  const [lockPassword, setLockPassword] = useState("");
  const [lockError, setLockError] = useState("");
  const openLocked = async () => {
    const r = await unlockChats();
    if (r.ok) { setShowLocked(true); setShowArchived(false); return; }
    if ("needsPassword" in r) { setLockError(""); setLockPassword(""); setLockPrompt(true); return; }
    toast({ title: r.message, variant: "destructive" });
  };
  const toggleLock = async (id: string) => {
    // Unlocking (or locking on the website) needs the same check as opening them.
    if (isLocked(id) && !showLocked) return;
    toggleChatPref("locked", id);
    haptic(8);
    toast({ title: isLocked(id) ? "Chat unlocked" : "Chat locked", description: isLocked(id) ? undefined : "Find it in Locked chats at the top of your chats." });
    if (!isLocked(id) && selectedConversation?.id === id && !showLocked) setSelectedConversation(null);
  };

  const getReplyMessage = useCallback((replyToId: string | null | undefined) => {
    if (!replyToId) return null;
    return messages.find((m) => m.id === replyToId) || null;
  }, [messages]);

  // Filter out expired disappearing messages
  const visibleMessages = useMemo(() => messages.filter((m) => !hiddenIds.has(m.id) && !(m.expires_at && new Date(m.expires_at) < new Date())), [messages, hiddenIds]);

  // Rows: messages, with 4+ photos sent together as one album (as on WhatsApp).
  const msgRows = useMemo(() => groupAlbums(visibleMessages), [visibleMessages]);
  const unreadRow = unread ? msgRows.findIndex((r) => (r.album ?? [r.message]).some((m) => m.id === unread.id)) : -1;

  // ---- Select messages (press and hold → Select, then tap more), as on WhatsApp ----
  const [selection, setSelection] = useState<string[] | null>(null);
  useEffect(() => { setSelection(null); }, [selectedConversation?.id]);
  const toggleSelected = useCallback((ids: string[]) => {
    haptic(8);
    setSelection((prev) => {
      const now = prev ?? [];
      const on = ids.every((id) => now.includes(id));
      const next = on ? now.filter((id) => !ids.includes(id)) : [...now, ...ids.filter((id) => !now.includes(id))];
      return next.length ? next : null;
    });
  }, []);
  const startSelect = useCallback((message: ChatMessage) => toggleSelected([message.id]), [toggleSelected]);
  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelection(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selection]);
  const selectedMessages = selection ? visibleMessages.filter((m) => selection.includes(m.id)) : [];

  const renderMessage = useCallback((index: number): ReactElement | null => {
    const row = msgRows[index];
    if (!row) return null;
    const message = row.message;
    const ids = (row.album ?? [message]).map((m) => m.id);
    const isCurrentUser = message.sender_id === currentUserId;
    const isLastOwnMessage = isCurrentUser && !msgRows.slice(index + 1).some((r) => r.message.sender_id === currentUserId);
    const isLastMessage = index === msgRows.length - 1;
    // A new run starts when the sender changes: more space above it, and a tail on its bubble.
    const day = new Date(message.created_at);
    const prev = index > 0 ? lastOf(msgRows[index - 1]) : null;
    const newDay = !prev || new Date(prev.created_at).toDateString() !== day.toDateString();
    const isFirstInGroup = newDay || prev!.sender_id !== message.sender_id;
    const picked = !!selection && ids.every((id) => selection.includes(id));
    const sendable = !message.id.startsWith("temp-");

    return (
      <>
      {newDay && (
        <div className="flex justify-center pt-3 pb-1">
          <span className="rounded-lg bg-card/90 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur dark:bg-[#1c2530]/90">
            {dayLabel(day)}
          </span>
        </div>
      )}
      {index === unreadRow && unread && (
        <div className="-mx-4 my-2 bg-card/80 py-1 text-center text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur sm:-mx-5 dark:bg-[#1c2530]/80" role="separator">
          {unread.count} unread {unread.count === 1 ? "message" : "messages"}
        </div>
      )}
      <div
        id={`msg-${message.id}`}
        className={cn(
          "relative transition-all duration-300",
          isFirstInGroup ? "pt-2" : "pt-0.5",
          highlightedMessageId === message.id && "bg-primary/10 rounded-xl -mx-2 px-2 py-1",
          picked && "before:absolute before:-inset-x-5 before:inset-y-0 before:bg-primary/15",
          selection && "pl-9"
        )}
        // While selecting, a tap picks or drops the message instead of opening anything.
        onClickCapture={selection ? (e) => { e.preventDefault(); e.stopPropagation(); if (sendable) toggleSelected(ids); } : undefined}
        onPointerDownCapture={selection ? (e) => e.stopPropagation() : undefined}
      >
        {selection && (
          <span aria-hidden="true" className={cn(
            "absolute left-0 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border-2 transition-colors",
            picked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50 bg-background/60"
          )}>
            {picked && <Check className="h-4 w-4" strokeWidth={3} />}
          </span>
        )}
        {row.album ? (
          <ChatAlbum
            photos={row.album}
            isCurrentUser={isCurrentUser}
            isFirstInGroup={isFirstInGroup}
            theme={chatTheme}
            onReply={handleReply}
            onUnsend={handleUnsend}
            onRetry={retrySend}
          />
        ) : (
        <ChatBubble
          message={message}
          isCurrentUser={isCurrentUser}
          isLastOwnMessage={isLastOwnMessage}
          isLastMessage={isLastMessage}
          currentUserId={currentUserId!}
          replyMessage={getReplyMessage(message.reply_to)}
          onReply={handleReply}
          onEdit={handleEdit}
          onUnsend={handleUnsend}
          theme={chatTheme}
          isFirstInGroup={isFirstInGroup}
          otherName={selectedConversation?.full_name}
          starred={isStarred(message.id)}
          onToggleStar={handleToggleStar}
          onForward={setForwarding}
          onRetry={retrySend}
          onSelect={startSelect}
          onDelete={features.messaging2 ? askDelete : undefined}
          onPin={features.messaging2 && !isSelfChat ? togglePin : undefined}
          pinned={pins.includes(message.id)}
          onInfo={features.messaging2 && !isSelfChat ? showInfo : undefined}
          showRead={showRead}
        />
        )}
      </div>
      </>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- starVersion stands for the starred list
  }, [msgRows, unreadRow, unread, selection, currentUserId, highlightedMessageId, chatTheme, getReplyMessage, selectedConversation?.full_name, starVersion, handleToggleStar, retrySend, startSelect, toggleSelected, askDelete, togglePin, pins, showInfo, showRead, isSelfChat]);

  const rowDayLabel = useCallback((index: number) => {
    const row = msgRows[index];
    return row ? dayLabel(new Date(row.message.created_at)) : null;
  }, [msgRows]);

  /** Copies the picked messages as WhatsApp does: "[12:04] Tolu: text", one per line. */
  const copySelected = () => {
    const text = selectedMessages
      .filter((m) => m.content && !m.content.startsWith("🎤") && m.content !== "Sent an image")
      .map((m) => (selectedMessages.length === 1 ? m.content : `[${format(new Date(m.created_at), "HH:mm")}] ${m.sender_id === currentUserId ? "You" : selectedConversation?.full_name || "Them"}: ${m.content}`))
      .join("\n");
    void navigator.clipboard?.writeText(text);
    toast({ title: selectedMessages.length === 1 ? "Message copied" : `${selectedMessages.length} messages copied` });
    setSelection(null);
  };

  if (isLoading) return <MessagesSkeleton />;

  return (
    // Starts under the app's header (drawn once for all pages) and ends above the keyboard.
    // Phones have no app header here: the chat list starts under the status bar.
    <div className={cn(
      "content-fade fixed inset-x-0 top-[calc(var(--nav-height)+env(safe-area-inset-top,0px))] max-md:top-[env(safe-area-inset-top,0px)] bottom-[var(--keyboard-inset,0px)] flex flex-col bg-background",
      // Phones: an open chat takes the whole screen, as in WhatsApp.
      (selectedConversation || showAIChat || selectedGroup) && "max-md:top-0"
    )}>
      <Navigation currentUserId={currentUserId || undefined} hideMobileTopBar={!!(selectedConversation || showAIChat || selectedGroup)} />
      <div className="flex-1 flex overflow-hidden">
        <div className="container mx-auto px-0 sm:px-4 py-0 sm:py-4 flex-1 flex overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)] gap-0 sm:gap-4 flex-1 overflow-hidden">
            {/* Conversations List */}
            <Card className={cn("relative min-w-0 flex flex-col overflow-hidden max-md:border-0 max-md:!bg-transparent max-md:!bg-none max-md:!shadow-none", (selectedConversation || showAIChat || selectedGroup) ? "hidden md:flex" : "flex")}>
              <div className="px-3 pt-3 pb-2.5 sm:p-4 md:border-b flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 -ml-1 [&_svg]:size-5" onClick={() => navigate("/")} aria-label="Back">
                    <ArrowLeft />
                  </Button>
                  <h2 className="flex-1 font-display text-[22px] sm:text-xl font-bold tracking-tight">Messages</h2>
                  {/* Less-used places live in ⋯, as on WhatsApp, so the header stays clear. */}
                  <ActionMenu>
                    <ActionMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full [&_svg]:size-5" aria-label="More options">
                        <MoreHorizontal />
                      </Button>
                    </ActionMenuTrigger>
                    <ActionMenuContent align="end" title="Messages">
                      <ActionMenuItem onSelect={() => setGallery({ scope: { kind: "starred" }, tab: "starred" })}>
                        <Star className="mr-2 h-4 w-4" /> Starred messages
                      </ActionMenuItem>
                      <ActionMenuItem onSelect={() => setShowArchived((v) => !v)}>
                        <Archive className="mr-2 h-4 w-4" /> {showArchived ? "Back to chats" : "Archived chats"}
                      </ActionMenuItem>
                    </ActionMenuContent>
                  </ActionMenu>
                  <NewConversation currentUserId={currentUserId!} onSelectUser={openPerson} onNewGroup={() => setShowNewGroup(true)} onMessageYourself={features.messaging2 ? () => void messageYourself() : undefined} open={composeOpen} onOpenChange={setComposeOpen} />
                </div>
                {!showArchived && (
                  <label className="mt-2.5 flex h-10 items-center gap-2 rounded-full bg-secondary px-3.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
                    <Search className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    <input
                      type="search"
                      value={chatQuery}
                      onChange={(e) => setChatQuery(e.target.value)}
                      placeholder="Search chats"
                      aria-label="Search chats"
                      className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
                    />
                    {chatQuery && (
                      <button type="button" onClick={() => setChatQuery("")} aria-label="Clear search" className="-mr-1 flex h-7 w-7 items-center justify-center rounded-full hover:bg-accent">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </label>
                )}
              </div>
              <div className="flex-1 overflow-y-auto max-md:px-3 max-md:pb-24">
                {/* AI Companion Entry */}
                {features.cloudBuddy && (
                <div
                  className={cn(
                    "flex items-center gap-3 p-3 sm:p-4 cursor-pointer transition-all duration-200 active:scale-[0.98] border-b",
                    showAIChat ? "bg-accent" : "hover:bg-accent/50"
                  )}
                  onClick={() => { setShowAIChat(true); setSelectedConversation(null); setSelectedGroupId(null); }}
                >
                  <Avatar className="h-12 w-12 flex-shrink-0 gradient-brand">
                    <AvatarFallback className="bg-secondary text-foreground">
                      <Bot className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold">CloudBuddy</p>
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground truncate">AI companion • Ask me anything!</p>
                  </div>
                  <div className="h-3 w-3 rounded-full bg-green-500 flex-shrink-0" />
                </div>
                )}
                {/* All · Unread · Groups, as on WhatsApp */}
                {!showArchived && (
                  <div role="group" aria-label="Show" className="mb-3 flex gap-2 overflow-x-auto scrollbar-hide">
                    {([
                      { value: "all", label: "All" },
                      { value: "unread", label: "Unread", count: unreadChats },
                      { value: "groups", label: "Groups", count: groupChats.length },
                    ] as const).map((chip) => (
                      <button
                        key={chip.value}
                        type="button"
                        aria-pressed={chatFilter === chip.value}
                        onClick={() => setChatFilter(chip.value)}
                        className={cn(
                          "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold transition-colors",
                          chatFilter === chip.value
                            ? "bg-foreground text-background"
                            : "bg-secondary text-foreground hover:bg-secondary/80"
                        )}
                      >
                        {chip.label}
                        {"count" in chip && chip.count > 0 && <span className="text-muted-foreground">{chip.count}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {!showArchived && !chatQuery && <ActiveNow people={onlineFriends} onOpen={openPerson} />}
                {!showArchived && <EnablePushBanner />}
                {!showArchived && groupInvites.length > 0 && (
                  <GroupInviteCards
                    invites={groupInvites}
                    onAnswered={(groupId, accepted) => { void reloadGroups(); if (accepted) openGroup(groupId); }}
                  />
                )}
                {showLocked ? (
                  <button type="button" onClick={() => setShowLocked(false)} className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-primary">
                    <ArrowLeft className="h-4 w-4" /> Locked chats
                  </button>
                ) : !showArchived && chatPrefs.locked.length > 0 && chatFilter === "all" && (
                  <button
                    type="button"
                    onClick={() => void openLocked()}
                    className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-accent/50"
                  >
                    <Lock className="h-5 w-5 text-muted-foreground" />
                    <span className="flex-1">Locked chats</span>
                    <span className="text-xs text-muted-foreground">{chatPrefs.locked.length}</span>
                  </button>
                )}
                {showLocked ? null : showArchived ? (
                  <button type="button" onClick={() => setShowArchived(false)} className="mb-2 flex items-center gap-2 px-1 text-sm font-semibold text-primary">
                    <ArrowLeft className="h-4 w-4" /> Archived chats
                  </button>
                ) : archivedCount > 0 && chatFilter === "all" && (
                  <button
                    type="button"
                    onClick={() => setShowArchived(true)}
                    className="mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-accent/50"
                  >
                    <Archive className="h-5 w-5 text-muted-foreground" />
                    <span className="flex-1">Archived</span>
                    <span className="text-xs text-muted-foreground">{archivedCount}</span>
                  </button>
                )}
                {chatRows.length === 0 ? (
                  <EmptyState
                    emoji={chatQuery ? "search" : "chat"}
                    title={chatQuery ? `No chats match "${chatQuery.trim()}"` : showArchived ? "No archived chats" : chatFilter === "unread" ? "No unread chats" : chatFilter === "groups" ? "No group chats yet" : "No conversations yet"}
                    text={chatQuery || showArchived || chatFilter === "unread" ? undefined : "Say hello to a friend. Your chats will show up here."}
                    action={!chatQuery && !showArchived && chatFilter !== "unread" ? (
                      <Button onClick={() => setComposeOpen(true)} className="rounded-full px-5">Start a chat</Button>
                    ) : undefined}
                  />
                ) : (
                  <div className="flat-list divide-y">
                    {chatRows.map((row) =>
                      row.kind === "group" ? (
                        <GroupChatRow
                          key={`g-${row.chat.group.id}`}
                          chat={row.chat}
                          currentUserId={currentUserId!}
                          selected={selectedGroupId === row.chat.group.id}
                          time={shortTime(groupActivity(row.chat))}
                          onOpen={() => openGroup(row.chat.group.id)}
                          pinned={chatPrefs.pinned.includes(row.chat.group.id)}
                          muted={chatPrefs.muted.includes(row.chat.group.id)}
                          archived={chatPrefs.archived.includes(row.chat.group.id)}
                          onToggle={(list) => toggleChatPref(list, row.chat.group.id)}
                          draft={selectedGroupId === row.chat.group.id ? undefined : drafts[`g:${row.chat.group.id}`]}
                        />
                      ) : (
                        <ConversationRow
                          key={row.conv.profile.id}
                          profile={row.conv.profile}
                          lastMessage={row.conv.lastMessage}
                          unreadCount={row.conv.unreadCount}
                          currentUserId={currentUserId!}
                          selected={selectedConversation?.id === row.conv.profile.id}
                          pinned={chatPrefs.pinned.includes(row.conv.profile.id)}
                          muted={chatPrefs.muted.includes(row.conv.profile.id)}
                          archived={chatPrefs.archived.includes(row.conv.profile.id)}
                          time={row.conv.lastMessage ? shortTime(row.conv.lastMessage.created_at) : undefined}
                          online={onlineIds.has(row.conv.profile.id)}
                          typing={inboxTyping.isTyping(row.conv.profile.id)}
                          onOpen={() => openPerson(row.conv.profile)}
                          onToggle={(list) => toggleChatPref(list, row.conv.profile.id)}
                          onMarkRead={async () => {
                            await supabase.from("messages").update({ read: true }).eq("sender_id", row.conv.profile.id).eq("receiver_id", currentUserId!).eq("read", false);
                            loadConversations();
                          }}
                          draft={selectedConversation?.id === row.conv.profile.id ? undefined : drafts[row.conv.profile.id]}
                        />
                      )
                    )}
                  </div>
                )}
              </div>
              {/* New message within thumb reach on phones, as on WhatsApp. */}
              {!showArchived && (
                <Button
                  onClick={() => setComposeOpen(true)}
                  size="icon"
                  aria-label="New message"
                  className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] right-4 h-14 w-14 rounded-2xl shadow-lg md:hidden [&_svg]:size-6"
                >
                  <MessageSquarePlus />
                </Button>
              )}
            </Card>

            {/* Chat Area — AI or regular conversation */}
            <Card className={cn("relative isolate min-w-0 flex flex-col overflow-hidden max-md:border-0 max-md:!bg-transparent max-md:!bg-none max-md:!shadow-none", (!selectedConversation && !showAIChat && !selectedGroup) ? "hidden md:flex" : "flex", selectedConversation && !selectedGroup && dmWallpaper && "photo-wallpaper")}>
              {features.cloudBuddy && showAIChat ? (
                <AIChatCompanion onBack={() => { setShowAIChat(false); }} />
              ) : selectedGroup && currentUserId ? (
                <GroupConversation
                  key={selectedGroup.id}
                  group={selectedGroup}
                  currentUserId={currentUserId}
                  onBack={() => setSelectedGroupId(null)}
                  onSeen={() => markGroupSeen(selectedGroup.id)}
                  onLeft={() => { setSelectedGroupId(null); void reloadGroups(); }}
                  muted={chatPrefs.muted.includes(selectedGroup.id)}
                  onToggleMute={() => toggleChatPref("muted", selectedGroup.id)}
                  onGroupUpdated={() => void reloadGroups()}
                  focusMessageId={groupFocus}
                />
              ) : selectedConversation ? (
                <>
                  <WallpaperLayer wallpaper={dmWallpaper} />
                  {/* Picking messages: what you can do with them, in the header's place (as on WhatsApp). */}
                  {selection ? (
                    <div className="border-b p-2.5 sm:p-4 max-md:pt-[max(0.625rem,env(safe-area-inset-top))] flex items-center gap-1 flex-shrink-0 bg-card" role="toolbar" aria-label="Selected messages">
                      <Button variant="ghost" size="icon" className="h-10 w-10 -ml-1 [&_svg]:size-6" aria-label="Cancel selecting" onClick={() => setSelection(null)}>
                        <X />
                      </Button>
                      <p className="flex-1 text-lg font-semibold tabular-nums" aria-live="polite">{selection.length}</p>
                      {selectedMessages.length === 1 && (
                        <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-[22px]" aria-label="Reply" onClick={() => { handleReply(selectedMessages[0]); setSelection(null); }}>
                          <CornerUpLeft />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-[22px]" aria-label="Star" onClick={() => { const anyOff = selectedMessages.some((m) => !isStarred(m.id)); selectedMessages.filter((m) => isStarred(m.id) !== anyOff).forEach((m) => void handleToggleStar(m)); setSelection(null); }}>
                        <Star />
                      </Button>
                      {selectedMessages.some((m) => m.content && !m.content.startsWith("🎤") && m.content !== "Sent an image") && (
                        <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-[22px]" aria-label="Copy" onClick={copySelected}>
                          <Copy />
                        </Button>
                      )}
                      {selectedMessages.length > 0 && !selectedMessages.some((m) => m.view_once) && (
                        <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-[22px]" aria-label="Forward" onClick={() => { setForwardingMany(selectedMessages); setSelection(null); }}>
                          <Forward />
                        </Button>
                      )}
                      {selectedMessages.length > 0 && selectedMessages.every((m) => m.sender_id === currentUserId) && (
                        <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive [&_svg]:size-[22px]" aria-label="Unsend" onClick={() => { selectedMessages.forEach((m) => void handleUnsend(m.id)); setSelection(null); haptic(); }}>
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  ) : (
                  <div className="border-b p-2.5 sm:p-4 max-md:pt-[max(0.625rem,env(safe-area-inset-top))] flex items-center gap-2 sm:gap-3 flex-shrink-0 bg-card">
                    <Button variant="ghost" size="icon" className="md:hidden h-10 w-10 -ml-1 touch-target [&_svg]:size-6" aria-label="Back to conversations" onClick={() => { setSelectedConversation(null); setReplyingTo(null); setEditingMessage(null); }}>
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={selectedConversation.avatar_url || undefined} />
                        <AvatarFallback>{selectedConversation.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                      </Avatar>
                      <div className="absolute bottom-0 right-0">
                        <OnlineStatusIndicator userId={selectedConversation.id} currentUserId={currentUserId || undefined} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{selectedConversation.full_name || "Anonymous"}</p>
                      {typingUsers.length > 0 ? (
                        <p className="text-xs font-medium text-primary">{typingUsers[0].recording ? "recording audio…" : "typing…"}</p>
                      ) : isSelfChat ? (
                        <p className="text-xs text-muted-foreground">Message yourself</p>
                      ) : (
                        <OnlineStatusIndicator userId={selectedConversation.id} showText currentUserId={currentUserId || undefined} />
                      )}
                    </div>

                    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                    {/* Search and settings sit in a menu on phones, so the name has room. */}
                    <Button variant="ghost" size="icon" className="hidden sm:inline-flex h-9 w-9 rounded-full hover:bg-accent" onClick={() => setShowMessageSearch(!showMessageSearch)} aria-label="Search messages">
                      <Search className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="hidden sm:inline-flex h-9 w-9 rounded-full hover:bg-accent" onClick={() => setShowChatSettings(true)} aria-label="Chat settings">
                      <Settings className="h-4 w-4" />
                    </Button>
                    {!isSelfChat && (
                      <>
                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-accent [&_svg]:size-6" onClick={() => callPeer && startCall(callPeer, false)} aria-label="Video call">
                          <Video />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-accent [&_svg]:size-[22px]" onClick={() => callPeer && startCall(callPeer, true)} aria-label="Voice call">
                          <Phone />
                        </Button>
                      </>
                    )}
                    <ActionMenu>
                      <ActionMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-accent [&_svg]:size-6 sm:[&_svg]:size-5" aria-label="More options">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </ActionMenuTrigger>
                      <ActionMenuContent align="end">
                        <ActionMenuItem onSelect={() => setGallery({ scope: { kind: "dm", otherId: selectedConversation.id }, tab: "media" })}>
                          <ImageIcon className="h-4 w-4 mr-2" /> Media, links and voice
                        </ActionMenuItem>
                        <ActionMenuItem onSelect={() => setGallery({ scope: { kind: "dm", otherId: selectedConversation.id }, tab: "starred" })}>
                          <Star className="h-4 w-4 mr-2" /> Starred messages
                        </ActionMenuItem>
                        <ActionMenuItem className="sm:hidden" onSelect={() => setShowMessageSearch((v) => !v)}>
                          <Search className="h-4 w-4 mr-2" /> Search messages
                        </ActionMenuItem>
                        <ActionMenuItem className="sm:hidden" onSelect={() => setShowChatSettings(true)}>
                          <Settings className="h-4 w-4 mr-2" /> Chat settings
                        </ActionMenuItem>
                        <ActionMenuItem onSelect={() => setWallpaperOpen(true)}>
                          <ImagePlus className="h-4 w-4 mr-2" /> Wallpaper
                        </ActionMenuItem>
                        {!isSelfChat && (!isLocked(selectedConversation.id) || showLocked) && (
                          <ActionMenuItem onSelect={() => void toggleLock(selectedConversation.id)}>
                            {isLocked(selectedConversation.id) ? <LockOpen className="h-4 w-4 mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
                            {isLocked(selectedConversation.id) ? "Unlock chat" : "Lock chat"}
                          </ActionMenuItem>
                        )}
                      </ActionMenuContent>
                    </ActionMenu>
                    </div>
                  </div>
                  )}

                  {/* Pinned messages (up to 3): tap to go to it, and on to the next. */}
                  {pins.length > 0 && !selection && (() => {
                    const id = pins[pinIndex % pins.length];
                    const m = messages.find((x) => x.id === id);
                    const preview = m ? (m.deleted_at ? "Deleted message" : m.content?.startsWith("🎤") ? "🎤 Voice message" : m.image_url && (!m.content || m.content === "Sent an image") ? "📷 Photo" : previewText(m.content) || "Message") : "Pinned message";
                    return (
                      <PinnedBar pins={pins} index={pinIndex % pins.length} preview={preview}
                        onOpen={() => { void jumpToMessage(id); setPinIndex((i) => (i + 1) % pins.length); }}
                        onUnpin={() => { const msg = messages.find((x) => x.id === id); if (msg) void togglePin(msg); else void supabase.from("chat_pins").delete().eq("message_id", id).then(() => setPins((p) => p.filter((x) => x !== id))); }} />
                    );
                  })()}

                  {/* Message search */}
                  {showMessageSearch && (
                    <MessageSearch
                      messages={messages}
                      onHighlight={setHighlightedMessageId}
                      onClose={() => setShowMessageSearch(false)}
                    />
                  )}

                  {/* Disappearing messages notice */}
                  {disappearingMinutes && (
                    <div className="text-center py-1.5 bg-accent/50 text-xs text-muted-foreground">
                      <Timer className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />Disappearing messages are on ({disappearingMinutes >= 1440 ? `${disappearingMinutes / 1440}d` : disappearingMinutes >= 60 ? `${disappearingMinutes / 60}h` : `${disappearingMinutes}m`})
                    </div>
                  )}

                  {/* Virtualized Messages */}
                  <VirtualizedChatList
                    key={selectedConversation.id}
                    itemCount={msgRows.length}
                    scrollToBottomKey={visibleMessages.length}
                    lastIsMine={visibleMessages[visibleMessages.length - 1]?.sender_id === currentUserId}
                    firstItemKey={msgRows[0]?.message.id}
                    scrollToIndex={highlightedMessageId ? msgRows.findIndex((r) => (r.album ?? [r.message]).some((m) => m.id === highlightedMessageId)) : undefined}
                    startAtIndex={unreadRow > 0 ? unreadRow : undefined}
                    dayLabelAt={rowDayLabel}
                    estimatedItemSize={80}
                    className={cn("flex-1 overflow-hidden chat-wallpaper transition-colors duration-300", THEME_WASH[chatTheme])}
                    renderItem={renderMessage}
                    onLoadMore={loadOlderMessages}
                    isLoadingMore={isLoadingMore}
                    hasMore={hasMoreMessages}
                    footer={
                      typingUsers.length > 0 && !typingUsers[0].recording ? (
                        <TypingBubble name={typingUsers[0].name} />
                      ) : null
                    }
                  />

                  {/* Message bar, as in WhatsApp: a pill with emoji, text, attach and camera, and a round
                      button beside it that records a voice note, or sends once there's something to send. */}
                  <form onSubmit={handleSendMessage} className={cn("chat-wallpaper transition-colors duration-300 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex-shrink-0", THEME_WASH[chatTheme])}>
                    {imageUrl && (
                      <div className="mb-2 ml-2 flex items-end gap-2">
                        <div className="relative inline-block">
                          {mediaType === "video" ? (
                            <video src={imageUrl} className="h-20 rounded-lg" />
                          ) : (
                            <img src={imageUrl} alt="Preview" className="h-20 rounded-lg" />
                          )}
                          <button type="button" onClick={() => { setImageUrl(null); setMediaType(null); setViewOnce(false); }} className="tap-target absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 text-xs" aria-label="Remove attachment">✕</button>
                        </div>
                        {/* View once, as on WhatsApp: they can open the photo one time. */}
                        {features.viewOnce && mediaType === "image" && !isGiphyMedia(imageUrl) && (
                          <button
                            type="button"
                            onClick={() => { setViewOnce((v) => !v); haptic(8); }}
                            aria-pressed={viewOnce}
                            className={cn(
                              "flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors",
                              viewOnce ? "bg-primary text-primary-foreground" : "bg-chat-surface text-foreground shadow-sm"
                            )}
                          >
                            <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold", viewOnce ? "border-current" : "border-dashed border-current")}>1</span>
                            {viewOnce ? "View once" : "View once off"}
                          </button>
                        )}
                      </div>
                    )}
                    {/* Replying privately to a group message. */}
                    {quoting && !voiceActive && (
                      <div className="mb-1 mr-[54px] flex items-start gap-2 rounded-2xl bg-chat-surface p-1.5 pl-2 shadow-sm animate-fade-in">
                        <div className="min-w-0 flex-1 rounded-lg border-l-4 border-primary bg-black/5 dark:bg-white/5 px-2 py-1">
                          <p className="text-xs font-semibold text-primary">{quoting.name}{quoting.group_name ? ` · ${quoting.group_name}` : ""}</p>
                          <p className="truncate text-[13px] text-muted-foreground">{quoting.text}</p>
                        </div>
                        <button type="button" aria-label="Cancel reply" className="mt-0.5 rounded-full p-1 text-muted-foreground hover:bg-accent" onClick={() => setQuoting(null)}>
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    {/* Replying to (or editing) a message: a quote above the box, as in WhatsApp. */}
                    {(replyingTo || editingMessage) && !voiceActive && (
                      <div className="mb-1 mr-[54px] flex items-start gap-2 rounded-2xl bg-chat-surface p-1.5 pl-2 shadow-sm animate-fade-in">
                        <div className="min-w-0 flex-1 rounded-lg border-l-4 border-primary bg-black/5 dark:bg-white/5 px-2 py-1">
                          <p className="text-xs font-semibold text-primary">
                            {editingMessage ? "Editing message" : replyingTo?.sender_id === currentUserId ? "You" : selectedConversation.full_name || "Them"}
                          </p>
                          <p className="truncate text-[13px] text-muted-foreground">
                            {(editingMessage ?? replyingTo)?.image_url && !(editingMessage ?? replyingTo)?.content ? "📷 Photo" : (editingMessage ?? replyingTo)?.content?.substring(0, 80)}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={editingMessage ? "Cancel editing" : "Cancel reply"}
                          className="mt-0.5 rounded-full p-1 text-muted-foreground hover:bg-accent"
                          onClick={() => { setReplyingTo(null); setEditingMessage(null); if (editingMessage) setMessageContent(""); }}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-end gap-1.5">
                      {!voiceActive && (
                        <div className="flex-1 min-w-0 flex items-end gap-0.5 rounded-3xl bg-chat-surface shadow-sm px-1 py-1 min-h-12 [&_button]:h-10 [&_button]:w-10 [&_button]:shrink-0 [&_button]:rounded-full [&_button_svg]:!h-[22px] [&_button_svg]:!w-[22px] [&_button_svg]:text-muted-foreground">
                          {/* 😊 opens emoji, GIFs and stickers in the keyboard's place; ⌨️ goes back to typing. */}
                          <button
                            type="button"
                            onClick={() => togglePanel("emoji")}
                            aria-label={panel === "emoji" ? "Show keyboard" : "Emoji, GIFs and stickers"}
                            aria-expanded={panel === "emoji"}
                            className="flex items-center justify-center hover:bg-accent"
                          >
                            {panel === "emoji" ? <Keyboard /> : <Smile />}
                          </button>
                          <textarea
                            ref={messageBoxRef}
                            rows={1}
                            placeholder={editingMessage ? "Edit message" : "Message"}
                            value={messageContent}
                            onChange={handleInputChange}
                            onKeyDown={sendOnEnter}
                            // Tapping the box while emoji or attach is showing: the keyboard takes its place.
                            onFocus={() => { if (panel) showKeyboard(); }}
                            enterKeyHint={enterMakesNewLine() ? "enter" : "send"}
                            className="flex-1 min-w-0 resize-none border-0 bg-transparent px-1 py-2 text-[16px] leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-50"
                            aria-label="Message"
                          />
                          {!editingMessage && (
                            <>
                              <button
                                type="button"
                                onClick={() => togglePanel("attach")}
                                aria-label={panel === "attach" ? "Show keyboard" : "Attach"}
                                aria-expanded={panel === "attach"}
                                className="flex items-center justify-center hover:bg-accent"
                              >
                                {isUploadingImage ? <Loader2 className="animate-spin" /> : panel === "attach" ? <Keyboard /> : <Paperclip className="-rotate-45" />}
                              </button>
                              {/* The camera, straight away, as on WhatsApp. */}
                              <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-accent [&_svg]:!h-[22px] [&_svg]:!w-[22px] [&_svg]:text-muted-foreground" aria-label="Take a photo">
                                <Camera />
                                <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) { closePanel(); setPickedPhotos(f); } }} />
                              </label>
                            </>
                          )}
                        </div>
                      )}
                      {messageContent.trim() || imageUrl ? (
                        <Button type="submit" size="icon" variant="accent" disabled={isSending} aria-label="Send" className="h-12 w-12 shrink-0 rounded-full [&_svg]:size-5"
                          // Sending keeps the keyboard up, as on WhatsApp: the tap mustn't take focus from the box.
                          onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()}>
                          {isSending ? <Loader2 className="animate-spin" /> : <Send className="translate-x-px" />}
                        </Button>
                      ) : (
                        <VoiceMessageRecorder
                          onVoiceMessageSent={handleVoiceMessageSent}
                          onRecorded={sendVoiceNote}
                          disabled={isSending}
                          onActiveChange={(on) => { setVoiceActive(on); announceRecording(on); }}
                          buttonClassName="h-12 w-12 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground [&_svg]:size-6"
                        />
                      )}
                    </div>
                  </form>
                  {/* In the keyboard's place, exactly as tall, so the chat doesn't jump when you switch. */}
                  {panel && (
                    <div
                      role="dialog"
                      data-state="open"
                      aria-label={panel === "emoji" ? "Emoji, GIFs and stickers" : "Attach"}
                      className="chat-keyboard-panel flex-shrink-0 overflow-hidden border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
                      style={{ height: keyboard.height }}
                    >
                      {panel === "emoji" ? (
                        <GifPicker
                          panel
                          onDone={closePanel}
                          onSelect={(content) => {
                            if (content.startsWith("http")) { setImageUrl(content); setMediaType("image"); }
                            else setMessageContent((prev) => prev + content);
                          }}
                          onSticker={editingMessage ? undefined : (id) => void sendSticker(stickerMessage(id))}
                          onGiphySticker={editingMessage ? undefined : (url) => void sendSticker(GIPHY_STICKER, url)}
                        />
                      ) : (
                        <AttachPanel
                          currentUserId={currentUserId!}
                          locating={locating}
                          onPhotos={(files) => { closePanel(); setPickedPhotos(files); }}
                          onVideo={(file) => void sendVideo(file)}
                          onLocation={sendLocation}
                          onContact={(p) => void sendContact(p)}
                          onDocument={features.messaging2 ? (f) => void sendDocument(f) : undefined}
                          onPoll={features.messaging2 ? () => { closePanel(); setPollOpen(true); } : undefined}
                          onEvent={features.messaging2 ? () => { closePanel(); setEventOpen(true); } : undefined}
                        />
                      )}
                    </div>
                  )}
                  {pickedPhotos && (
                    <MediaSendSheet
                      files={pickedPhotos}
                      toName={selectedConversation.full_name || "them"}
                      onCancel={() => setPickedPhotos(null)}
                      onSend={(files, caption, once) => void sendPhotos(files, caption, once)}
                    />
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-2">
                    <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center mx-auto">
                      <Send className="h-7 w-7 text-foreground" />
                    </div>
                    <p className="font-semibold">Your Messages</p>
                    <p className="text-sm text-muted-foreground">Select a conversation to start messaging</p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      

      {/* Chat Settings Modal */}
      {currentUserId && (
        <NewGroupChatDialog
          open={showNewGroup}
          onOpenChange={setShowNewGroup}
          currentUserId={currentUserId}
          onCreated={async (groupId) => { await reloadGroups(); openGroup(groupId); }}
        />
      )}
      {selectedConversation && currentUserId && (
        <ChatSettingsModal
          open={showChatSettings}
          onClose={() => setShowChatSettings(false)}
          currentUserId={currentUserId}
          otherUserId={selectedConversation.id}
          onSettingsChanged={(theme, mins) => { setChatTheme(theme); setDisappearingMinutes(mins); }}
        />
      )}
      {currentUserId && selectedConversation && (
        <WallpaperDialog open={wallpaperOpen} onOpenChange={setWallpaperOpen} userId={currentUserId} chatKey={selectedConversation.id} chatName={selectedConversation.full_name ?? undefined} />
      )}
      <DeleteMessageDialog
        message={deleting}
        mine={!!deleting && deleting.sender_id === currentUserId && !deleting.deleted_at}
        onClose={() => setDeleting(null)}
        onForEveryone={() => { if (deleting) void handleUnsend(deleting.id); }}
        onForMe={() => { if (deleting) void deleteForMe(deleting); }}
      />
      <MessageInfoDialog message={infoFor ? messages.find((m) => m.id === infoFor.id) ?? infoFor : null} showRead={showRead} onClose={() => setInfoFor(null)} />
      <PollComposer open={pollOpen} onOpenChange={setPollOpen} onSend={(poll) => void sendPoll(poll)} />
      <EventComposer open={eventOpen} onOpenChange={setEventOpen} onSend={(event) => void sendEvent(event)} />
      <Dialog open={lockPrompt} onOpenChange={setLockPrompt}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Locked chats</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const r = await unlockWithPassword(lockPassword);
            if (r.ok) { setLockPrompt(false); setShowLocked(true); setShowArchived(false); } else setLockError(r.message ?? "");
          }}>
            <p className="text-sm text-muted-foreground">Enter your Ember password to see your locked chats. In the app, your fingerprint or phone PIN opens them.</p>
            <Input type="password" autoComplete="current-password" value={lockPassword} onChange={(e) => setLockPassword(e.target.value)} placeholder="Password" aria-label="Password" autoFocus />
            {lockError && <p role="alert" className="text-sm text-destructive">{lockError}</p>}
            <Button type="submit" className="w-full rounded-full" disabled={!lockPassword}>Unlock</Button>
          </form>
        </DialogContent>
      </Dialog>
      {currentUserId && (
        <ForwardDialog message={forwardingMany ?? forwarding} currentUserId={currentUserId} onOpenChange={(open) => { if (!open) { setForwarding(null); setForwardingMany(null); } }} />
      )}
      {gallery && currentUserId && (
        <ChatMediaPanel
          scope={gallery.scope}
          currentUserId={currentUserId}
          initialTab={gallery.tab}
          onClose={() => setGallery(null)}
          onJump={(item) => {
            if (gallery.scope.kind === "dm") { setGallery(null); void jumpToMessage(item.id); }
            else void openStarred(item);
          }}
        />
      )}

    </div>
  );
};

export default Messages;
