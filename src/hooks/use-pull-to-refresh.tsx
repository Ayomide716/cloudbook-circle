import { useState, useRef, useEffect } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPullDistance?: number;
}

export const usePullToRefresh = ({
  onRefresh,
  threshold = 80,
  maxPullDistance = 120,
}: UsePullToRefreshOptions) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // The page itself scrolls (not this container), so "at the top" means the window is.
  const atTop = () => (window.scrollY || document.documentElement.scrollTop) <= 0;
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  refreshingRef.current = isRefreshing;
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Only while a pull is possible (a touch that started at the very top) does a
    // non-passive move listener exist; the rest of the time scrolling never waits on us.
    const onMove = (e: TouchEvent) => {
      if (!isPulling.current || refreshingRef.current) return;
      const diff = e.touches[0].clientY - startY.current;
      if (diff <= 0 || !atTop()) {
        // Moving up, or the page has scrolled: this isn't a pull.
        isPulling.current = false;
        pullRef.current = 0;
        setPullDistance(0);
        stopListening();
        return;
      }
      const distance = Math.min(diff * 0.5, maxPullDistance);
      pullRef.current = distance;
      setPullDistance(distance);
      if (distance > 10 && e.cancelable) e.preventDefault();
    };
    const stopListening = () => container.removeEventListener("touchmove", onMove);

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1 || !atTop()) return;
      startY.current = e.touches[0].clientY;
      isPulling.current = true;
      pullRef.current = 0;
      container.addEventListener("touchmove", onMove, { passive: false });
    };

    const onEnd = async () => {
      stopListening();
      if (!isPulling.current) return;
      isPulling.current = false;
      if (pullRef.current >= threshold && !refreshingRef.current) {
        setIsRefreshing(true);
        setPullDistance(threshold);
        try {
          await onRefreshRef.current();
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
      pullRef.current = 0;
    };

    container.addEventListener("touchstart", onStart, { passive: true });
    container.addEventListener("touchend", onEnd, { passive: true });
    container.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      stopListening();
      container.removeEventListener("touchstart", onStart);
      container.removeEventListener("touchend", onEnd);
      container.removeEventListener("touchcancel", onEnd);
    };
  }, [threshold, maxPullDistance]);

  return {
    containerRef,
    pullDistance,
    isRefreshing,
    isPullingDown: pullDistance > 0,
    pullProgress: Math.min(pullDistance / threshold, 1),
  };
};
