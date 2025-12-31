import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import BottomNav from "@/components/BottomNav";
import NewConversation from "@/components/NewConversation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Send, ArrowLeft } from "lucide-react";
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
}

interface Conversation {
  profile: Profile;
  lastMessage?: Message;
  unreadCount: number;
}

const Messages = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageContent, setMessageContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

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
    }
  }, [selectedConversation, currentUserId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setCurrentUserId(session.user.id);
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!messageContent.trim() || !selectedConversation || !currentUserId) return;

    setIsSending(true);

    const { error } = await supabase
      .from("messages")
      .insert({
        sender_id: currentUserId,
        receiver_id: selectedConversation.id,
        content: messageContent.trim(),
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
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={selectedConversation.avatar_url || undefined} />
                      <AvatarFallback>
                        {selectedConversation.full_name?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <p className="font-semibold">
                      {selectedConversation.full_name || "Anonymous"}
                    </p>
                  </div>

                  <div 
                    ref={messagesContainerRef}
                    className="flex-1 overflow-y-auto p-3 sm:p-4"
                  >
                    <div className="space-y-3 sm:space-y-4 min-h-full flex flex-col justify-end">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={cn(
                            "flex",
                            message.sender_id === currentUserId ? "justify-end" : "justify-start"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[80%] sm:max-w-[70%] rounded-2xl px-4 py-2.5",
                              message.sender_id === currentUserId
                                ? "bg-primary text-primary-foreground rounded-br-md"
                                : "bg-secondary rounded-bl-md"
                            )}
                          >
                            <p className="text-sm sm:text-base break-words">{message.content}</p>
                            <p className="text-[10px] sm:text-xs opacity-70 mt-1">
                              {formatDistanceToNow(new Date(message.created_at), {
                                addSuffix: true,
                              })}
                            </p>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  </div>

                  <form onSubmit={handleSendMessage} className="border-t p-3 sm:p-4 flex-shrink-0 bg-card safe-area-bottom">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Type a message..."
                        value={messageContent}
                        onChange={(e) => setMessageContent(e.target.value)}
                        disabled={isSending}
                        className="flex-1"
                      />
                      <Button
                        type="submit"
                        size="icon"
                        disabled={isSending || !messageContent.trim()}
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
    </div>
  );
};

export default Messages;