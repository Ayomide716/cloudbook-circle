import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useVideoCall } from "@/hooks/use-video-call";
import Navigation from "@/components/Navigation";
import BottomNav from "@/components/BottomNav";
import NewConversation from "@/components/NewConversation";
import MessageReactions from "@/components/MessageReactions";
import ChatImageUpload from "@/components/ChatImageUpload";
import OnlineStatusIndicator from "@/components/OnlineStatusIndicator";
import VideoCall from "@/components/VideoCall";
import VoiceMessageRecorder from "@/components/VoiceMessageRecorder";
import VoiceMessagePlayer from "@/components/VoiceMessagePlayer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Send, ArrowLeft, Check, CheckCheck, Video } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  read: boolean;
  image_url?: string | null;
}

interface Conversation {
  profile: Profile;
  lastMessage?: Message;
  unreadCount: number;
}

interface TypingUser {
  id: string;
  name: string;
}

const Messages = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageContent, setMessageContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Video call hook
  const {
    incomingCall,
    activeCall,
    initiateCall,
    acceptIncomingCall,
    rejectIncomingCall,
    endCall,
  } = useVideoCall(currentUserId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (currentUserId) {
      loadConversations();
      setupRealtimeSubscription();
    }
  }, [currentUserId]);

  useEffect(() => {
    if (selectedConversation && currentUserId) {
      loadMessages(selectedConversation.id);
      setupTypingChannel();
    }
    
    return () => {
      if (typingChannelRef.current) {
        supabase.removeChannel(typingChannelRef.current);
      }
    };
  }, [selectedConversation, currentUserId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setCurrentUserId(session.user.id);
    
    // Get current user's name for typing indicator
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", session.user.id)
      .single();
    
    if (profile?.full_name) {
      setCurrentUserName(profile.full_name);
    }

    // Update online status
    await updateOnlineStatus(session.user.id, true);
    
    // Set up presence heartbeat
    presenceIntervalRef.current = setInterval(() => {
      updateOnlineStatus(session.user.id, true);
    }, 30000);

    // Cleanup on unmount
    window.addEventListener("beforeunload", () => {
      updateOnlineStatus(session.user.id, false);
    });
  };

  const updateOnlineStatus = async (userId: string, isOnline: boolean) => {
    const { data: existing } = await supabase
      .from("user_status")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("user_status")
        .update({ is_online: isOnline, last_seen: new Date().toISOString() })
        .eq("user_id", userId);
    } else {
      await supabase
        .from("user_status")
        .insert({ user_id: userId, is_online: isOnline, last_seen: new Date().toISOString() });
    }
  };

  const loadConversations = async () => {
    if (!currentUserId) return;

    const { data: messagesData } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
      .order("created_at", { ascending: false });

    const conversationMap = new Map<string, Conversation>();

    for (const message of messagesData || []) {
      const otherUserId = message.sender_id === currentUserId 
        ? message.receiver_id 
        : message.sender_id;

      if (!conversationMap.has(otherUserId)) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", otherUserId)
          .single();

        if (profileData) {
          const unreadCount = (messagesData || []).filter(
            m => m.sender_id === otherUserId && 
                 m.receiver_id === currentUserId && 
                 !m.read
          ).length;

          conversationMap.set(otherUserId, {
            profile: profileData,
            lastMessage: message,
            unreadCount,
          });
        }
      }
    }

    setConversations(Array.from(conversationMap.values()));
    setIsLoading(false);
  };

  const loadMessages = async (otherUserId: string) => {
    if (!currentUserId) return;

    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`
      )
      .order("created_at", { ascending: true });

    setMessages(data || []);

    // Mark messages as read
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("sender_id", otherUserId)
      .eq("receiver_id", currentUserId)
      .eq("read", false);

    loadConversations();
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel("messages-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMessage = payload.new as Message;
          
          // Update conversations list
          loadConversations();
          
          // If the message is for the current conversation, append it
          if (selectedConversation && currentUserId) {
            if (
              (newMessage.sender_id === currentUserId && newMessage.receiver_id === selectedConversation.id) ||
              (newMessage.sender_id === selectedConversation.id && newMessage.receiver_id === currentUserId)
            ) {
              setMessages(prev => [...prev, newMessage]);
              
              // Mark as read if it's from the other person
              if (newMessage.sender_id === selectedConversation.id) {
                supabase
                  .from("messages")
                  .update({ read: true })
                  .eq("id", newMessage.id);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const setupTypingChannel = () => {
    if (!selectedConversation || !currentUserId) return;
    
    // Create a unique room for this conversation pair
    const roomId = [currentUserId, selectedConversation.id].sort().join('-');
    
    typingChannelRef.current = supabase
      .channel(`typing-${roomId}`)
      .on('presence', { event: 'sync' }, () => {
        const state = typingChannelRef.current?.presenceState() || {};
        const typingList: TypingUser[] = [];
        
        Object.values(state).forEach((presences: any) => {
          presences.forEach((presence: any) => {
            if (presence.userId !== currentUserId && presence.isTyping) {
              typingList.push({
                id: presence.userId,
                name: presence.userName,
              });
            }
          });
        });
        
        setTypingUsers(typingList);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await typingChannelRef.current?.track({
            userId: currentUserId,
            userName: currentUserName,
            isTyping: false,
          });
        }
      });
  };

  const handleTyping = useCallback(async () => {
    if (!typingChannelRef.current || !currentUserId) return;
    
    await typingChannelRef.current.track({
      userId: currentUserId,
      userName: currentUserName,
      isTyping: true,
    });
    
    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(async () => {
      await typingChannelRef.current?.track({
        userId: currentUserId,
        userName: currentUserName,
        isTyping: false,
      });
    }, 2000);
  }, [currentUserId, currentUserName]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageContent(e.target.value);
    handleTyping();
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if ((!messageContent.trim() && !imageUrl) || !selectedConversation || !currentUserId) return;

    setIsSending(true);

    const { error } = await supabase
      .from("messages")
      .insert({
        sender_id: currentUserId,
        receiver_id: selectedConversation.id,
        content: messageContent.trim() || (imageUrl ? "Sent an image" : ""),
        image_url: imageUrl,
      });

    setIsSending(false);

    if (error) {
      toast({
        title: "Error sending message",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setMessageContent("");
    setImageUrl(null);
  };

  const handleVoiceMessageSent = async (audioUrl: string, duration: number) => {
    if (!selectedConversation || !currentUserId) return;

    const { error } = await supabase
      .from("messages")
      .insert({
        sender_id: currentUserId,
        receiver_id: selectedConversation.id,
        content: `🎤 Voice message (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')})`,
        image_url: audioUrl,
      });

    if (error) {
      toast({
        title: "Error sending voice message",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <div className="flex items-center justify-center h-[calc(100vh-56px)]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <Navigation currentUserId={currentUserId || undefined} />
      
      <div className="flex-1 flex overflow-hidden">
        <div className="container mx-auto px-0 sm:px-4 py-0 sm:py-4 flex-1 flex overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 sm:gap-4 flex-1 overflow-hidden">
            {/* Conversations List */}
            <Card className={cn(
              "md:col-span-1 flex flex-col rounded-none sm:rounded-lg overflow-hidden",
              selectedConversation ? 'hidden md:flex' : 'flex'
            )}>
              <div className="p-3 sm:p-4 border-b flex-shrink-0">
                <h2 className="text-lg sm:text-xl font-bold mb-3">Messages</h2>
                <NewConversation 
                  currentUserId={currentUserId!} 
                  onSelectUser={setSelectedConversation}
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No conversations yet
                  </p>
                ) : (
                  <div className="divide-y">
                    {conversations.map((conv) => (
                      <div
                        key={conv.profile.id}
                        className={cn(
                          "flex items-center gap-3 p-3 sm:p-4 cursor-pointer transition-colors active:bg-accent/70",
                          selectedConversation?.id === conv.profile.id
                            ? "bg-accent"
                            : "hover:bg-accent/50"
                        )}
                        onClick={() => setSelectedConversation(conv.profile)}
                      >
                        <Avatar className="h-12 w-12 flex-shrink-0">
                          <AvatarImage src={conv.profile.avatar_url || undefined} />
                          <AvatarFallback>
                            {conv.profile.full_name?.[0]?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">
                            {conv.profile.full_name || "Anonymous"}
                          </p>
                          {conv.lastMessage && (
                            <p className="text-sm text-muted-foreground truncate">
                              {conv.lastMessage.content}
                            </p>
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

            {/* Chat Area */}
            <Card className={cn(
              "md:col-span-2 flex flex-col rounded-none sm:rounded-lg overflow-hidden",
              !selectedConversation ? 'hidden md:flex' : 'flex'
            )}>
              {selectedConversation ? (
                <>
                  <div className="border-b p-3 sm:p-4 flex items-center gap-3 flex-shrink-0 bg-card">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="md:hidden h-9 w-9 touch-target"
                      onClick={() => setSelectedConversation(null)}
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={selectedConversation.avatar_url || undefined} />
                        <AvatarFallback>
                          {selectedConversation.full_name?.[0]?.toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute bottom-0 right-0">
                        <OnlineStatusIndicator userId={selectedConversation.id} />
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">
                        {selectedConversation.full_name || "Anonymous"}
                      </p>
                      <OnlineStatusIndicator userId={selectedConversation.id} showText />
                    </div>
                    
                    {/* Video Call Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full hover:bg-primary/10 text-primary"
                      onClick={() => initiateCall(
                        selectedConversation.id,
                        selectedConversation.full_name || "Anonymous",
                        selectedConversation.avatar_url
                      )}
                    >
                      <Video className="h-5 w-5" />
                    </Button>
                  </div>

                  <div 
                    ref={messagesContainerRef}
                    className="flex-1 overflow-y-auto p-3 sm:p-4"
                  >
                    <div className="space-y-3 sm:space-y-4 min-h-full flex flex-col justify-end">
                      {messages.map((message, index) => {
                        const isCurrentUser = message.sender_id === currentUserId;
                        const isLastMessage = index === messages.length - 1;
                        
                        return (
                          <div
                            key={message.id}
                            className={cn(
                              "flex group",
                              isCurrentUser ? "justify-end" : "justify-start"
                            )}
                          >
                            <div className="flex flex-col gap-1">
                              <div
                                className={cn(
                                  "max-w-[80%] sm:max-w-[70%] rounded-2xl px-4 py-2.5",
                                  isCurrentUser
                                    ? "bg-primary text-primary-foreground rounded-br-md"
                                    : "bg-secondary rounded-bl-md"
                                )}
                              >
                                {/* Voice message */}
                                {message.image_url && message.content?.startsWith("🎤") && (
                                  <VoiceMessagePlayer 
                                    audioUrl={message.image_url} 
                                    isOwnMessage={isCurrentUser}
                                  />
                                )}
                                {/* Image/Video */}
                                {message.image_url && !message.content?.startsWith("🎤") && (
                                  <img
                                    src={message.image_url}
                                    alt="Shared image"
                                    className="rounded-lg max-w-full mb-2 cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => window.open(message.image_url!, "_blank")}
                                  />
                                )}
                                {message.content && message.content !== "Sent an image" && !message.content?.startsWith("🎤") && (
                                  <p className="text-sm sm:text-base break-words">{message.content}</p>
                                )}
                                <div className="flex items-center gap-1.5 mt-1">
                                  <p className="text-[10px] sm:text-xs opacity-70">
                                    {formatDistanceToNow(new Date(message.created_at), {
                                      addSuffix: true,
                                    })}
                                  </p>
                                  {isCurrentUser && (
                                    <span className="opacity-70">
                                      {message.read ? (
                                        <CheckCheck className="h-3 w-3 text-blue-400" />
                                      ) : (
                                        <Check className="h-3 w-3" />
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <MessageReactions
                                messageId={message.id}
                                currentUserId={currentUserId!}
                                isOwnMessage={isCurrentUser}
                              />
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Typing indicator */}
                      {typingUsers.length > 0 && (
                        <div className="flex justify-start">
                          <div className="bg-secondary rounded-2xl rounded-bl-md px-4 py-2.5">
                            <div className="flex items-center gap-1">
                              <div className="flex gap-1">
                                <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                              </div>
                              <span className="text-xs text-muted-foreground ml-2">
                                {typingUsers[0].name} is typing...
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div ref={messagesEndRef} />
                    </div>
                  </div>

                  <form onSubmit={handleSendMessage} className="border-t p-3 sm:p-4 flex-shrink-0 bg-card safe-area-bottom">
                    {imageUrl && (
                      <div className="mb-2 relative inline-block">
                        <img src={imageUrl} alt="Preview" className="h-20 rounded-lg" />
                        <button
                          type="button"
                          onClick={() => setImageUrl(null)}
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    <div className="flex gap-2 items-center">
                      <ChatImageUpload
                        onImageUploaded={setImageUrl}
                        onImageCleared={() => setImageUrl(null)}
                        previewUrl={null}
                        isUploading={isUploadingImage}
                        setIsUploading={setIsUploadingImage}
                      />
                      <VoiceMessageRecorder 
                        onVoiceMessageSent={handleVoiceMessageSent}
                        disabled={isSending}
                      />
                      <Input
                        placeholder="Type a message..."
                        value={messageContent}
                        onChange={handleInputChange}
                        disabled={isSending}
                        className="flex-1"
                      />
                      <Button
                        type="submit"
                        size="icon"
                        disabled={isSending || (!messageContent.trim() && !imageUrl)}
                        className="touch-target"
                      >
                        {isSending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">
                    Select a conversation to start messaging
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
      
      <BottomNav currentUserId={currentUserId || undefined} />

      {/* Video Call Components */}
      {activeCall && (
        <VideoCall
          currentUserId={currentUserId!}
          remoteUserId={activeCall.remoteUserId}
          remoteUserName={activeCall.remoteUserName}
          remoteUserAvatar={activeCall.remoteUserAvatar}
          onEnd={endCall}
          isIncoming={activeCall.isIncoming}
          onAccept={acceptIncomingCall}
          onReject={rejectIncomingCall}
        />
      )}

      {/* Incoming Call Notification */}
      {incomingCall && !activeCall && (
        <VideoCall
          currentUserId={currentUserId!}
          remoteUserId={incomingCall.from}
          remoteUserName={incomingCall.fromName}
          remoteUserAvatar={incomingCall.fromAvatar}
          onEnd={rejectIncomingCall}
          isIncoming={true}
          onAccept={acceptIncomingCall}
          onReject={rejectIncomingCall}
        />
      )}
    </div>
  );
};

export default Messages;