import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, User, LogOut, MessageCircle, Users, Film, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { lazy, Suspense, useState } from "react";
import BottomNav from "./BottomNav";
import MobileMenu from "./MobileMenu";
import { cn } from "@/lib/utils";

const Notifications = lazy(() => import("./Notifications"));
const FriendRequests = lazy(() => import("./FriendRequests"));
const SearchUsers = lazy(() => import("./SearchUsers"));

interface NavigationProps {
  currentUserId?: string;
}

const Navigation = ({ currentUserId }: NavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Logged out successfully" });
    navigate("/auth");
  };

  const isActive = (path: string) => location.pathname === path;

  const desktopNavItems = [
    { icon: Home, path: "/", label: "Home" },
    { icon: Users, path: "/groups", label: "Groups" },
    { icon: Film, path: "/reels", label: "Reels" },
    { icon: MessageCircle, path: "/messages", label: "Messages" },
  ];

  return (
    <>
      {/* Desktop Header */}
      <nav className="bg-card border-b border-border shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link to="/" className="flex items-center flex-shrink-0">
              <h1 className="text-xl sm:text-2xl font-bold text-primary">AYO-CHAT</h1>
            </Link>

            {/* Desktop Center Navigation */}
            <div className="hidden md:flex items-center justify-center flex-1 max-w-xl mx-8">
              {desktopNavItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "flex items-center justify-center px-8 py-2 mx-1 rounded-lg transition-colors relative",
                    isActive(item.path)
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  <item.icon className="h-6 w-6" />
                  {isActive(item.path) && (
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-0.5 bg-primary rounded-t-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Right Side Icons */}
            <div className="flex items-center gap-1 sm:gap-2">
              {currentUserId && (
                <>
                  {/* Search - Always visible */}
                  <Suspense fallback={<div className="w-10 h-10" />}>
                    <SearchUsers />
                  </Suspense>

                  {/* Desktop only icons */}
                  <div className="hidden md:flex items-center gap-1">
                    <Suspense fallback={<div className="w-10 h-10" />}>
                      <FriendRequests userId={currentUserId} />
                    </Suspense>
                    <Suspense fallback={<div className="w-10 h-10" />}>
                      <Notifications userId={currentUserId} />
                    </Suspense>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-full bg-secondary hover:bg-secondary/80"
                      onClick={() => navigate(`/profile/${currentUserId}`)}
                    >
                      <User className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-full bg-secondary hover:bg-secondary/80"
                      onClick={handleLogout}
                    >
                      <LogOut className="h-5 w-5" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      {currentUserId && (
        <>
          <BottomNav
            currentUserId={currentUserId}
            onMenuClick={() => setMobileMenuOpen(true)}
          />
          <MobileMenu
            isOpen={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            currentUserId={currentUserId}
          />
        </>
      )}
    </>
  );
};

export default Navigation;