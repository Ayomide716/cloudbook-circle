import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import BottomNav from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2, Bell, Heart, MessageCircle, UserPlus, Users, Share2, Smartphone, ArrowLeft } from "lucide-react";

interface NotificationPrefs {
  likes: boolean;
  comments: boolean;
  friend_requests: boolean;
  friend_accepted: boolean;
  messages: boolean;
  shares: boolean;
  push_enabled: boolean;
}

const defaultPrefs: NotificationPrefs = {
  likes: true,
  comments: true,
  friend_requests: true,
  friend_accepted: true,
  messages: true,
  shares: true,
  push_enabled: true,
};

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  useSEO({ title: "Settings", description: "Manage your CloudBook settings." });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setCurrentUserId(session.user.id);
      
      if ("Notification" in window) {
        setPushPermission(Notification.permission);
      }

      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (data) {
        setPrefs({
          likes: data.likes,
          comments: data.comments,
          friend_requests: data.friend_requests,
          friend_accepted: data.friend_accepted,
          messages: data.messages,
          shares: data.shares,
          push_enabled: data.push_enabled,
        });
      }
      setIsLoading(false);
    };
    init();
  }, [navigate]);

  const handleToggle = async (key: keyof NotificationPrefs, value: boolean) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    setIsSaving(true);

    const { error } = await supabase
      .from("notification_preferences")
      .upsert({
        user_id: currentUserId!,
        ...updated,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    setIsSaving(false);
    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
      setPrefs({ ...prefs }); // revert
    }
  };

  const requestPushPermission = async () => {
    if (!("Notification" in window)) {
      toast({ title: "Not supported", description: "Your browser doesn't support push notifications" });
      return;
    }
    const permission = await Notification.requestPermission();
    setPushPermission(permission);
    if (permission === "granted") {
      handleToggle("push_enabled", true);
      toast({ title: "Push notifications enabled!" });
    } else {
      toast({ title: "Permission denied", description: "You can change this in browser settings", variant: "destructive" });
    }
  };

  const prefItems = [
    { key: "push_enabled" as const, label: "Push Notifications", desc: "Receive browser push notifications", icon: Smartphone },
    { key: "likes" as const, label: "Likes", desc: "When someone likes your post", icon: Heart },
    { key: "comments" as const, label: "Comments", desc: "When someone comments on your post", icon: MessageCircle },
    { key: "friend_requests" as const, label: "Friend Requests", desc: "When someone sends you a friend request", icon: UserPlus },
    { key: "friend_accepted" as const, label: "Friend Accepted", desc: "When someone accepts your friend request", icon: Users },
    { key: "messages" as const, label: "Messages", desc: "When you receive a new message", icon: MessageCircle },
    { key: "shares" as const, label: "Shares", desc: "When someone shares your post", icon: Share2 },
  ];

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
      <div className="max-w-[600px] mx-auto px-4 py-4 sm:py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold">Notification Settings</h1>
        </div>

        {/* Push Permission Banner */}
        {pushPermission !== "granted" && (
          <Card className="p-4 mb-4 border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Enable Push Notifications</p>
                <p className="text-xs text-muted-foreground">Get notified even when the app isn't open</p>
              </div>
              <Button size="sm" onClick={requestPushPermission}>Enable</Button>
            </div>
          </Card>
        )}

        <Card className="divide-y divide-border overflow-hidden">
          {prefItems.map((item) => (
            <div key={item.key} className="flex items-center gap-3 p-4">
              <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                <item.icon className="h-4 w-4 text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch
                checked={prefs[item.key]}
                onCheckedChange={(val) => handleToggle(item.key, val)}
                disabled={isSaving}
              />
            </div>
          ))}
        </Card>

        {isSaving && (
          <p className="text-xs text-muted-foreground text-center mt-3 flex items-center justify-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving...
          </p>
        )}
      </div>
      <BottomNav currentUserId={currentUserId || undefined} />
    </div>
  );
};

export default Settings;
