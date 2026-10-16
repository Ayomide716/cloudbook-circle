import { useEffect, useState } from "react";
import { Bell, BadgeCheck } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { toDate } from "@/lib/utils";
import { dbChannel } from "@/lib/realtime";

interface Notification {
  id: string;
  type: string;
  content: string;
  read: boolean | null;
  created_at: string | null;
  related_id: string | null;
}

interface NotificationsProps {
  userId: string;
}

const Notifications = ({ userId }: NotificationsProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const { toast } = useToast();

  const loadNotifications = useEffectEvent(async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      toast({
        title: "Error loading notifications",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setNotifications(data || []);
    setUnreadCount(data?.filter((n) => !n.read).length || 0);
  });

  const setupRealtimeSubscription = useEffectEvent(() => {
    const channel = dbChannel("notifications-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
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
    loadNotifications();
    return setupRealtimeSubscription();
  }, [userId, loadNotifications, setupRealtimeSubscription]);

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
      .eq("user_id", userId)
      .eq("read", false);

    loadNotifications();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full bg-secondary hover:bg-secondary/80 relative"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-xs rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-xs"
            >
              Mark all as read
            </Button>
          )}
        </div>
        <ScrollArea className="h-96">
          {notifications.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No notifications yet
            </p>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification, index) => (
                <div
                  key={notification.id}
                  className={`p-3 rounded-lg cursor-pointer transition-all duration-200 animate-fade-in ${
                    notification.read
                      ? "bg-background hover:bg-muted/50"
                      : notification.type === 'verification'
                        ? "bg-primary/10 hover:bg-primary/15 border border-primary/20"
                        : "bg-accent hover:bg-accent/80"
                  }`}
                  style={{ animationDelay: `${index * 40}ms`, animationFillMode: "forwards" }}
                  onClick={() => !notification.read && markAsRead(notification.id)}
                >
                  {notification.type === 'verification' && (
                    <span className="text-xs font-semibold text-primary flex items-center gap-1 mb-1"><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Verified</span>
                  )}
                  <p className="text-sm">{notification.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(toDate(notification.created_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default Notifications;