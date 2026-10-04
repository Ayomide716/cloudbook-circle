import { useEffect, useState, useRef, useCallback, ReactElement } from "react";
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
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Send, ArrowLeft, Check, CheckCheck, Video, Phone, Search, Settings, X, CornerUpLeft, Bot, Sparkles } from "lucide-react";
import VirtualizedChatList from "@/components/VirtualizedChatList";
import MessagesSkeleton from "@/components/skeletons/MessagesSkeleton";
import { format, isThisWeek, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useEffectEvent } from "@/hooks/use-effect-event";

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
  useSEO({ title: "Messages", description: "Chat with your friends on CloudBook." });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
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
    const channel = supabase
      .channel("messages-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const selected = selectedConversationRef.current;
        if (payload.eventType === "UPDATE") {
          const updated = payload.new as ChatMessage;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
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
                // Remove temp messages first, then check for duplicates
                const withoutTemp = prev.filter((m) => !m.id.startsWith("temp-"));
                if (withoutTemp.some((m) => m.id === newMessage.id)) return withoutTemp;
                return [...withoutTemp, newMessage];
              });
              if (newMessage.sender_id === selected.id) {
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      toast({ title: "Error sending message", description: error.message, variant: "destructive" });
      return;
    }
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
  };

  const handleVoiceMessageSent = async (audioUrl: string, duration: number) => {
    if (!selectedConversation || !currentUserId) return;
    const content = `🎤 Voice message (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")})`;
    const tempId = `temp-voice-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, sender_id: currentUserId, receiver_id: selectedConversation.id, content, image_url: audioUrl, created_at: new Date().toISOString(), read: false }]);
    const { data, error } = await supabase.from("messages").insert({ sender_id: currentUserId, receiver_id: selectedConversation.id, content, image_url: audioUrl }).select().single();
    if (error) { setMessages((prev) => prev.filter((m) => m.id !== tempId)); return; }
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

    return (
      <div
        id={`msg-${message.id}`}
        className={cn(
          "transition-all duration-300",
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
        />
      </div>
    );
  }, [visibleMessages, currentUserId, highlightedMessageId, chatTheme, getReplyMessage]);

  if (isLoading) return <MessagesSkeleton />;

  return (
    <div className="fixed inset-x-0 top-0 bottom-[var(--keyboard-inset,0px)] flex flex-col bg-background">
      <Navigation currentUserId={currentUserId || undefined} />
      <div className="flex-1 flex overflow-hidden">
        <div className="container mx-auto px-0 sm:px-4 py-0 sm:py-4 flex-1 flex overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)] gap-0 sm:gap-4 flex-1 overflow-hidden">
            {/* Conversations List */}
            <Card className={cn("min-w-0 flex flex-col rounded-none sm:rounded-lg overflow-hidden", (selectedConversation || showAIChat) ? "hidden md:flex" : "flex")}>
              <div className="p-3 sm:p-4 border-b flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <Button variant="ghost" size="icon" className="md:hidden h-9 w-9 touch-target" onClick={() => navigate("/")}>
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <h2 className="text-lg sm:text-xl font-bold">Messages</h2>
                </div>
                <NewConversation currentUserId={currentUserId!} onSelectUser={setSelectedConversation} />
              </div>
              <div className="flex-1 overflow-y-auto">
                {/* AI Companion Entry */}
                <div
                  className={cn(
                    "flex items-center gap-3 p-3 sm:p-4 cursor-pointer transition-all duration-200 active:scale-[0.98] border-b",
                    showAIChat ? "bg-accent" : "hover:bg-accent/50"
                  )}
                  onClick={() => { setShowAIChat(true); setSelectedConversation(null); }}
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
                {conversations.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No conversations yet</p>
                ) : (
                  <div className="divide-y">
                    {conversations.map((conv) => (
                      <div
                        key={conv.profile.id}
                        className={cn(
                          "flex items-center gap-3 p-3 sm:p-4 cursor-pointer transition-all duration-200 active:scale-[0.98]",
                          selectedConversation?.id === conv.profile.id ? "bg-accent" : "hover:bg-accent/50"
                        )}
                        onClick={() => setSelectedConversation(conv.profile)}
                      >
                        <Avatar className="h-12 w-12 flex-shrink-0">
                          <AvatarImage src={conv.profile.avatar_url || undefined} />
                          <AvatarFallback>{conv.profile.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold truncate">{conv.profile.full_name || "Anonymous"}</p>
                            {conv.lastMessage && (
                              <span className="text-[11px] text-muted-foreground flex-shrink-0 ml-2">
                                {shortTime(conv.lastMessage.created_at)}
                              </span>
                            )}
                          </div>
                          {conv.lastMessage && (
                            <div className="flex items-center gap-1">
                              {conv.lastMessage.sender_id === currentUserId && (
                                <span className="flex-shrink-0">
                                  {conv.lastMessage.read ? <CheckCheck className="h-3.5 w-3.5 text-primary" /> : <Check className="h-3.5 w-3.5 text-muted-foreground" />}
                                </span>
                              )}
                              <p className={cn("text-sm truncate", conv.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                                {conv.lastMessage.deleted_at ? "🚫 Message unsent" : conv.lastMessage.content}
                              </p>
                            </div>
                          )}
                        </div>
                        {conv.unreadCount > 0 && (
                          <span className="bg-primary text-primary-foreground text-xs rounded-full h-6 min-w-6 px-2 flex items-center justify-center">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Chat Area — AI or regular conversation */}
            <Card className={cn("min-w-0 flex flex-col rounded-none sm:rounded-lg overflow-hidden", (!selectedConversation && !showAIChat) ? "hidden md:flex" : "flex")}>
              {showAIChat ? (
                <AIChatCompanion onBack={() => { setShowAIChat(false); }} />
              ) : selectedConversation ? (
                <>
                  {/* Chat Header */}
                  <div className="border-b p-2.5 sm:p-4 flex items-center gap-2 sm:gap-3 flex-shrink-0 bg-card">
                    <Button variant="ghost" size="icon" className="md:hidden h-9 w-9 touch-target" onClick={() => { setSelectedConversation(null); setReplyingTo(null); setEditingMessage(null); }}>
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
                      <OnlineStatusIndicator userId={selectedConversation.id} showText currentUserId={currentUserId || undefined} />
                    </div>

                    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-accent" onClick={() => setShowMessageSearch(!showMessageSearch)} aria-label="Search messages">
                      <Search className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-accent" onClick={() => setShowChatSettings(true)} aria-label="Chat settings">
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-primary/10 text-primary" onClick={() => callPeer && startCall(callPeer, true)} aria-label="Voice call">
                      <Phone className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-primary/10 text-primary" onClick={() => callPeer && startCall(callPeer, false)} aria-label="Video call">
                      <Video className="h-5 w-5" />
                    </Button>
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
                      ⏱ Disappearing messages are on ({disappearingMinutes >= 1440 ? `${disappearingMinutes / 1440}d` : disappearingMinutes >= 60 ? `${disappearingMinutes / 60}h` : `${disappearingMinutes}m`})
                    </div>
                  )}

                  {/* Virtualized Messages */}
                  <VirtualizedChatList
                    itemCount={visibleMessages.length}
                    scrollToBottomKey={visibleMessages.length}
                    firstItemKey={visibleMessages[0]?.id}
                    scrollToIndex={highlightedMessageId ? visibleMessages.findIndex(m => m.id === highlightedMessageId) : undefined}
                    estimatedItemSize={80}
                    className="flex-1 overflow-hidden"
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

                  {/* Reply / Edit bar */}
                  {(replyingTo || editingMessage) && (
                    <div className="px-3 pt-2 bg-card border-t flex items-center gap-2 animate-fade-in">
                      <div className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm">
                        {editingMessage ? (
                          <span className="text-muted-foreground">✏️ Editing message</span>
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-1">
                            <CornerUpLeft className="h-3 w-3" />
                            Replying to: <span className="font-medium text-foreground truncate">{replyingTo?.content?.substring(0, 50)}</span>
                          </span>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setReplyingTo(null); setEditingMessage(null); setMessageContent(""); }}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}

                  {/* Message input */}
                  <form onSubmit={handleSendMessage} className="border-t p-3 sm:p-4 pb-4 flex-shrink-0 bg-card">
                    {imageUrl && (
                      <div className="mb-2 relative inline-block">
                        {mediaType === "video" ? (
                          <video src={imageUrl} className="h-20 rounded-lg" />
                        ) : (
                          <img src={imageUrl} alt="Preview" className="h-20 rounded-lg" />
                        )}
                        <button type="button" onClick={() => { setImageUrl(null); setMediaType(null); }} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 text-xs">✕</button>
                      </div>
                    )}
                    {/* Attachment buttons keep their size; only the text box flexes. */}
                    <div className={cn("flex gap-1 sm:gap-2 items-center", !voiceActive && "[&>*]:shrink-0")}>
                      {!voiceActive && (
                      <ChatImageUpload
                        onMediaUploaded={(url, type) => { setImageUrl(url); setMediaType(type); }}
                        onMediaCleared={() => { setImageUrl(null); setMediaType(null); }}
                        previewUrl={null}
                        mediaType={null}
                        isUploading={isUploadingImage}
                        setIsUploading={setIsUploadingImage}
                      />
                      )}
                      <VoiceMessageRecorder onVoiceMessageSent={handleVoiceMessageSent} disabled={isSending} onActiveChange={setVoiceActive} />
                      {!voiceActive && (<>
                      <GifPicker
                        onSelect={(content) => {
                          if (content.startsWith("http")) { setImageUrl(content); setMediaType("image"); }
                          else setMessageContent((prev) => prev + content);
                        }}
                      />
                      <Input
                        placeholder={editingMessage ? "Edit message..." : "Type a message..."}
                        value={messageContent}
                        onChange={handleInputChange}
                        disabled={isSending}
                        className="flex-1 min-w-0 !shrink"
                        aria-label="Message"
                      />
                      <Button type="submit" size="icon" disabled={isSending || (!messageContent.trim() && !imageUrl)} className="touch-target">
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                      </>)}
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
      {selectedConversation && currentUserId && (
        <ChatSettingsModal
          open={showChatSettings}
          onClose={() => setShowChatSettings(false)}
          currentUserId={currentUserId}
          otherUserId={selectedConversation.id}
          onSettingsChanged={(theme, mins) => { setChatTheme(theme); setDisappearingMinutes(mins); }}
        />
      )}

    </div>
  );
};

export default Messages;
