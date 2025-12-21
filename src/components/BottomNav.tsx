import { Home, Users, Film, MessageCircle, Menu } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  currentUserId?: string;
  onMenuClick: () => void;
}

const BottomNav = ({ currentUserId, onMenuClick }: BottomNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: Home, path: "/", label: "Home" },
    { icon: Users, path: "/groups", label: "Groups" },
    { icon: Film, path: "/reels", label: "Reels" },
    { icon: MessageCircle, path: "/messages", label: "Messages" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 md:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("h-6 w-6", isActive && "text-primary")} />
              <span className="text-[10px] mt-0.5">{item.label}</span>
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          );
        })}
        <button
          onClick={onMenuClick}
          className="flex flex-col items-center justify-center flex-1 h-full text-muted-foreground"
        >
          <Menu className="h-6 w-6" />
          <span className="text-[10px] mt-0.5">Menu</span>
        </button>
      </div>
    </nav>
  );
};

export default BottomNav;