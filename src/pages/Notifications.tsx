import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import BottomNav from "@/components/BottomNav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Bell, Heart, MessageCircle, UserPlus, Check, Users, ThumbsUp, Share2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: string;
  content: string;
  read: boolean;
  created_at: string;
  related_id: string | null;
  actor_id: string | null;
  actor_profile?: { full_name: string | null; avatar_url: string | null } | null;
}



const Notifications = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (currentUserId) {
      loadNotifications();
      setupRealtimeSubscription();
    }
  }, [currentUserId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setCurrentUserId(session.user.id);
  };

  const loadNotifications = async () => {
    if (!currentUserId) return;

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error loading notifications",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    // Fetch actor profiles for notifications that have actor_id
    const notifs = data || [];
    const actorIds = [...new Set(notifs.map(n => (n as any).actor_id).filter(Boolean))];
    let actorMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", actorIds);
      if (profiles) {
        actorMap = Object.fromEntries(profiles.map(p => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]));
      }
    }

    const enriched: Notification[] = notifs.map(n => ({
      ...n,
      actor_id: (n as any).actor_id || null,
      actor_profile: (n as any).actor_id ? actorMap[(n as any).actor_id] || null : null,
    }));

    setNotifications(enriched);
    setIsLoading(false);
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel("notifications-page")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const markAsRead = async (notificationId: string) => {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId);

    loadNotifications();
  };

  const markAllAsRead = async () => {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", currentUserId)
      .eq("read", false);

    loadNotifications();
    toast({
      title: "All notifications marked as read",
    });
  };

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read first
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    
    // Navigate based on notification type
    switch (notification.type) {
      case "like":
      case "comment":
        // Navigate to the post (related_id is post_id)
        if (notification.related_id) {
          navigate(`/?post=${notification.related_id}`);
        }
        break;
      case "friend_request":
      case "friend_accepted":
        // Navigate to the friend's profile or friends page
        navigate("/friends");
        break;
      default:
        // Default navigation
        break;
    }
  };

  const getNotificationIcon = (type: string, small = false) => {
    const size = small ? "h-6 w-6" : "h-10 w-10";
    const iconSize = small ? "h-3 w-3" : "h-5 w-5";
    switch (type) {
      case "like":
        return (
          <div className={`${size} rounded-full bg-red-500 flex items-center justify-center ${small ? "border-2 border-card" : ""}`}>
            <Heart className={`${iconSize} text-white`} fill="currentColor" />
          </div>
        );
      case "comment":
        return (
          <div className={`${size} rounded-full bg-blue-500 flex items-center justify-center ${small ? "border-2 border-card" : ""}`}>
            <MessageCircle className={`${iconSize} text-white`} fill="currentColor" />
          </div>
        );
      case "friend_request":
        return (
          <div className={`${size} rounded-full bg-green-500 flex items-center justify-center ${small ? "border-2 border-card" : ""}`}>
            <UserPlus className={`${iconSize} text-white`} />
          </div>
        );
      case "friend_accepted":
        return (
          <div className={`${size} rounded-full bg-purple-500 flex items-center justify-center ${small ? "border-2 border-card" : ""}`}>
            <Users className={`${iconSize} text-white`} />
          </div>
        );
      case "share":
        return (
          <div className={`${size} rounded-full bg-orange-500 flex items-center justify-center ${small ? "border-2 border-card" : ""}`}>
            <Share2 className={`${iconSize} text-white`} />
          </div>
        );
      case "reaction":
        return (
          <div className={`${size} rounded-full bg-yellow-500 flex items-center justify-center ${small ? "border-2 border-card" : ""}`}>
            <ThumbsUp className={`${iconSize} text-white`} />
          </div>
        );
      default:
        return (
          <div className={`${size} rounded-full bg-primary flex items-center justify-center ${small ? "border-2 border-card" : ""}`}>
            <Bell className={`${iconSize} text-white`} />
          </div>
        );
    }
  };

  const getNotificationMessage = (notification: Notification) => {
    // Parse the content to make it more readable
    const content = notification.content;
    
    // Extract the action part (e.g., "liked your post", "commented on your post")
    return content;
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

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
    <div className="min-h-screen bg-background pb-20 md:pb-4">
      <Navigation currentUserId={currentUserId || undefined} />
      
      <div className="max-w-[800px] mx-auto px-4 py-4 sm:py-6">
        {/* Header - Facebook Style */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold">Notifications</h1>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-primary hover:text-primary/80 font-medium"
            >
              <Check className="h-4 w-4 mr-1" />
              Mark all as read
            </Button>
          )}
        </div>

        {/* Unread Section */}
        {unreadCount > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">New</h2>
              <span className="text-sm text-muted-foreground">{unreadCount} unread</span>
            </div>
          </div>
        )}

        <Card className="overflow-hidden">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                <Bell className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <p className="text-lg font-medium text-foreground mb-1">
                No notifications yet
              </p>
              <p className="text-sm text-muted-foreground max-w-[280px]">
                When someone interacts with your posts or sends you a friend request, you'll see it here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "flex items-start gap-3 p-4 transition-all cursor-pointer hover:bg-accent/50 active:bg-accent",
                    !notification.read && "bg-primary/5"
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  {/* Avatar or Icon */}
                  <div className="flex-shrink-0 relative">
                    {notification.actor_profile ? (
                      <div className="relative">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={notification.actor_profile.avatar_url || ""} />
                          <AvatarFallback className="bg-secondary text-sm">
                            {notification.actor_profile.full_name?.[0]?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="absolute -bottom-1 -right-1">
                          {getNotificationIcon(notification.type, true)}
                        </div>
                      </div>
                    ) : (
                      getNotificationIcon(notification.type)
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm sm:text-base leading-snug",
                      !notification.read ? "font-medium text-foreground" : "text-muted-foreground"
                    )}>
                      {getNotificationMessage(notification)}
                    </p>
                    <p className={cn(
                      "text-xs mt-1",
                      !notification.read ? "text-primary font-medium" : "text-muted-foreground"
                    )}>
                      {formatDistanceToNow(new Date(notification.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  
                  {/* Unread Indicator */}
                  {!notification.read && (
                    <div className="flex-shrink-0 mt-2">
                      <div className="h-3 w-3 rounded-full bg-primary" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      
      <BottomNav currentUserId={currentUserId || undefined} />
    </div>
  );
};

export default Notifications;
