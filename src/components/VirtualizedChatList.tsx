import { useEffect, useCallback, useRef, ReactElement, CSSProperties } from "react";
import { List, useDynamicRowHeight, useListRef } from "react-window";
import { Loader2 } from "lucide-react";

interface VirtualizedChatListProps {
  itemCount: number;
  renderItem: (index: number) => ReactElement | null;
  estimatedItemSize?: number;
  footer?: ReactElement | null;
  scrollToBottomKey?: number | string;
  scrollToIndex?: number;
  /** Called when the user scrolls near the top — use for loading older messages */
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  className?: string;
  style?: CSSProperties;
}

const RowComponent = ({
  index,
  style,
  renderItem,
}: {
  ariaAttributes: { "aria-posinset": number; "aria-setsize": number; role: "listitem" };
  index: number;
  style: CSSProperties;
  renderItem: (index: number) => ReactElement | null;
}) => (
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
  onLoadMore,
  isLoadingMore,
  hasMore,
  className,
  style,
}: VirtualizedChatListProps) => {
  const listRef = useListRef();
  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: estimatedItemSize,
    key: itemCount,
  });
  const prevCountRef = useRef(itemCount);
  const isInitialLoad = useRef(true);

  // Scroll to bottom on initial load and new messages appended at bottom
  useEffect(() => {
    const prevCount = prevCountRef.current;
    prevCountRef.current = itemCount;

    if (itemCount > 0 && listRef.current) {
      // If items were prepended (loading older), maintain scroll position
      if (!isInitialLoad.current && itemCount > prevCount && onLoadMore) {
        const addedCount = itemCount - prevCount;
        // Scroll to the first "new-old" message to maintain position
        requestAnimationFrame(() => {
          try {
            listRef.current?.scrollToRow({
              index: addedCount,
              align: "start",
              behavior: "instant",
            });
          } catch {}
        });
        return;
      }

      isInitialLoad.current = false;
      requestAnimationFrame(() => {
        try {
          listRef.current?.scrollToRow({
            index: itemCount - 1,
            align: "end",
            behavior: "instant",
          });
        } catch {}
      });
    }
  }, [itemCount, scrollToBottomKey]);

  // Scroll to specific index (for message search highlight)
  useEffect(() => {
    if (scrollToIndex !== undefined && scrollToIndex >= 0 && listRef.current) {
      try {
        listRef.current.scrollToRow({
          index: scrollToIndex,
          align: "center",
          behavior: "smooth",
        });
      } catch {}
    }
  }, [scrollToIndex]);

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
  }, [onLoadMore, isLoadingMore, hasMore, itemCount]);

  // Observe row elements for dynamic sizing
  useEffect(() => {
    const listEl = listRef.current?.element;
    if (!listEl) return;

    const observer = new MutationObserver(() => {
      const rows = listEl.querySelectorAll("[data-message-row]");
      if (rows.length > 0) dynamicRowHeight.observeRowElements(rows);
    });

    observer.observe(listEl, { childList: true, subtree: true });
    const rows = listEl.querySelectorAll("[data-message-row]");
    if (rows.length > 0) dynamicRowHeight.observeRowElements(rows);

    return () => observer.disconnect();
  }, [itemCount]);

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
        rowProps={{ renderItem } as any}
        overscanCount={10}
        style={{ height: "100%", overflow: "auto" }}
      />
      {footer}
    </div>
  );
};

export default VirtualizedChatList;
