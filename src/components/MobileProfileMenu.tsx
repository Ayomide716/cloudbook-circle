import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { 
  User, 
  UserPlus, 
  Bookmark, 
  CalendarDays, 
  LogOut,
  Settings,
  Moon,
  Sun,
  Monitor,
  MonitorPlay,
  ShoppingBag,
  FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface MobileProfileMenuProps {
  currentUserId: string;
  pendingRequests: number;
}

const MobileProfileMenu = ({ currentUserId, pendingRequests }: MobileProfileMenuProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setTheme, theme } = useTheme();
  const [userProfile, setUserProfile] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadUserProfile();
  }, [currentUserId]);

  const loadUserProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", currentUserId)
      .single();
    if (data) setUserProfile(data);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Logged out successfully" });
    navigate("/auth");
  };

  const handleNavigate = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const menuItems = [
    { icon: User, label: "My Profile", path: `/profile/${currentUserId}` },
    { icon: UserPlus, label: "Friends", path: "/friends", badge: pendingRequests },
    { icon: MonitorPlay, label: "Watch", path: "/watch" },
    { icon: ShoppingBag, label: "Marketplace", path: "/marketplace" },
    { icon: Bookmark, label: "Saved Posts", path: "/saved" },
    { icon: CalendarDays, label: "Events", path: "/events" },
    { icon: Settings, label: "Notification Settings", path: "/settings" },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full p-0 overflow-hidden ring-2 ring-border"
        >
          <Avatar className="h-9 w-9">
            <AvatarImage src={userProfile?.avatar_url || undefined} />
            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-foreground font-medium text-sm">
              {userProfile?.full_name?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[280px] p-0">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center gap-3">
            <Avatar className="h-12 w-12 ring-2 ring-border">
              <AvatarImage src={userProfile?.avatar_url || undefined} />
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10">
                {userProfile?.full_name?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="text-left">
              <p className="font-semibold">{userProfile?.full_name || "User"}</p>
              <p className="text-xs text-muted-foreground font-normal">View your profile</p>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="p-2">
          {menuItems.map((item) => (
            <button
              key={item.path}
              onClick={() => handleNavigate(item.path)}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
            >
              <item.icon className="h-5 w-5 text-muted-foreground" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && item.badge > 0 && (
                <span className="bg-destructive text-destructive-foreground text-xs font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              )}
            </button>
          ))}

          <div className="border-t border-border my-2" />

          {/* Theme Selection */}
          <div className="p-3">
            <p className="text-sm font-medium mb-2">Theme</p>
            <div className="flex gap-2">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("light")}
                className="flex-1"
              >
                <Sun className="h-4 w-4 mr-1" />
                Light
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("dark")}
                className="flex-1"
              >
                <Moon className="h-4 w-4 mr-1" />
                Dark
              </Button>
              <Button
                variant={theme === "system" ? "default" : "outline"}
                size="icon"
                onClick={() => setTheme("system")}
              >
                <Monitor className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="border-t border-border my-2" />

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span>Log Out</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileProfileMenu;
