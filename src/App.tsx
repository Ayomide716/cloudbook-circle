import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect, useState, ReactNode } from "react";
 import { ThemeProvider } from "next-themes";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import Messages from "./pages/Messages";
import Groups from "./pages/Groups";
import GroupDetail from "./pages/GroupDetail";
import Reels from "./pages/Reels";
import Notifications from "./pages/Notifications";
import Friends from "./pages/Friends";
import NotFound from "./pages/NotFound";
 import Events from "./pages/Events";
import SavedPosts from "./pages/SavedPosts";
import Settings from "./pages/Settings";

const queryClient = new QueryClient();

// Page transition wrapper component
const PageTransition = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState("animate-fade-in");

  useEffect(() => {
    if (location !== displayLocation) {
      setTransitionStage("animate-fade-out");
    }
  }, [location, displayLocation]);

  const handleAnimationEnd = () => {
    if (transitionStage === "animate-fade-out") {
      setTransitionStage("animate-fade-in");
      setDisplayLocation(location);
    }
  };

  return (
    <div
      className={transitionStage}
      onAnimationEnd={handleAnimationEnd}
    >
      {children}
    </div>
  );
};

const AppRoutes = () => {
  const location = useLocation();
  
  return (
    <PageTransition>
      <Routes location={location}>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/profile/:userId" element={<Profile />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/groups/:groupId" element={<GroupDetail />} />
        <Route path="/reels" element={<Reels />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/friends" element={<Friends />} />
         <Route path="/events" element={<Events />} />
         <Route path="/saved" element={<SavedPosts />} />
         <Route path="/settings" element={<Settings />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </PageTransition>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
     <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
       <TooltipProvider>
         <Toaster />
         <Sonner />
         <BrowserRouter>
           <AppRoutes />
         </BrowserRouter>
       </TooltipProvider>
     </ThemeProvider>
  </QueryClientProvider>
);

export default App;
