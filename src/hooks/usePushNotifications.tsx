import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { dbChannel } from "@/lib/realtime";

export const usePushNotifications = (userId: string | undefined) => {
  const { toast } = useToast();

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      console.log("This browser does not support notifications");
      return false;
    }

    if (Notification.permission === "granted") {
      return true;
    }

    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    }

    return false;
  }, []);

  const showNotification = useCallback((title: string, body: string, icon?: string) => {
    if (Notification.permission === "granted") {
      const notification = new Notification(title, {
        body,
        icon: icon || "/logo.png",
        badge: "/logo.png",
        tag: `ayo-chat-${Date.now()}`,
        requireInteraction: false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;

    // Request permission on mount
    requestPermission();

    // Listen for new notifications
    const notificationChannel = dbChannel("push-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notification = payload.new as { content: string; type: string };
          showNotification("CloudBook", notification.content);
        }
      )
      .subscribe();

    // Listen for new messages
    const messageChannel = dbChannel("push-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${userId}`,
        },
        async (payload) => {
          const message = payload.new as { sender_id: string; content: string };
          
          // Get sender info
          const { data: sender } = await supabase
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", message.sender_id)
            .single();

          showNotification(
            sender?.full_name || "New Message",
            message.content.substring(0, 100),
            sender?.avatar_url || undefined
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationChannel);
      supabase.removeChannel(messageChannel);
    };
  }, [userId, requestPermission, showNotification]);

  return { requestPermission, showNotification };
};
