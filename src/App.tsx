import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import InstallPrompt from "@/components/InstallPrompt";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";

// Lazy-loaded page components
const Landing = lazy(() => import("./pages/Landing"));
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Profile = lazy(() => import("./pages/Profile"));
const Messages = lazy(() => import("./pages/Messages"));
const Groups = lazy(() => import("./pages/Groups"));
const GroupDetail = lazy(() => import("./pages/GroupDetail"));
const Reels = lazy(() => import("./pages/Reels"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Friends = lazy(() => import("./pages/Friends"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Events = lazy(() => import("./pages/Events"));
const SavedPosts = lazy(() => import("./pages/SavedPosts"));
const Settings = lazy(() => import("./pages/Settings"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const Watch = lazy(() => import("./pages/Watch"));
const Pages = lazy(() => import("./pages/Pages"));
const PageDetail = lazy(() => import("./pages/PageDetail"));
const Ads = lazy(() => import("./pages/Ads"));

// Lazy-loaded skeletons
const FeedSkeleton = lazy(() => import("./components/skeletons/FeedSkeleton"));
const MessagesSkeleton = lazy(() => import("./components/skeletons/MessagesSkeleton"));
const NotificationsSkeleton = lazy(() => import("./components/skeletons/NotificationsSkeleton"));
const ProfileSkeleton = lazy(() => import("./components/skeletons/ProfileSkeleton"));
const GroupsSkeleton = lazy(() => import("./components/skeletons/GroupsSkeleton"));
const EventsSkeleton = lazy(() => import("./components/skeletons/EventsSkeleton"));
const MarketplaceSkeleton = lazy(() => import("./components/skeletons/MarketplaceSkeleton"));
const WatchSkeleton = lazy(() => import("./components/skeletons/WatchSkeleton"));
const ReelsSkeleton = lazy(() => import("./components/skeletons/ReelsSkeleton"));
const FriendsSkeleton = lazy(() => import("./components/skeletons/FriendsSkeleton"));

const queryClient = new QueryClient();

// Spring-based page transitions
const pageVariants = {
  initial: { opacity: 0, y: 12, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.99 },
};

const pageTransition = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
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

const MiniFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      className="w-8 h-8 rounded-lg gradient-brand"
    />
  </div>
);

const PageFallback = () => {
  const location = useLocation();
  const path = location.pathname;

  const skeleton = (() => {
    if (path === "/" ) return <FeedSkeleton />;
    if (path === "/messages") return <MessagesSkeleton />;
    if (path === "/notifications") return <NotificationsSkeleton />;
    if (path.startsWith("/profile/")) return <ProfileSkeleton />;
    if (path === "/groups" || path.startsWith("/groups/")) return <GroupsSkeleton />;
    if (path === "/events") return <EventsSkeleton />;
    if (path === "/marketplace") return <MarketplaceSkeleton />;
    if (path === "/watch") return <WatchSkeleton />;
    if (path === "/reels") return <ReelsSkeleton />;
    if (path === "/friends") return <FriendsSkeleton />;
    return null;
  })();

  if (!skeleton) return <MiniFallback />;

  return (
    <Suspense fallback={<MiniFallback />}>
      {skeleton}
    </Suspense>
  );
};

const AppRoutes = () => {
  const location = useLocation();

  return (
    <Suspense fallback={<PageFallback />}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<AnimatedPage><Index /></AnimatedPage>} />
          <Route path="/landing" element={<AnimatedPage><Landing /></AnimatedPage>} />
          <Route path="/auth" element={<AnimatedPage><Auth /></AnimatedPage>} />
          <Route path="/profile/:userId" element={<AnimatedPage><Profile /></AnimatedPage>} />
          <Route path="/messages" element={<AnimatedPage><Messages /></AnimatedPage>} />
          <Route path="/groups" element={<AnimatedPage><Groups /></AnimatedPage>} />
          <Route path="/groups/:groupId" element={<AnimatedPage><GroupDetail /></AnimatedPage>} />
          <Route path="/reels" element={<AnimatedPage><Reels /></AnimatedPage>} />
          <Route path="/reels/:reelId" element={<AnimatedPage><Reels /></AnimatedPage>} />
          <Route path="/notifications" element={<AnimatedPage><Notifications /></AnimatedPage>} />
          <Route path="/friends" element={<AnimatedPage><Friends /></AnimatedPage>} />
          <Route path="/events" element={<AnimatedPage><Events /></AnimatedPage>} />
          <Route path="/saved" element={<AnimatedPage><SavedPosts /></AnimatedPage>} />
          <Route path="/settings" element={<AnimatedPage><Settings /></AnimatedPage>} />
          <Route path="/marketplace" element={<AnimatedPage><Marketplace /></AnimatedPage>} />
          <Route path="/watch" element={<AnimatedPage><Watch /></AnimatedPage>} />
          <Route path="/pages" element={<AnimatedPage><Pages /></AnimatedPage>} />
          <Route path="/pages/:pageId" element={<AnimatedPage><PageDetail /></AnimatedPage>} />
          <Route path="*" element={<AnimatedPage><NotFound /></AnimatedPage>} />
        </Routes>
      </AnimatePresence>
    </Suspense>
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
          <InstallPrompt />
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;