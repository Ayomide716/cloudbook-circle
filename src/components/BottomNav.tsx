import { Home, Users, Film, MessageCircle, Menu } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  currentUserId?: string;
  onMenuClick?: () => void;
}

const BottomNav = ({ currentUserId, onMenuClick }: BottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: Home, path: "/", label: "Home" },
    { icon: Users, path: "/groups", label: "Groups" },
    { icon: Film, path: "/reels", label: "Reels" },
    { icon: MessageCircle, path: "/messages", label: "Chats" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border z-50 md:hidden">
      <div className="flex items-center justify-around h-16 px-1 safe-area-bottom">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full py-2 touch-target relative transition-colors active:scale-95",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-primary rounded-full" />
              )}
              <item.icon className={cn("h-6 w-6", isActive && "text-primary")} />
              <span className="text-[10px] mt-1 font-medium">{item.label}</span>
            </button>
          );
        })}
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="flex flex-col items-center justify-center flex-1 h-full py-2 touch-target text-muted-foreground active:scale-95 transition-transform"
          >
            <Menu className="h-6 w-6" />
            <span className="text-[10px] mt-1 font-medium">Menu</span>
          </button>
        )}
      </div>
    </nav>
  );
};

export default BottomNav;