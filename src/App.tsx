import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import SessionProvider from "@/components/SessionProvider";
import RequireAuth from "@/components/RequireAuth";
import ScrollToTop from "@/components/ScrollToTop";
import CallProvider from "@/components/calls/CallProvider";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";

// Shown after a delay, so it shouldn't weigh down the first load.
const InstallPrompt = lazy(() => import("@/components/InstallPrompt"));

// Lazy-loaded page components
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
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Explore = lazy(() => import("./pages/Explore"));

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

// Quick fade-in for each page. There is no exit animation, so the next page
// never waits for the previous one to animate out.
// (Plain CSS, so the animation library isn't needed before the first paint.)
const AnimatedPage = ({ children }: { children: React.ReactNode }) => (
  <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out">
    {children}
  </div>
);

/** Signed-in pages: wait for the session (showing the page skeleton), then render or redirect. */
const Protected = ({ children, redirectTo }: { children: React.ReactNode; redirectTo?: string }) => (
  <RequireAuth fallback={<PageFallback />} redirectTo={redirectTo}>
    <AnimatedPage>{children}</AnimatedPage>
  </RequireAuth>
);

const MiniFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 rounded-lg gradient-brand animate-spin" />
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
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Protected><Index /></Protected>} />
        {/* The marketing landing page was removed; keep old links working. */}
        <Route path="/landing" element={<Navigate to="/auth" replace />} />
        <Route path="/auth" element={<AnimatedPage><Auth /></AnimatedPage>} />
        <Route path="/profile/:userId" element={<Protected><Profile /></Protected>} />
        <Route path="/messages" element={<Protected><Messages /></Protected>} />
        <Route path="/groups" element={<Protected><Groups /></Protected>} />
        <Route path="/groups/:groupId" element={<Protected><GroupDetail /></Protected>} />
        <Route path="/reels" element={<Protected><Reels /></Protected>} />
        <Route path="/reels/:reelId" element={<Protected><Reels /></Protected>} />
        <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
        <Route path="/friends" element={<Protected><Friends /></Protected>} />
        <Route path="/events" element={<Protected><Events /></Protected>} />
        <Route path="/saved" element={<Protected><SavedPosts /></Protected>} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />
        <Route path="/marketplace" element={<Protected><Marketplace /></Protected>} />
        <Route path="/watch" element={<Protected><Watch /></Protected>} />
        <Route path="/pages" element={<Protected><Pages /></Protected>} />
        <Route path="/pages/:pageId" element={<Protected><PageDetail /></Protected>} />
        <Route path="/ads" element={<Protected><Ads /></Protected>} />
        <Route path="/admin" element={<Protected><AdminDashboard /></Protected>} />
        <Route path="/terms" element={<AnimatedPage><TermsOfService /></AnimatedPage>} />
        <Route path="/privacy" element={<AnimatedPage><PrivacyPolicy /></AnimatedPage>} />
        <Route path="/explore" element={<Protected><Explore /></Protected>} />
        <Route path="*" element={<AnimatedPage><NotFound /></AnimatedPage>} />
      </Routes>
    </Suspense>
  );
};

const App = () => {
  useKeyboardInset();

  return (
  <QueryClientProvider client={queryClient}>
    <SessionProvider>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <CallProvider>
            <AppRoutes />
          </CallProvider>
          <Suspense fallback={null}>
            <InstallPrompt />
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
    </SessionProvider>
  </QueryClientProvider>
  );
};

export default App;