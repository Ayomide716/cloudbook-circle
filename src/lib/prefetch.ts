// Route prefetch map - lazy import factories matching App.tsx
const routeModules: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/pages/Index"),
  "/auth": () => import("@/pages/Auth"),
  "/messages": () => import("@/pages/Messages"),
  "/groups": () => import("@/pages/Groups"),
  "/reels": () => import("@/pages/Reels"),
  "/notifications": () => import("@/pages/Notifications"),
  "/friends": () => import("@/pages/Friends"),
  "/events": () => import("@/pages/Events"),
  "/saved": () => import("@/pages/SavedPosts"),
  "/settings": () => import("@/pages/Settings"),
  "/marketplace": () => import("@/pages/Marketplace"),
  "/watch": () => import("@/pages/Watch"),
  "/pages": () => import("@/pages/Pages"),
};

const prefetched = new Set<string>();

export const prefetchRoute = (path: string) => {
  if (prefetched.has(path)) return;
  const loader = routeModules[path];
  if (loader) {
    prefetched.add(path);
    // Use requestIdleCallback for non-blocking prefetch
    const schedule = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 1));
    schedule(() => loader());
  }
};
