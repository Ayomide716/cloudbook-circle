import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import BlockedPeople from "@/components/BlockedPeople";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Bell, Heart, MessageCircle, UserPlus, Users, Share2, Smartphone, ArrowLeft, Sun, Moon, Monitor, LogOut, KeyRound, Mail, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
] as const;

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
  useSEO({ title: "Settings", description: "Your CloudBook account, appearance and notification settings." });
  const { theme, setTheme } = useTheme();
  const [email, setEmail] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Permanently deletes the account and everything in it (see delete_my_account in the migrations).
  const deleteAccount = async () => {
    if (deleteConfirm !== "DELETE") return;
    setDeleting(true);
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      setDeleting(false);
      toast({ title: "Couldn't delete your account", description: error.message, variant: "destructive" });
      return;
    }
    // The account is gone; just clear this device's session.
    await supabase.auth.signOut({ scope: "local" });
    toast({ title: "Your account has been deleted" });
    navigate("/auth", { replace: true });
  };
  const passwordError =
    newPassword && newPassword.length < 8 ? "At least 8 characters"
    : confirmPassword && confirmPassword !== newPassword ? "The passwords don't match"
    : null;

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || passwordError || newPassword !== confirmPassword) return;
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast({ title: "Couldn't change your password", description: error.message, variant: "destructive" });
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    toast({ title: "Password changed" });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };
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
      setEmail(session.user.email ?? null);
      
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
    if (Notification.permission === "denied") {
      toast({ title: "Notifications are blocked", description: "Allow them for this site in your browser's settings, then come back." });
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
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId || undefined} />
      <div className="max-w-[600px] mx-auto px-4 py-4 sm:py-6 pb-28 md:pb-8">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold font-display">Settings</h1>
        </div>

        {/* Appearance */}
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Appearance</h2>
        <Card className="p-4 mb-6">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t.value}
                role="radio"
                aria-checked={theme === t.value}
                onClick={() => setTheme(t.value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm font-medium transition-colors",
                  theme === t.value ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                <t.icon className="h-5 w-5" />
                {t.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Account */}
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Account</h2>
        <Card className="mb-6 divide-y divide-border overflow-hidden">
          {email && (
            <div className="flex items-center gap-3 p-4">
              <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                <Mail className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Email</p>
                <p className="text-xs text-muted-foreground truncate">{email}</p>
              </div>
            </div>
          )}
          <form className="p-4 space-y-3" onSubmit={changePassword}>
            <p className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4" /> Change password</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="new-password" className="text-xs">New password</Label>
                <Input id="new-password" type="password" autoComplete="new-password" className="mt-1" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="confirm-password" className="text-xs">Confirm it</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" className="mt-1" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
            </div>
            {passwordError && <p className="text-xs text-destructive" role="alert">{passwordError}</p>}
            <Button type="submit" size="sm" className="rounded-xl" disabled={savingPassword || !newPassword || !!passwordError || newPassword !== confirmPassword}>
              {savingPassword && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Update password
            </Button>
          </form>
          <button onClick={signOut} className="flex w-full items-center gap-3 p-4 text-left text-destructive hover:bg-destructive/5 transition-colors">
            <div className="h-9 w-9 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
              <LogOut className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium">Log out</span>
          </button>
        </Card>

        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notifications</h2>

        {/* Push Permission Banner */}
        {pushPermission !== "granted" && (
          <Card className="p-4 mb-4 border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{pushPermission === "denied" ? "Notifications are blocked" : "Turn on notifications"}</p>
                <p className="text-xs text-muted-foreground">
                  {pushPermission === "denied" ? "Allow them for this site in your browser's settings." : "Get notified even when the app isn't open"}
                </p>
              </div>
              <Button size="sm" variant={pushPermission === "denied" ? "outline" : "default"} onClick={requestPushPermission}>
                {pushPermission === "denied" ? "How?" : "Turn on"}
              </Button>
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
                aria-label={item.label}
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

        {currentUserId && (
          <>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-8">Blocked people</h2>
            <BlockedPeople userId={currentUserId} />
          </>
        )}

        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-8">Delete account</h2>
        <Card className="p-4 border-destructive/30">
          <p className="text-sm text-muted-foreground mb-3">
            Permanently delete your account, profile, posts, photos, messages and friendships. This can't be undone.
          </p>
          <Button variant="outline" className="rounded-xl text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive" onClick={() => { setDeleteConfirm(""); setDeleteOpen(true); }}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete my account
          </Button>
        </Card>

        <AlertDialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                Everything you've shared on CloudBook will be removed for good. Type <strong>DELETE</strong> to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div>
              <Label htmlFor="delete-confirm" className="sr-only">Type DELETE to confirm</Label>
              <Input id="delete-confirm" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="DELETE" autoComplete="off" autoCapitalize="characters" />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <Button variant="destructive" onClick={deleteAccount} disabled={deleting || deleteConfirm !== "DELETE"}>
                {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Delete account
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default Settings;
