import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, User, LogOut, MessageCircle, Users, Film } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { lazy, Suspense } from "react";

const Notifications = lazy(() => import("./Notifications"));
const FriendRequests = lazy(() => import("./FriendRequests"));
const SearchUsers = lazy(() => import("./SearchUsers"));

interface NavigationProps {
  currentUserId?: string;
}

const Navigation = ({ currentUserId }: NavigationProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logged out successfully",
    });
    navigate("/auth");
  };

  return (
    <nav className="bg-primary text-primary-foreground shadow-md sticky top-0 z-50">
      <div className="container mx-auto px-2 sm:px-4">
        <div className="flex items-center justify-between h-12 sm:h-14">
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <h1 className="text-lg sm:text-2xl font-bold">AYO-CHAT</h1>
          </Link>
          
          <div className="flex items-center gap-0.5 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-primary-foreground hover:bg-primary-foreground/10 h-9 w-9 sm:h-10 sm:w-10 p-0"
              onClick={() => navigate("/")}
            >
              <Home className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            
            {currentUserId && (
              <>
                <Suspense fallback={<div className="w-9 sm:w-10" />}>
                  <SearchUsers />
                </Suspense>
                <Suspense fallback={<div className="w-9 sm:w-10" />}>
                  <FriendRequests userId={currentUserId} />
                </Suspense>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary-foreground hover:bg-primary-foreground/10 h-9 w-9 sm:h-10 sm:w-10 p-0"
                  onClick={() => navigate("/reels")}
                >
                  <Film className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary-foreground hover:bg-primary-foreground/10 h-9 w-9 sm:h-10 sm:w-10 p-0 hidden sm:flex"
                  onClick={() => navigate("/groups")}
                >
                  <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary-foreground hover:bg-primary-foreground/10 h-9 w-9 sm:h-10 sm:w-10 p-0"
                  onClick={() => navigate("/messages")}
                >
                  <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
                <Suspense fallback={<div className="w-9 sm:w-10" />}>
                  <Notifications userId={currentUserId} />
                </Suspense>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary-foreground hover:bg-primary-foreground/10 h-9 w-9 sm:h-10 sm:w-10 p-0"
                  onClick={() => navigate(`/profile/${currentUserId}`)}
                >
                  <User className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary-foreground hover:bg-primary-foreground/10 h-9 w-9 sm:h-10 sm:w-10 p-0 hidden sm:flex"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;