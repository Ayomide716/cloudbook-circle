import { useEffect, useRef, useState, ReactElement, CSSProperties } from "react";
import { List, useDynamicRowHeight, useListRef, type RowComponentProps } from "react-window";
import { ChevronDown, Loader2 } from "lucide-react";

interface VirtualizedChatListProps {
  itemCount: number;
  renderItem: (index: number) => ReactElement | null;
  estimatedItemSize?: number;
  footer?: ReactElement | null;
  scrollToBottomKey?: number | string;
  /** The newest message is yours: scroll down to it even if you had scrolled up. */
  lastIsMine?: boolean;
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
    <div className="px-4 sm:px-5 py-px">
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
  lastIsMine,
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
  // Whether the reader is at (or near) the newest message, and how many arrived while they weren't.
  const atBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [unseen, setUnseen] = useState(0);

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

      // Scrolled up reading older messages: a new message from them doesn't pull you down
      // (the ↓ button counts it instead), as in WhatsApp.
      if (!isInitialLoad.current && !atBottomRef.current && !lastIsMine && itemCount > prevCount) {
        setUnseen((n) => n + (itemCount - prevCount));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lastIsMine is read with the new count
  }, [itemCount, scrollToBottomKey, canLoadMore, firstItemKey, listRef]);

  // Track whether the reader is near the bottom, for the ↓ button.
  useEffect(() => {
    const listEl = listRef.current?.element;
    if (!listEl) return;
    const onScroll = () => {
      const fromBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
      atBottomRef.current = fromBottom < 120;
      setShowJump(fromBottom > 300);
      if (atBottomRef.current) setUnseen(0);
    };
    listEl.addEventListener("scroll", onScroll, { passive: true });
    return () => listEl.removeEventListener("scroll", onScroll);
  }, [listRef, itemCount]);

  const jumpToBottom = () => {
    setUnseen(0);
    try {
      listRef.current?.scrollToRow({ index: itemCount - 1, align: "end", behavior: "smooth" });
    } catch {
      // The list may be re-rendering; the next tap will work.
    }
  };

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
      {(showJump || unseen > 0) && itemCount > 0 && (
        <button
          type="button"
          onClick={jumpToBottom}
          aria-label={unseen > 0 ? `${unseen} new ${unseen === 1 ? "message" : "messages"}, go to latest` : "Go to latest message"}
          className="absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
        >
          <ChevronDown className="h-5 w-5" />
          {unseen > 0 && (
            <span className="absolute -top-1.5 -left-1.5 min-w-[20px] h-5 rounded-full bg-primary px-1 text-[11px] font-bold leading-5 text-primary-foreground text-center">
              {unseen > 99 ? "99+" : unseen}
            </span>
          )}
        </button>
      )}
      {footer}
    </div>
  );
};

export default VirtualizedChatList;
