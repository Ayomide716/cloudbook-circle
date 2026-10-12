import { useEffect, useState } from "react";
import AppVersionCard from "@/components/AppVersionCard";
import { isNative } from "@/lib/native/platform";
import { features } from "@/lib/features";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import BlockedPeople from "@/components/BlockedPeople";
import { playSound, setSoundsEnabled, soundsEnabled } from "@/lib/sounds";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Bell, Heart, MessageCircle, UserPlus, Users, Share2, Smartphone, ArrowLeft, ChevronRight, KeyRound, Mail, Trash2, Volume2 } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { disablePush, enablePush, needsHomeScreenInstall, pushActive, pushSupported } from "@/lib/web-push";
import { Skeleton } from "@/components/ui/skeleton";
import { RowSkeleton } from "@/components/skeletons/parts";

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
  useSEO({ title: "Settings", description: "Your Ember account, appearance and notification settings." });
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
  const [passwordOpen, setPasswordOpen] = useState(false);
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
    setPasswordOpen(false);
    toast({ title: "Password changed" });
  };

  useSEO({ title: "Settings", description: "Manage your Ember settings." });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [sounds, setSounds] = useState(soundsEnabled);
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  // Whether this phone is subscribed (allowed once doesn't mean it's saved for this account).
  const [pushOn, setPushOn] = useState(pushActive);

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
    if (needsHomeScreenInstall()) {
      toast({ title: "Add Ember to your Home Screen first", description: "On iPhone, tap Share then \"Add to Home Screen\", open Ember from there, and turn notifications on." });
      return;
    }
    if (Notification.permission === "denied") {
      toast({ title: "Notifications are blocked", description: "Allow them for this site in your browser's settings, then come back." });
      return;
    }
    try {
      const result = await enablePush();
      setPushPermission(Notification.permission);
      if (result === "on") {
        setPushOn(true);
        handleToggle("push_enabled", true);
      }
      else if (result === "unsupported") toast({ title: "Not supported", description: "This browser can't show notifications." });
    } catch {
      toast({ title: "Couldn't turn on notifications", description: "Try again in a moment.", variant: "destructive" });
    }
  };

  const prefItems = [
    { key: "likes" as const, label: "Likes", desc: "When someone likes your post", icon: Heart },
    { key: "comments" as const, label: "Comments", desc: "When someone comments on your post", icon: MessageCircle },
    { key: "friend_requests" as const, label: "Friend Requests", desc: "When someone sends you a friend request", icon: UserPlus },
    { key: "friend_accepted" as const, label: "Friend Accepted", desc: "When someone accepts your friend request", icon: Users },
    { key: "messages" as const, label: "Messages", desc: "When you receive a new message", icon: MessageCircle },
    { key: "shares" as const, label: "Shares", desc: "When someone shares your post", icon: Share2 },
  ];

  // Alerts on this device: on only when the browser allows them, this device is signed up, and
  // you haven't paused them for your account.
  const canPush = pushSupported() || needsHomeScreenInstall();
  const deviceOn = canPush && pushPermission === "granted" && pushOn && prefs.push_enabled;
  const deviceNote = isNative
    ? "Coming soon to the Android app"
    : !canPush
    ? "This browser can't show notifications"
    : pushPermission === "denied"
      ? "Blocked. Allow notifications for this site in your browser's settings"
      : needsHomeScreenInstall()
        ? "On iPhone, add Ember to your Home Screen first"
        : deviceOn
          ? "You'll get alerts even when Ember is closed"
          : "Off. Turn on to get alerts when Ember is closed";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        {/* The page's shape in grey while settings load, instead of a spinner. */}
        <div className="mx-auto max-w-[600px] space-y-6 px-4 py-4 sm:py-6" aria-busy="true">
          <h1 className="font-display text-[22px] font-bold tracking-tight sm:text-3xl">Settings</h1>
          {[3, 1, 6].map((rows, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24 rounded-full" />
              <div className="overflow-hidden rounded-2xl border bg-card">
                {Array.from({ length: rows }, (_, r) => <RowSkeleton key={r} avatar="h-9 w-9" lines={[45, 25]} />)}
              </div>
            </div>
          ))}
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
          <h1 className="text-[22px] sm:text-3xl font-bold font-display tracking-tight">Settings</h1>
        </div>

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
          {/* Change password: one row that opens a small window, instead of an open form. */}
          <button type="button" onClick={() => setPasswordOpen(true)} className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent/60">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-secondary">
              <KeyRound className="h-4 w-4" />
            </div>
            <span className="flex-1 text-sm font-medium">Change password</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </Card>

        <Card className="p-4 mb-6 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
            <Volume2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <Label htmlFor="in-app-sounds" className="font-medium text-sm">In-app sounds</Label>
            <p className="text-xs text-muted-foreground">Sounds when you like, post, send a message, or get a notification</p>
          </div>
          <Switch
            id="in-app-sounds"
            checked={sounds}
            onCheckedChange={(on) => { setSoundsEnabled(on); setSounds(on); if (on) playSound("like"); }}
          />
        </Card>

        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notifications</h2>

        {/* One switch for alerts on this phone, showing what's really true: on, off, blocked, or
            not possible here. The kinds of alert below only matter once it's on. */}
        <Card className="mb-4 flex items-center gap-3 p-4">
          <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
            <Smartphone className="h-4 w-4 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Notifications on this device</p>
            <p className="text-xs text-muted-foreground">{deviceNote}</p>
          </div>
          <Switch
            checked={deviceOn}
            onCheckedChange={async (on) => {
              if (on) { await requestPushPermission(); return; }
              await disablePush();
              setPushOn(false);
            }}
            aria-label="Notifications on this device"
            disabled={!canPush || pushPermission === "denied"}
          />
        </Card>

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

        {features.blocking && currentUserId && (
          <>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-8">Blocked people</h2>
            <BlockedPeople userId={currentUserId} />
          </>
        )}

        {isNative && (
          <>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-8">App</h2>
            <AppVersionCard />
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

        <Dialog open={passwordOpen} onOpenChange={(o) => { setPasswordOpen(o); if (!o) { setNewPassword(""); setConfirmPassword(""); } }}>
          <DialogContent className="max-w-sm rounded-3xl">
            <DialogHeader>
              <DialogTitle>Change password</DialogTitle>
              <DialogDescription>At least 8 characters. You'll stay signed in on this device.</DialogDescription>
            </DialogHeader>
            <form className="space-y-3" onSubmit={changePassword}>
              <div>
                <Label htmlFor="new-password" className="text-xs">New password</Label>
                <Input id="new-password" type="password" autoComplete="new-password" className="mt-1 h-11 rounded-xl" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
              </div>
              <div>
                <Label htmlFor="confirm-password" className="text-xs">Confirm it</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" className="mt-1 h-11 rounded-xl" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
              {passwordError && <p className="text-xs text-destructive" role="alert">{passwordError}</p>}
              <Button type="submit" className="h-11 w-full rounded-full" disabled={savingPassword || !newPassword || !!passwordError || newPassword !== confirmPassword}>
                {savingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update password
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                Everything you've shared on Ember will be removed for good. Type <strong>DELETE</strong> to confirm.
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
