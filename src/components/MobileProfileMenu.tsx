import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
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
  Megaphone,
  Shield,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useEffectEvent } from "@/hooks/use-effect-event";

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

  const loadUserProfile = useEffectEvent(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", currentUserId)
      .single();
    if (data) setUserProfile(data);
  });

  useEffect(() => {
    loadUserProfile();
  }, [currentUserId, loadUserProfile]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Logged out successfully" });
    navigate("/auth");
  };

  const handleNavigate = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const menuSections = [
    {
      items: [
        { icon: User, label: "My Profile", path: `/profile/${currentUserId}`, color: "text-primary" },
        { icon: UserPlus, label: "Friends", path: "/friends", badge: pendingRequests, color: "text-blue-500" },
      ]
    },
    {
      items: [
        { icon: MonitorPlay, label: "Watch", path: "/watch", color: "text-red-500" },
        { icon: ShoppingBag, label: "Marketplace", path: "/marketplace", color: "text-emerald-500" },
        { icon: FileText, label: "Pages", path: "/pages", color: "text-orange-500" },
        { icon: Bookmark, label: "Saved Posts", path: "/saved", color: "text-amber-500" },
        { icon: CalendarDays, label: "Events", path: "/events", color: "text-purple-500" },
      ]
    },
    {
      items: [
        { icon: Megaphone, label: "Ad Manager", path: "/ads", color: "text-pink-500" },
        { icon: Shield, label: "Admin", path: "/admin", color: "text-slate-500" },
        { icon: Settings, label: "Settings", path: "/settings", color: "text-muted-foreground" },
      ]
    }
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
      <SheetContent side="right" className="w-[300px] p-0 flex flex-col">
        {/* Profile Header */}
        <div
          className="p-5 cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => handleNavigate(`/profile/${currentUserId}`)}
        >
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 ring-2 ring-primary/20 shadow-md">
              <AvatarImage src={userProfile?.avatar_url || undefined} />
              <AvatarFallback className="gradient-brand text-primary-foreground text-lg font-bold">
                {userProfile?.full_name?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base truncate">{userProfile?.full_name || "User"}</p>
              <p className="text-xs text-muted-foreground">View your profile</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </div>
        </div>

        <div className="h-px bg-border mx-4" />

        {/* Menu Items */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {menuSections.map((section, sIdx) => (
            <div key={sIdx}>
              {sIdx > 0 && <div className="h-px bg-border my-2 mx-1" />}
              {section.items.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleNavigate(item.path)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors group"
                >
                  <div className={cn("h-9 w-9 rounded-xl bg-accent/80 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform", item.color)}>
                    <item.icon className="h-[18px] w-[18px]" />
                  </div>
                  <span className="flex-1 text-left text-sm font-medium">{item.label}</span>
                  {item.badge && item.badge > 0 && (
                    <span className="bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-5 min-w-5 px-1.5 flex items-center justify-center">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Theme + Logout */}
        <div className="border-t border-border p-4 space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 px-1">Appearance</p>
            <div className="flex gap-1.5">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("light")}
                className="flex-1 h-8 text-xs rounded-lg"
              >
                <Sun className="h-3.5 w-3.5 mr-1" />
                Light
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("dark")}
                className="flex-1 h-8 text-xs rounded-lg"
              >
                <Moon className="h-3.5 w-3.5 mr-1" />
                Dark
              </Button>
              <Button
                variant={theme === "system" ? "default" : "outline"}
                size="icon"
                onClick={() => setTheme("system")}
                className="h-8 w-8 rounded-lg"
              >
                <Monitor className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-destructive/10 text-destructive transition-colors"
          >
            <LogOut className="h-[18px] w-[18px]" />
            <span className="text-sm font-medium">Log Out</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileProfileMenu;
