import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
}

const PullToRefresh = ({ onRefresh, children, className }: PullToRefreshProps) => {
  const {
    containerRef,
    pullDistance,
    isRefreshing,
    pullProgress,
  } = usePullToRefresh({ onRefresh });

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-auto h-full", className)}
    >
      {/* Pull indicator */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center transition-opacity pointer-events-none z-10"
        style={{
          top: -50,
          transform: `translateY(${pullDistance}px)`,
          opacity: pullProgress,
        }}
      >
        <div className="bg-card rounded-full p-2 shadow-lg border border-border">
          <Loader2
            className={cn(
              "h-5 w-5 text-primary transition-transform",
              isRefreshing ? "animate-spin" : ""
            )}
            style={{
              transform: isRefreshing ? undefined : `rotate(${pullProgress * 360}deg)`,
            }}
          />
        </div>
      </div>

      {/* Content with pull transform */}
      <div
        className="transition-transform duration-100 ease-out"
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
