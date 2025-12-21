import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { User, Settings, LogOut, Bell, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
}

interface Profile {
  full_name: string | null;
  avatar_url: string | null;
}

const MobileMenu = ({ isOpen, onClose, currentUserId }: MobileMenuProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [friendRequestCount, setFriendRequestCount] = useState(0);

  useEffect(() => {
    if (currentUserId) {
      loadProfile();
      loadCounts();
    }
  }, [currentUserId]);

  const loadProfile = async () => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", currentUserId)
      .single();
    if (data) setProfile(data);
  };

  const loadCounts = async () => {
    if (!currentUserId) return;
    
    const { count: notifCount } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", currentUserId)
      .eq("read", false);
    
    const { count: friendCount } = await supabase
      .from("friendships")
      .select("*", { count: "exact", head: true })
      .eq("friend_id", currentUserId)
      .eq("status", "pending");
    
    setNotificationCount(notifCount || 0);
    setFriendRequestCount(friendCount || 0);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Logged out successfully" });
    navigate("/auth");
    onClose();
  };

  const navigateTo = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-80 p-0">
        <SheetHeader className="p-4 pb-0">
          <SheetTitle className="text-left">Menu</SheetTitle>
        </SheetHeader>
        
        {/* Profile Section */}
        {currentUserId && profile && (
          <div
            className="p-4 flex items-center gap-3 cursor-pointer hover:bg-accent transition-colors"
            onClick={() => navigateTo(`/profile/${currentUserId}`)}
          >
            <Avatar className="h-12 w-12">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="text-lg">
                {profile.full_name?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{profile.full_name || "Anonymous"}</p>
              <p className="text-sm text-muted-foreground">View your profile</p>
            </div>
          </div>
        )}

        <Separator />

        {/* Menu Items */}
        <div className="p-2">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-12"
            onClick={() => navigateTo(`/profile/${currentUserId}`)}
          >
            <User className="h-5 w-5" />
            Profile
          </Button>
          
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-12 relative"
            onClick={() => navigateTo("/notifications")}
          >
            <Bell className="h-5 w-5" />
            Notifications
            {notificationCount > 0 && (
              <span className="absolute right-4 bg-destructive text-destructive-foreground text-xs rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                {notificationCount}
              </span>
            )}
          </Button>
          
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-12 relative"
            onClick={() => navigateTo("/friend-requests")}
          >
            <UserPlus className="h-5 w-5" />
            Friend Requests
            {friendRequestCount > 0 && (
              <span className="absolute right-4 bg-destructive text-destructive-foreground text-xs rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                {friendRequestCount}
              </span>
            )}
          </Button>
        </div>

        <Separator />

        <div className="p-2">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-12 text-destructive hover:text-destructive"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5" />
            Log Out
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileMenu;