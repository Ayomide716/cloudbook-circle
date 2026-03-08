import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
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
import Marketplace from "./pages/Marketplace";

const queryClient = new QueryClient();

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransition = {
  type: "tween" as const,
  ease: "easeInOut" as const,
  duration: 0.2,
};

const AnimatedPage = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    variants={pageVariants}
    initial="initial"
    animate="animate"
    exit="exit"
    transition={pageTransition}
  >
    {children}
  </motion.div>
);

const AppRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<AnimatedPage><Index /></AnimatedPage>} />
        <Route path="/auth" element={<AnimatedPage><Auth /></AnimatedPage>} />
        <Route path="/profile/:userId" element={<AnimatedPage><Profile /></AnimatedPage>} />
        <Route path="/messages" element={<AnimatedPage><Messages /></AnimatedPage>} />
        <Route path="/groups" element={<AnimatedPage><Groups /></AnimatedPage>} />
        <Route path="/groups/:groupId" element={<AnimatedPage><GroupDetail /></AnimatedPage>} />
        <Route path="/reels" element={<AnimatedPage><Reels /></AnimatedPage>} />
        <Route path="/notifications" element={<AnimatedPage><Notifications /></AnimatedPage>} />
        <Route path="/friends" element={<AnimatedPage><Friends /></AnimatedPage>} />
        <Route path="/events" element={<AnimatedPage><Events /></AnimatedPage>} />
        <Route path="/saved" element={<AnimatedPage><SavedPosts /></AnimatedPage>} />
        <Route path="/settings" element={<AnimatedPage><Settings /></AnimatedPage>} />
        <Route path="/marketplace" element={<AnimatedPage><Marketplace /></AnimatedPage>} />
        <Route path="*" element={<AnimatedPage><NotFound /></AnimatedPage>} />
      </Routes>
    </AnimatePresence>
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
