import { useEffect, useCallback, useRef, ReactElement, CSSProperties } from "react";
import { List, useDynamicRowHeight, useListRef, type RowComponentProps } from "react-window";
import { Loader2 } from "lucide-react";

interface VirtualizedChatListProps {
  itemCount: number;
  renderItem: (index: number) => ReactElement | null;
  estimatedItemSize?: number;
  footer?: ReactElement | null;
  scrollToBottomKey?: number | string;
  scrollToIndex?: number;
  /** Identity of the first item. If it changes when items are added, older items were prepended
   *  (keep the reader's position); otherwise new items were appended (scroll to the bottom). */
  firstItemKey?: string;
  /** Called when the user scrolls near the top — use for loading older messages */
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  className?: string;
  style?: CSSProperties;
}

interface RowProps {
  renderItem: (index: number) => ReactElement | null;
}

const RowComponent = ({ index, style, renderItem }: RowComponentProps<RowProps>) => (
  <div style={style} data-message-row={index}>
    <div className="px-3 sm:px-4 py-1">
      {renderItem(index)}
    </div>
  </div>
);

const VirtualizedChatList = ({
  itemCount,
  renderItem,
  estimatedItemSize = 72,
  footer,
  scrollToBottomKey,
  scrollToIndex,
  firstItemKey,
  onLoadMore,
  isLoadingMore,
  hasMore,
  className,
  style,
}: VirtualizedChatListProps) => {
  const listRef = useListRef(null);
  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: estimatedItemSize,
    key: itemCount,
  });
  const { observeRowElements } = dynamicRowHeight;
  // Only whether "load more" is enabled matters here; the callback itself is recreated by the parent on every render.
  const canLoadMore = !!onLoadMore;
  const prevCountRef = useRef(itemCount);
  const prevFirstKeyRef = useRef(firstItemKey);
  const isInitialLoad = useRef(true);

  // Scroll to bottom on initial load and new messages appended at bottom
  useEffect(() => {
    const prevCount = prevCountRef.current;
    const prevFirstKey = prevFirstKeyRef.current;
    prevCountRef.current = itemCount;
    prevFirstKeyRef.current = firstItemKey;

    if (itemCount > 0 && listRef.current) {
      // Older items were prepended (the first item changed): keep the reader's position.
      // A new message at the bottom keeps the same first item and falls through to scroll down.
      const prepended = firstItemKey !== undefined && prevFirstKey !== undefined && firstItemKey !== prevFirstKey;
      if (!isInitialLoad.current && itemCount > prevCount && canLoadMore && prepended) {
        const addedCount = itemCount - prevCount;
        // Scroll to the first "new-old" message to maintain position
        requestAnimationFrame(() => {
          try {
            listRef.current?.scrollToRow({
              index: addedCount,
              align: "start",
              behavior: "instant",
            });
          } catch {
            // Row may not exist yet if the list re-rendered in between.
          }
        });
        return;
      }

      isInitialLoad.current = false;
      const scrollToEnd = () => {
        try {
          listRef.current?.scrollToRow({
            index: itemCount - 1,
            align: "end",
            behavior: "instant",
          });
        } catch {
          // Row may not exist yet if the list re-rendered in between.
        }
      };
      requestAnimationFrame(scrollToEnd);
      // Again once new rows have been measured (images/voice players change heights).
      const settle = setTimeout(scrollToEnd, 150);
      return () => clearTimeout(settle);
    }
  }, [itemCount, scrollToBottomKey, canLoadMore, firstItemKey, listRef]);

  // Scroll to specific index (for message search highlight)
  useEffect(() => {
    if (scrollToIndex !== undefined && scrollToIndex >= 0 && listRef.current) {
      try {
        listRef.current.scrollToRow({
          index: scrollToIndex,
          align: "center",
          behavior: "smooth",
        });
      } catch {
        // Ignore out-of-range indexes from stale search results.
      }
    }
  }, [scrollToIndex, listRef]);

  // Detect scroll to top for loading more
  useEffect(() => {
    const listEl = listRef.current?.element;
    if (!listEl || !onLoadMore || !hasMore) return;

    const handleScroll = () => {
      if (listEl.scrollTop < 100 && !isLoadingMore && hasMore) {
        onLoadMore();
      }
    };

    listEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => listEl.removeEventListener("scroll", handleScroll);
  }, [onLoadMore, isLoadingMore, hasMore, itemCount, listRef]);

  // Observe row elements for dynamic sizing
  useEffect(() => {
    const listEl = listRef.current?.element;
    if (!listEl) return;

    const observer = new MutationObserver(() => {
      const rows = listEl.querySelectorAll("[data-message-row]");
      if (rows.length > 0) observeRowElements(rows);
    });

    observer.observe(listEl, { childList: true, subtree: true });
    const rows = listEl.querySelectorAll("[data-message-row]");
    if (rows.length > 0) observeRowElements(rows);

    return () => observer.disconnect();
  }, [itemCount, listRef, observeRowElements]);

  return (
    <div className={className} style={{ position: "relative", flex: 1, minHeight: 0, ...style }}>
      {isLoadingMore && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-card/90 backdrop-blur rounded-full px-3 py-1.5 shadow-md flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Loading older messages…</span>
        </div>
      )}
      <List
        listRef={listRef}
        rowCount={itemCount}
        rowHeight={dynamicRowHeight}
        rowComponent={RowComponent}
        rowProps={{ renderItem }}
        overscanCount={10}
        style={{ height: "100%", overflow: "auto" }}
      />
      {footer}
    </div>
  );
};

export default VirtualizedChatList;
