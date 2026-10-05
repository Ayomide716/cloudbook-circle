import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import BottomNav from "@/components/BottomNav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Bell, Heart, MessageCircle, UserPlus, CheckCheck, Users, ThumbsUp, Share2 } from "lucide-react";
import { PageHeader, HeaderAction, Chips } from "@/components/layout/PageHeader";
import NotificationsSkeleton from "@/components/skeletons/NotificationsSkeleton";
import { formatDistanceToNow } from "date-fns";
import { cn, toDate } from "@/lib/utils";
import { useEffectEvent } from "@/hooks/use-effect-event";

interface Notification {
  id: string;
  type: string;
  content: string;
  read: boolean | null;
  created_at: string | null;
  related_id: string | null;
  actor_id: string | null;
  actor_profile?: { full_name: string | null; avatar_url: string | null } | null;
  /** Identical copies hidden from the list (an old bug created many notifications twice). */
  duplicateIds?: string[];
}

/** Keeps the newest of each identical notification, remembering the others' ids. */
const collapseDuplicates = (list: Notification[]) => {
  const seen = new Map<string, Notification>();
  for (const n of list) {
    const key = `${n.type}|${n.actor_id}|${n.related_id}|${n.content}`;
    const kept = seen.get(key);
    if (kept) {
      kept.duplicateIds = [...(kept.duplicateIds ?? []), n.id];
      if (!n.read) kept.read = false;
    } else {
      seen.set(key, { ...n });
    }
  }
  return [...seen.values()];
};



const Notifications = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  useSEO({ title: "Notifications", description: "Your CloudBook notifications." });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const checkAuth = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setCurrentUserId(session.user.id);
  });

  useEffect(() => {
    checkAuth();
  }, [navigate, checkAuth]);

  const loadNotifications = useEffectEvent(async () => {
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
    const actorIds = [...new Set(notifs.map(n => n.actor_id).filter((id): id is string => !!id))];
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
      actor_profile: n.actor_id ? actorMap[n.actor_id] || null : null,
    }));

    setNotifications(collapseDuplicates(enriched));
    setIsLoading(false);
  });

  const setupRealtimeSubscription = useEffectEvent(() => {
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
  });

  useEffect(() => {
    if (currentUserId) {
      loadNotifications();
      return setupRealtimeSubscription();
    }
  }, [currentUserId, loadNotifications, setupRealtimeSubscription]);

  const markAsRead = async (notification: Notification) => {
    await supabase
      .from("notifications")
      .update({ read: true })
      .in("id", [notification.id, ...(notification.duplicateIds ?? [])]);

    loadNotifications();
  };

  const markAllAsRead = async () => {
    if (!currentUserId) return;
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
      await markAsRead(notification);
    }
    
    // Navigate based on notification type
    switch (notification.type) {
      case "like":
      case "comment":
        // Navigate to the post (related_id is post_id)
        if (notification.related_id) {
          navigate(`/post/${notification.related_id}`);
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
  const shown = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <NotificationsSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId || undefined} />
      
      <div className="page-flush max-w-[800px] mx-auto px-0 sm:px-4 pb-6 sm:py-6">
        <PageHeader
          title="Notifications"
          subtitle={unreadCount > 0 ? `${unreadCount} unread` : undefined}
          actions={unreadCount > 0 ? <HeaderAction icon={CheckCheck} label="Mark all as read" onClick={markAllAsRead} /> : undefined}
          className="sm:mb-4"
        >
          <Chips
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "unread", label: unreadCount > 0 ? `Unread · ${unreadCount}` : "Unread" },
            ]}
          />
        </PageHeader>

        <Card className="feed-section overflow-hidden mt-2 sm:mt-0">
          {shown.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
                <Bell className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <p className="text-lg font-medium text-foreground mb-1">
                {filter === "unread" && notifications.length > 0 ? "You're all caught up" : "No notifications yet"}
              </p>
              <p className="text-sm text-muted-foreground max-w-[280px]">
                {filter === "unread" && notifications.length > 0
                  ? "Nothing new since you last looked."
                  : "When someone interacts with your posts or sends you a friend request, you'll see it here"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {shown.map((notification) => (
                <button
                  type="button"
                  key={notification.id}
                  className={cn(
                    "flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/50 active:bg-accent focus-visible:outline-none focus-visible:bg-accent",
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
                      {formatDistanceToNow(toDate(notification.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  
                  {/* Unread Indicator */}
                  {!notification.read && (
                    <div className="flex-shrink-0 mt-2">
                      <div className="h-3 w-3 rounded-full bg-primary" aria-label="Unread" />
                    </div>
                  )}
                </button>
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
