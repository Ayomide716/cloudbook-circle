import { useEffect, useState, useRef, useCallback, useMemo, ReactElement } from "react";
import { features } from "@/lib/features";
import { playSound } from "@/lib/sounds";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import { useCalls } from "@/hooks/use-calls";
import Navigation from "@/components/Navigation";

import NewConversation from "@/components/NewConversation";
import ChatImageUpload from "@/components/ChatImageUpload";
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
import { Loader2, Send, ArrowLeft, Video, Phone, Search, Settings, X, Bot, Sparkles, MoreVertical, Archive, Image as ImageIcon, Star, Timer } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { explainError } from "@/lib/blocking";
import { haptic } from "@/lib/haptics";
import { enterMakesNewLine, sendOnEnter, useAutoGrow } from "@/lib/enter-key";
import { dbChannel } from "@/lib/realtime";
import { useResync } from "@/hooks/use-resync";
import EnablePushBanner from "@/components/EnablePushBanner";
import { GIPHY_STICKER, stickerMessage } from "@/lib/stickers";
import EmptyState from "@/components/EmptyState";

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
}

interface TypingUser {
  id: string;
  name: string;
}

const Messages = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  useSEO({ title: "Messages", description: "Chat with your friends on Ember." });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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
  const listedConversations = useMemo(() => {
    const inView = conversations.filter((c) => chatPrefs.archived.includes(c.profile.id) === showArchived);
    return [...inView].sort((a, b) => Number(chatPrefs.pinned.includes(b.profile.id)) - Number(chatPrefs.pinned.includes(a.profile.id)));
  }, [conversations, chatPrefs, showArchived]);
  const archivedCount = conversations.filter((c) => chatPrefs.archived.includes(c.profile.id)).length + groupChats.filter((g) => chatPrefs.archived.includes(g.group.id)).length;
  // People and groups together, newest first (pinned people stay on top).
  type ChatRowItem = { kind: "dm"; conv: Conversation } | { kind: "group"; chat: GroupChatSummary };
  const unreadChats = conversations.filter((c) => c.unreadCount > 0 && !chatPrefs.archived.includes(c.profile.id)).length + groupChats.filter((g) => g.unread > 0 && !chatPrefs.archived.includes(g.group.id)).length;
  const chatRows: ChatRowItem[] = (() => {
    const groupsInView = groupChats.filter((g) => chatPrefs.archived.includes(g.group.id) === showArchived);
    const people = showArchived ? listedConversations : chatFilter === "groups" ? [] : listedConversations.filter((c) => chatFilter !== "unread" || c.unreadCount > 0);
    const groups = showArchived ? groupsInView : groupsInView.filter((g) => chatFilter !== "unread" || g.unread > 0);
    const time = (row: ChatRowItem) => (row.kind === "group" ? groupActivity(row.chat) : row.conv.lastMessage?.created_at ?? "");
    const pinned = (row: ChatRowItem) => chatPrefs.pinned.includes(row.kind === "group" ? row.chat.group.id : row.conv.profile.id);
    return [...people.map((conv) => ({ kind: "dm" as const, conv })), ...groups.map((chat) => ({ kind: "group" as const, chat }))]
      .sort((a, b) => Number(pinned(b)) - Number(pinned(a)) || time(b).localeCompare(time(a)));
  })();
  const [selectedConversation, setSelectedConversation] = useState<Profile | null>(null);
  const [showAIChat, setShowAIChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageContent, setMessageContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  // While a voice note is being recorded/previewed, the recorder takes the whole composer row.
  const [voiceActive, setVoiceActive] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
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
  const [gallery, setGallery] = useState<{ scope: GalleryScope; tab: GalleryTab } | null>(null);
  // A message to show once its chat has opened (from Starred messages).
  const [pendingJump, setPendingJump] = useState<{ chatId: string; messageId: string } | null>(null);
  const [groupFocus, setGroupFocus] = useState<string | null>(null);
  const [chatTheme, setChatTheme] = useState("default");
  const [disappearingMinutes, setDisappearingMinutes] = useState<number | null>(null);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
          const unreadCount = (messagesData || []).filter(
            (m) => m.sender_id === otherUserId && m.receiver_id === currentUserId && !m.read
          ).length;
          conversationMap.set(otherUserId, { profile: profileData, lastMessage: message as ChatMessage, unreadCount });
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
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
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
              setMessages((prev) => {
                // Your own message coming back replaces its placeholder (only that one: others
                // may still be sending).
                const withoutTemp = newMessage.sender_id === currentUserId
                  ? prev.filter((m) => !(m.id.startsWith("temp-") && m.content === newMessage.content))
                  : prev;
                if (withoutTemp.some((m) => m.id === newMessage.id)) return withoutTemp;
                return [...withoutTemp, newMessage];
              });
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
      const merged = prev.map((m) => updates.get(m.id) ?? m);
      const have = new Set(merged.map((m) => m.id));
      const added = ((fresh ?? []) as ChatMessage[]).filter((m) => !have.has(m.id));
      if (!added.length) return merged;
      // A message we just sent arrives here too: drop its placeholder.
      const sentNow = new Set(added.filter((m) => m.sender_id === currentUserId).map((m) => m.content));
      return [...merged.filter((m) => !(m.id.startsWith("temp-") && sentNow.has(m.content))), ...added];
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
    if (profile) {
      setShowAIChat(false);
      setSelectedConversation(profile);
    }
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
            if (p.userId !== currentUserId && p.isTyping) typingList.push({ id: p.userId, name: p.userName });
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

  useEffect(() => {
    if (selectedConversation && currentUserId) {
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
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      typingChannelRef.current?.track({ userId: currentUserId, userName: currentUserName, isTyping: false });
    }, 2500);
  }, [currentUserId, currentUserName]);

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

    const content = messageContent.trim() || (imageUrl ? "Sent an image" : "");
    const tempId = `temp-${Date.now()}`;

    const expiresAt = disappearingMinutes
      ? new Date(Date.now() + disappearingMinutes * 60000).toISOString()
      : null;

    const optimisticMessage: ChatMessage = {
      id: tempId,
      sender_id: currentUserId,
      receiver_id: selectedConversation.id,
      content,
      image_url: imageUrl,
      created_at: new Date().toISOString(),
      read: false,
      reply_to: replyingTo?.id || null,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setMessageContent("");
    setImageUrl(null);
    setReplyingTo(null);
    setIsSending(true);

    const insertObj: TablesInsert<"messages"> = {
      sender_id: currentUserId,
      receiver_id: selectedConversation.id,
      content,
      image_url: imageUrl,
      reply_to: replyingTo?.id || null,
    };
    if (expiresAt) insertObj.expires_at = expiresAt;

    const { data, error } = await supabase.from("messages").insert(insertObj).select().single();
    setIsSending(false);

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast({ title: "Couldn't send message", description: await explainError(error, selectedConversation.id), variant: "destructive" });
      return;
    }
    playSound("send");
    haptic();
    if (data) setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as ChatMessage) : m)));
  };

  const handleUnsend = async (messageId: string) => {
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

  const getReplyMessage = useCallback((replyToId: string | null | undefined) => {
    if (!replyToId) return null;
    return messages.find((m) => m.id === replyToId) || null;
  }, [messages]);

  // Filter out expired disappearing messages
  const visibleMessages = messages.filter((m) => {
    if (m.expires_at && new Date(m.expires_at) < new Date()) return false;
    return true;
  });

  const renderMessage = useCallback((index: number): ReactElement | null => {
    const message = visibleMessages[index];
    if (!message) return null;
    const isCurrentUser = message.sender_id === currentUserId;
    const isLastOwnMessage = isCurrentUser && !visibleMessages.slice(index + 1).some((m) => m.sender_id === currentUserId);
    const isLastMessage = index === visibleMessages.length - 1;
    // A new run starts when the sender changes: more space above it, and a tail on its bubble.
    const day = new Date(message.created_at);
    const newDay = index === 0 || new Date(visibleMessages[index - 1].created_at).toDateString() !== day.toDateString();
    const isFirstInGroup = newDay || visibleMessages[index - 1].sender_id !== message.sender_id;

    return (
      <>
      {newDay && (
        <div className="flex justify-center pt-3 pb-1">
          <span className="rounded-lg bg-card/90 px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground shadow-sm backdrop-blur dark:bg-[#1c2530]/90">
            {dayLabel(day)}
          </span>
        </div>
      )}
      <div
        id={`msg-${message.id}`}
        className={cn(
          "transition-all duration-300",
          isFirstInGroup ? "pt-2" : "pt-0.5",
          highlightedMessageId === message.id && "bg-primary/10 rounded-xl -mx-2 px-2 py-1"
        )}
      >
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
        />
      </div>
      </>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- starVersion stands for the starred list
  }, [visibleMessages, currentUserId, highlightedMessageId, chatTheme, getReplyMessage, selectedConversation?.full_name, starVersion, handleToggleStar]);

  if (isLoading) return <MessagesSkeleton />;

  return (
    // Starts under the app's header (drawn once for all pages) and ends above the keyboard.
    <div className={cn(
      "fixed inset-x-0 top-[calc(var(--nav-height)+env(safe-area-inset-top,0px))] bottom-[var(--keyboard-inset,0px)] flex flex-col bg-background",
      // Phones: an open chat takes the whole screen, as in WhatsApp.
      (selectedConversation || showAIChat || selectedGroup) && "max-md:top-0"
    )}>
      <Navigation currentUserId={currentUserId || undefined} hideMobileTopBar={!!(selectedConversation || showAIChat || selectedGroup)} />
      <div className="flex-1 flex overflow-hidden">
        <div className="container mx-auto px-0 sm:px-4 py-0 sm:py-4 flex-1 flex overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)] gap-0 sm:gap-4 flex-1 overflow-hidden">
            {/* Conversations List */}
            <Card className={cn("min-w-0 flex flex-col overflow-hidden max-md:border-0 max-md:!bg-transparent max-md:!bg-none max-md:!shadow-none", (selectedConversation || showAIChat || selectedGroup) ? "hidden md:flex" : "flex")}>
              <div className="px-3 pt-3 pb-2.5 sm:p-4 md:border-b flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 -ml-1 [&_svg]:size-5" onClick={() => navigate("/")} aria-label="Back">
                    <ArrowLeft />
                  </Button>
                  <h2 className="flex-1 font-display text-[22px] sm:text-xl font-bold tracking-tight">Messages</h2>
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full [&_svg]:size-[18px]" aria-label="Starred messages" title="Starred messages" onClick={() => setGallery({ scope: { kind: "starred" }, tab: "starred" })}>
                    <Star />
                  </Button>
                  <NewConversation currentUserId={currentUserId!} onSelectUser={openPerson} onNewGroup={() => setShowNewGroup(true)} />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto max-md:px-3 max-md:pb-3">
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
                    <AvatarFallback className="gradient-brand text-primary-foreground">
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
                          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
                          chatFilter === chip.value
                            ? "border-primary/60 bg-primary/15 text-primary"
                            : "border-border bg-card text-foreground hover:bg-secondary"
                        )}
                      >
                        {chip.label}
                        {"count" in chip && chip.count > 0 && <span className="text-muted-foreground">{chip.count}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {!showArchived && <EnablePushBanner />}
                {!showArchived && groupInvites.length > 0 && (
                  <GroupInviteCards
                    invites={groupInvites}
                    onAnswered={(groupId, accepted) => { void reloadGroups(); if (accepted) openGroup(groupId); }}
                  />
                )}
                {showArchived ? (
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
                    emoji="chat"
                    title={showArchived ? "No archived chats" : chatFilter === "unread" ? "No unread chats" : chatFilter === "groups" ? "No group chats yet" : "No conversations yet"}
                    text={showArchived || chatFilter === "unread" ? undefined : "Tap the new-message button at the top to start one."}
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
                          onOpen={() => openPerson(row.conv.profile)}
                          onToggle={(list) => toggleChatPref(list, row.conv.profile.id)}
                          draft={selectedConversation?.id === row.conv.profile.id ? undefined : drafts[row.conv.profile.id]}
                        />
                      )
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* Chat Area — AI or regular conversation */}
            <Card className={cn("min-w-0 flex flex-col overflow-hidden max-md:border-0 max-md:!bg-transparent max-md:!bg-none max-md:!shadow-none", (!selectedConversation && !showAIChat && !selectedGroup) ? "hidden md:flex" : "flex")}>
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
                  {/* Chat Header */}
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
                        <p className="text-xs font-medium text-primary">typing…</p>
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
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-accent [&_svg]:size-6" onClick={() => callPeer && startCall(callPeer, false)} aria-label="Video call">
                      <Video />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-accent [&_svg]:size-[22px]" onClick={() => callPeer && startCall(callPeer, true)} aria-label="Voice call">
                      <Phone />
                    </Button>
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
                      </ActionMenuContent>
                    </ActionMenu>
                    </div>
                  </div>

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
                    itemCount={visibleMessages.length}
                    scrollToBottomKey={visibleMessages.length}
                    lastIsMine={visibleMessages[visibleMessages.length - 1]?.sender_id === currentUserId}
                    firstItemKey={visibleMessages[0]?.id}
                    scrollToIndex={highlightedMessageId ? visibleMessages.findIndex(m => m.id === highlightedMessageId) : undefined}
                    estimatedItemSize={80}
                    className="flex-1 overflow-hidden chat-wallpaper"
                    renderItem={renderMessage}
                    onLoadMore={loadOlderMessages}
                    isLoadingMore={isLoadingMore}
                    hasMore={hasMoreMessages}
                    footer={
                      typingUsers.length > 0 ? (
                        <div className="flex justify-start animate-fade-in px-3 pb-2">
                          <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-2.5">
                            <div className="flex items-center gap-1">
                              <div className="flex gap-1">
                                {[0, 150, 300].map((d) => (
                                  <span key={d} className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                                ))}
                              </div>
                              <span className="text-xs text-muted-foreground ml-2">{typingUsers[0].name} is typing...</span>
                            </div>
                          </div>
                        </div>
                      ) : null
                    }
                  />

                  {/* Message bar, as in WhatsApp: a pill with emoji, text, attach and camera, and a round
                      button beside it that records a voice note, or sends once there's something to send. */}
                  <form onSubmit={handleSendMessage} className="chat-wallpaper px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex-shrink-0">
                    {imageUrl && (
                      <div className="mb-2 ml-2 relative inline-block">
                        {mediaType === "video" ? (
                          <video src={imageUrl} className="h-20 rounded-lg" />
                        ) : (
                          <img src={imageUrl} alt="Preview" className="h-20 rounded-lg" />
                        )}
                        <button type="button" onClick={() => { setImageUrl(null); setMediaType(null); }} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 text-xs" aria-label="Remove attachment">✕</button>
                      </div>
                    )}
                    {/* Replying to (or editing) a message: a quote above the box, as in WhatsApp. */}
                    {(replyingTo || editingMessage) && !voiceActive && (
                      <div className="mb-1 mr-[54px] flex items-start gap-2 rounded-2xl bg-card dark:bg-[#232327] p-1.5 pl-2 shadow-sm animate-fade-in">
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
                        <div className="flex-1 min-w-0 flex items-end gap-0.5 rounded-3xl bg-card dark:bg-[#232327] shadow-sm px-1 py-1 min-h-12 [&_button]:h-10 [&_button]:w-10 [&_button]:shrink-0 [&_button]:rounded-full [&_button_svg]:!h-[22px] [&_button_svg]:!w-[22px] [&_button_svg]:text-muted-foreground">
                          <GifPicker
                            onSelect={(content) => {
                              if (content.startsWith("http")) { setImageUrl(content); setMediaType("image"); }
                              else setMessageContent((prev) => prev + content);
                            }}
                            onSticker={editingMessage ? undefined : (id) => void sendSticker(stickerMessage(id))}
                            onGiphySticker={editingMessage ? undefined : (url) => void sendSticker(GIPHY_STICKER, url)}
                          />
                          <textarea
                            ref={messageBoxRef}
                            rows={1}
                            placeholder={editingMessage ? "Edit message" : "Message"}
                            value={messageContent}
                            onChange={handleInputChange}
                            onKeyDown={sendOnEnter}
                            disabled={isSending}
                            enterKeyHint={enterMakesNewLine() ? "enter" : "send"}
                            className="flex-1 min-w-0 resize-none border-0 bg-transparent px-1 py-2 text-[16px] leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-50"
                            aria-label="Message"
                          />
                          <ChatImageUpload
                            onMediaUploaded={(url, type) => { setImageUrl(url); setMediaType(type); }}
                            onMediaCleared={() => { setImageUrl(null); setMediaType(null); }}
                            previewUrl={null}
                            mediaType={null}
                            isUploading={isUploadingImage}
                            setIsUploading={setIsUploadingImage}
                          />
                        </div>
                      )}
                      {messageContent.trim() || imageUrl ? (
                        <Button type="submit" size="icon" disabled={isSending} aria-label="Send" className="h-12 w-12 shrink-0 rounded-full [&_svg]:size-5">
                          {isSending ? <Loader2 className="animate-spin" /> : <Send className="translate-x-px" />}
                        </Button>
                      ) : (
                        <VoiceMessageRecorder
                          onVoiceMessageSent={handleVoiceMessageSent}
                          disabled={isSending}
                          onActiveChange={setVoiceActive}
                          buttonClassName="h-12 w-12 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground [&_svg]:size-6"
                        />
                      )}
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-2">
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <Send className="h-7 w-7 text-primary" />
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
      {currentUserId && (
        <ForwardDialog message={forwarding} currentUserId={currentUserId} onOpenChange={(open) => { if (!open) setForwarding(null); }} />
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
