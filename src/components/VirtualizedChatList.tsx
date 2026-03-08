import { useRef, useEffect, useCallback, useState, ReactNode } from "react";
import { VariableSizeList as List } from "react-window";

interface VirtualizedChatListProps {
  itemCount: number;
  renderItem: (index: number) => ReactNode;
  /** Estimated average row height */
  estimatedItemSize?: number;
  /** Height of the container in px */
  height: number;
  /** Width of the container */
  width: number;
  /** Extra content rendered after items (e.g. typing indicator) */
  footer?: ReactNode;
  /** Called when user scrolls near the top (for loading older messages) */
  onLoadMore?: () => void;
  /** Key that triggers scroll-to-bottom (e.g. messages.length) */
  scrollToBottomKey?: number | string;
  /** ID to scroll a specific item into view */
  scrollToIndex?: number;
  className?: string;
}

/**
 * A virtualized chat message list using react-window.
 * - Auto-measures row heights
 * - Sticks to bottom when new messages arrive
 * - Supports variable-height items
 */
const VirtualizedChatList = ({
  itemCount,
  renderItem,
  estimatedItemSize = 72,
  height,
  width,
  footer,
  onLoadMore,
  scrollToBottomKey,
  scrollToIndex,
  className,
}: VirtualizedChatListProps) => {
  const listRef = useRef<List>(null);
  const sizeCache = useRef<Map<number, number>>(new Map());
  const outerRef = useRef<HTMLDivElement>(null);
  const [isStuckToBottom, setIsStuckToBottom] = useState(true);
  const prevItemCount = useRef(itemCount);

  const getItemSize = useCallback(
    (index: number) => sizeCache.current.get(index) || estimatedItemSize,
    [estimatedItemSize]
  );

  // Measure a row and update cache
  const setRowHeight = useCallback((index: number, height: number) => {
    const prev = sizeCache.current.get(index);
    if (prev !== height) {
      sizeCache.current.set(index, height);
      listRef.current?.resetAfterIndex(index, false);
    }
  }, []);

  // Auto-scroll to bottom when new messages are added and user is at bottom
  useEffect(() => {
    if (itemCount > 0 && (isStuckToBottom || itemCount !== prevItemCount.current)) {
      // Small delay to let items render & measure
      requestAnimationFrame(() => {
        listRef.current?.scrollToItem(itemCount - 1, "end");
      });
    }
    prevItemCount.current = itemCount;
  }, [itemCount, scrollToBottomKey, isStuckToBottom]);

  // Scroll to specific index
  useEffect(() => {
    if (scrollToIndex !== undefined && scrollToIndex >= 0) {
      listRef.current?.scrollToItem(scrollToIndex, "center");
    }
  }, [scrollToIndex]);

  // Track if user is near bottom
  const handleScroll = useCallback(
    ({ scrollOffset, scrollUpdateWasRequested }: { scrollOffset: number; scrollUpdateWasRequested: boolean }) => {
      if (scrollUpdateWasRequested) return;
      const outer = outerRef.current;
      if (!outer) return;
      const atBottom = outer.scrollHeight - outer.scrollTop - outer.clientHeight < 80;
      setIsStuckToBottom(atBottom);

      // Load more when near top
      if (scrollOffset < 200 && onLoadMore) {
        onLoadMore();
      }
    },
    [onLoadMore]
  );

  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => (
      <div style={style}>
        <MeasuredRow index={index} setRowHeight={setRowHeight}>
          {renderItem(index)}
        </MeasuredRow>
      </div>
    ),
    [renderItem, setRowHeight]
  );

  return (
    <div className={className} style={{ height, width, position: "relative" }}>
      <List
        ref={listRef}
        outerRef={outerRef}
        height={height}
        width={width}
        itemCount={itemCount}
        itemSize={getItemSize}
        estimatedItemSize={estimatedItemSize}
        onScroll={handleScroll}
        overscanCount={8}
      >
        {Row}
      </List>
      {footer && (
        <div className="px-3 pb-2">
          {footer}
        </div>
      )}
    </div>
  );
};

/** Wrapper that measures its children and reports height back */
const MeasuredRow = ({
  index,
  setRowHeight,
  children,
}: {
  index: number;
  setRowHeight: (index: number, height: number) => void;
  children: ReactNode;
}) => {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rowRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        if (h > 0) setRowHeight(index, h);
      }
    });

    observer.observe(rowRef.current);
    // Measure immediately too
    const h = rowRef.current.getBoundingClientRect().height;
    if (h > 0) setRowHeight(index, h);

    return () => observer.disconnect();
  }, [index, setRowHeight]);

  return (
    <div ref={rowRef} className="px-3 sm:px-4 py-1">
      {children}
    </div>
  );
};

export default VirtualizedChatList;