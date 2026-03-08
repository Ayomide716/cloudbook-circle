import { useEffect, useCallback, ReactElement, CSSProperties } from "react";
import { List, useDynamicRowHeight, useListRef, ListImperativeAPI } from "react-window";

interface VirtualizedChatListProps {
  /** Total number of messages */
  itemCount: number;
  /** Render function for each message */
  renderItem: (index: number) => ReactElement | null;
  /** Estimated average row height */
  estimatedItemSize?: number;
  /** Extra content rendered after the list (e.g. typing indicator) */
  footer?: ReactElement | null;
  /** Key that triggers scroll-to-bottom (e.g. messages.length) */
  scrollToBottomKey?: number | string;
  /** Index to scroll a specific item into view */
  scrollToIndex?: number;
  className?: string;
  style?: CSSProperties;
}

type RowProps = {
  renderItem: (index: number) => ReactElement | null;
};

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

/**
 * A virtualized chat message list using react-window v2.
 * - Uses useDynamicRowHeight for auto-measuring variable height messages
 * - Sticks to bottom when new messages arrive
 * - Supports scrolling to specific messages
 */
const VirtualizedChatList = ({
  itemCount,
  renderItem,
  estimatedItemSize = 72,
  footer,
  scrollToBottomKey,
  scrollToIndex,
  className,
  style,
}: VirtualizedChatListProps) => {
  const listRef = useListRef();
  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: estimatedItemSize,
    key: itemCount,
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (itemCount > 0 && listRef.current) {
      // Small delay to let measurements settle
      requestAnimationFrame(() => {
        try {
          listRef.current?.scrollToRow({
            index: itemCount - 1,
            align: "end",
            behavior: "instant",
          });
        } catch {
          // ignore range errors during mount
        }
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
      } catch {
        // ignore
      }
    }
  }, [scrollToIndex]);

  // Observe row elements for dynamic sizing
  useEffect(() => {
    const listEl = listRef.current?.element;
    if (!listEl) return;

    const observer = new MutationObserver(() => {
      const rows = listEl.querySelectorAll("[data-message-row]");
      if (rows.length > 0) {
        dynamicRowHeight.observeRowElements(rows);
      }
    });

    observer.observe(listEl, { childList: true, subtree: true });

    // Initial observation
    const rows = listEl.querySelectorAll("[data-message-row]");
    if (rows.length > 0) {
      dynamicRowHeight.observeRowElements(rows);
    }

    return () => observer.disconnect();
  }, [itemCount]);

  return (
    <div className={className} style={{ position: "relative", flex: 1, minHeight: 0, ...style }}>
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