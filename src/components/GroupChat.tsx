import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface GroupMessage {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  profiles?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface GroupChatProps {
  groupId: string;
  currentUserId: string;
}

const GroupChat = ({ groupId, currentUserId }: GroupChatProps) => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [messageContent, setMessageContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const profileCache = useRef<Map<string, { full_name: string | null; avatar_url: string | null }>>(new Map());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchProfile = useCallback(async (userId: string) => {
    if (profileCache.current.has(userId)) {
      return profileCache.current.get(userId)!;
    }

    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("id", userId)
      .single();

    const profile = data || { full_name: null, avatar_url: null };
    profileCache.current.set(userId, profile);
    return profile;
  }, []);

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from("group_messages")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("Error loading group messages:", error);
      setIsLoading(false);
      return;
    }

    // Fetch profiles for all messages
    const messagesWithProfiles = await Promise.all(
      (data || []).map(async (msg) => {
        const profile = await fetchProfile(msg.user_id);
        return { ...msg, profiles: { id: msg.user_id, ...profile } };
      })
    );

    setMessages(messagesWithProfiles);
    setIsLoading(false);
  }, [groupId, fetchProfile]);

  const setupRealtimeSubscription = useCallback(() => {
    const channel = supabase
      .channel(`group-chat-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${groupId}`,
        },
        async (payload) => {
          const newMessage = payload.new as GroupMessage;
          
          // Don't add if already exists (optimistic update)
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) {
              return prev;
            }
            // Remove temp message and add real one
            const filtered = prev.filter((m) => !m.id.startsWith("temp-"));
            return [...filtered, newMessage];
          });

          // Fetch profile if not cached
          const profile = await fetchProfile(newMessage.user_id);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === newMessage.id
                ? { ...m, profiles: { id: newMessage.user_id, ...profile } }
                : m
            )
          );
        }
      )
      .subscribe();

    return channel;
  }, [groupId, fetchProfile]);

  useEffect(() => {
    loadMessages();
    const channel = setupRealtimeSubscription();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadMessages, setupRealtimeSubscription]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!messageContent.trim()) return;

    const content = messageContent.trim();
    const tempId = `temp-${Date.now()}`;

    // Optimistic update
    const optimisticMessage: GroupMessage = {
      id: tempId,
      group_id: groupId,
      user_id: currentUserId,
      content,
      image_url: null,
      created_at: new Date().toISOString(),
      profiles: profileCache.current.get(currentUserId) 
        ? { id: currentUserId, ...profileCache.current.get(currentUserId)! }
        : { id: currentUserId, full_name: "You", avatar_url: null },
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setMessageContent("");
    setIsSending(true);

    const { data, error } = await supabase
      .from("group_messages")
      .insert({
        group_id: groupId,
        user_id: currentUserId,
        content,
      })
      .select()
      .single();

    setIsSending(false);

    if (error) {
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast({
        title: "Error sending message",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    // Replace optimistic message with real one
    if (data) {
      const profile = await fetchProfile(currentUserId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...data, profiles: { id: currentUserId, ...profile } }
            : m
        )
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-350px)] min-h-[300px] max-h-[600px] bg-card rounded-lg border overflow-hidden mb-20 md:mb-0">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => {
            const isCurrentUser = message.user_id === currentUserId;

            return (
              <div
                key={message.id}
                className={cn(
                  "flex gap-2",
                  isCurrentUser ? "flex-row-reverse" : "flex-row"
                )}
              >
                {!isCurrentUser && (
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={message.profiles?.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {message.profiles?.full_name?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div
                  className={cn(
                    "flex flex-col max-w-[70%]",
                    isCurrentUser ? "items-end" : "items-start"
                  )}
                >
                  {!isCurrentUser && (
                    <span className="text-xs text-muted-foreground mb-1">
                      {message.profiles?.full_name || "Anonymous"}
                    </span>
                  )}

                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2",
                      isCurrentUser
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-secondary text-foreground rounded-bl-sm"
                    )}
                  >
                    <p className="text-sm break-words whitespace-pre-wrap">
                      {message.content}
                    </p>
                  </div>

                  <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                    {formatDistanceToNow(new Date(message.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t bg-background p-3">
        <form onSubmit={handleSendMessage} className="flex gap-2">
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
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default GroupChat;
