import { useCallback, useEffect, useLayoutEffect, useRef, useState, ReactElement, CSSProperties } from "react";
import { ChevronDown, Loader2 } from "@/components/icons";

interface ChatListProps {
  itemCount: number;
  renderItem: (index: number) => ReactElement | null;
  /** A stable key for each row (its message's id), so rows keep their place when older ones load. */
  itemKey?: (index: number) => string;
  /** @deprecated rows are measured as they are; kept so callers don't break. */
  estimatedItemSize?: number;
  footer?: ReactElement | null;
  scrollToBottomKey?: number | string;
  /** The newest message is yours: scroll down to it even if you had scrolled up. */
  lastIsMine?: boolean;
  scrollToIndex?: number;
  /** Open at this row (the first unread message) instead of the newest, as on WhatsApp. */
  startAtIndex?: number;
  /** The day label for a row ("Today", "12 March"), floated at the top while scrolling. */
  dayLabelAt?: (index: number) => string | null;
  /** Identity of the first item; when it changes as items are added, older ones were added on top. */
  firstItemKey?: string;
  /** Called when the reader nears the top: load older messages. */
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * A chat's messages, scrolling the way WhatsApp's do:
 * - What you're reading stays exactly where it is: when older messages load above it, photos
 *   above it finish loading, or new messages arrive below it. (The browser's own scroll
 *   anchoring, plus a correction when older messages are added.) Every row is a real,
 *   measured element, so nothing is guessed and nothing jumps while you scroll up.
 * - At the bottom you stay at the bottom as messages arrive; scrolled up, the ↓ button counts
 *   what came in instead of pulling you down.
 * - Older messages load quietly as you near the top, with no banner over the day label.
 */
const VirtualizedChatList = ({
  itemCount,
  renderItem,
  itemKey,
  footer,
  scrollToBottomKey,
  lastIsMine,
  scrollToIndex,
  startAtIndex,
  dayLabelAt,
  firstItemKey,
  onLoadMore,
  isLoadingMore,
  hasMore,
  className,
  style,
}: ChatListProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const opened = useRef(false);
  const prevCount = useRef(itemCount);
  const prevFirstKey = useRef(firstItemKey);
  const [showJump, setShowJump] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [floatingDay, setFloatingDay] = useState<string | null>(null);
  const dayLabelRef = useRef(dayLabelAt);
  dayLabelRef.current = dayLabelAt;
  const loadMoreRef = useRef(onLoadMore);
  loadMoreRef.current = onLoadMore;

  const rowEl = (index: number) => scrollRef.current?.querySelector<HTMLElement>(`[data-message-row="${index}"]`) ?? null;
  const toBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    atBottom.current = true;
    // While it glides down, it still counts as at the bottom (a photo loading meanwhile follows).
    pinnedUntil.current = Date.now() + 700;
  }, []);
  const pinnedUntil = useRef(0);

  // Older messages added on top: before the change, note where the first row you can see is…
  const anchor = useRef<{ key: string; top: number } | null>(null);
  const el = scrollRef.current;
  if (el && firstItemKey !== prevFirstKey.current && itemCount > prevCount.current) {
    const rows = Array.from(el.querySelectorAll<HTMLElement>("[data-row-key]"));
    const box = el.getBoundingClientRect();
    const first = rows.find((r) => r.getBoundingClientRect().bottom > box.top);
    anchor.current = first ? { key: first.dataset.rowKey!, top: first.getBoundingClientRect().top } : null;
  }

  // …and after it, put it back there (the browser can't anchor at the very top of the list).
  useLayoutEffect(() => {
    const box = scrollRef.current;
    const prepended = firstItemKey !== prevFirstKey.current && itemCount > prevCount.current && prevCount.current > 0;
    const appended = itemCount > prevCount.current && !prepended;
    const added = itemCount - prevCount.current;
    prevCount.current = itemCount;
    prevFirstKey.current = firstItemKey;
    if (!box || itemCount === 0) return;

    if (!opened.current) {
      // Opening the chat: at the first unread message, else at the newest.
      opened.current = true;
      const start = startAtIndex !== undefined && startAtIndex > 0 ? rowEl(startAtIndex) : null;
      if (start) {
        box.scrollTop = start.offsetTop - 8;
        atBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      } else toBottom();
      return;
    }
    if (prepended && anchor.current) {
      const same = box.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(anchor.current.key)}"]`);
      if (same) box.scrollTop += same.getBoundingClientRect().top - anchor.current.top;
      anchor.current = null;
      return;
    }
    if (appended) {
      if (atBottom.current || lastIsMine) toBottom(true);
      else setUnseen((n) => n + added);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs as rows come and go
  }, [itemCount, firstItemKey, scrollToBottomKey]);

  // Stay at the bottom while things there grow (a photo loading, the keyboard opening, the
  // typing bubble), but only while you're at the bottom.
  useEffect(() => {
    const box = scrollRef.current;
    const content = box?.firstElementChild;
    if (!box || !content || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (atBottom.current) box.scrollTop = box.scrollHeight; });
    ro.observe(box);
    ro.observe(content);
    return () => ro.disconnect();
  }, [itemCount > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scrolling: are you at the bottom; near the top (load older); which day is at the top.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    let dayTimer: ReturnType<typeof setTimeout> | undefined;
    let userScrolling = false;
    const onTouch = () => { userScrolling = true; };
    const onScroll = () => {
      const fromBottom = box.scrollHeight - box.scrollTop - box.clientHeight;
      atBottom.current = fromBottom < 80 || Date.now() < pinnedUntil.current;
      setShowJump(fromBottom > 300);
      if (atBottom.current) setUnseen(0);
      if (box.scrollTop < 600 && hasMoreRef.current && !loadingRef.current) loadMoreRef.current?.();
      if (userScrolling && dayLabelRef.current) {
        const top = box.getBoundingClientRect().top;
        const row = Array.from(box.querySelectorAll<HTMLElement>("[data-message-row]")).find((r) => r.getBoundingClientRect().bottom > top + 8);
        setFloatingDay(row ? dayLabelRef.current(Number(row.dataset.messageRow)) : null);
        clearTimeout(dayTimer);
        dayTimer = setTimeout(() => setFloatingDay(null), 1200);
      }
    };
    box.addEventListener("scroll", onScroll, { passive: true });
    box.addEventListener("touchstart", onTouch, { passive: true });
    box.addEventListener("wheel", onTouch, { passive: true });
    return () => {
      clearTimeout(dayTimer);
      box.removeEventListener("scroll", onScroll);
      box.removeEventListener("touchstart", onTouch);
      box.removeEventListener("wheel", onTouch);
    };
  }, []);
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const loadingRef = useRef(isLoadingMore);
  loadingRef.current = isLoadingMore;

  // Going to a message (search, starred, a pinned message, a quote).
  useEffect(() => {
    if (scrollToIndex === undefined || scrollToIndex < 0) return;
    rowEl(scrollToIndex)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [scrollToIndex]);

  const jumpToBottom = () => { setUnseen(0); toBottom(true); };

  return (
    <div className={className} style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", ...style }}>
      {floatingDay && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center animate-in fade-in-0 duration-150">
          <span className="rounded-lg bg-card/95 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur dark:bg-[#1c2530]/95">{floatingDay}</span>
        </div>
      )}
      <div
        ref={scrollRef}
        className="chat-scroller min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:auto]"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        <div className="flex min-h-full flex-col justify-end py-1">
          {/* Older messages loading: a small spinner in the list, not a banner over the day. */}
          {hasMore && (
            <div className="flex h-10 items-center justify-center" aria-label={isLoadingMore ? "Loading older messages" : undefined}>
              {isLoadingMore && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </div>
          )}
          {Array.from({ length: itemCount }, (_, i) => (
            <div key={itemKey ? itemKey(i) : i} data-message-row={i} data-row-key={itemKey ? itemKey(i) : String(i)} className="px-4 py-px sm:px-5">
              {renderItem(i)}
            </div>
          ))}
          {footer}
        </div>
      </div>
      {(showJump || unseen > 0) && itemCount > 0 && (
        <button
          type="button"
          onClick={jumpToBottom}
          aria-label={unseen > 0 ? `${unseen} new ${unseen === 1 ? "message" : "messages"}, go to latest` : "Go to latest message"}
          className="absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
        >
          <ChevronDown className="h-5 w-5" />
          {unseen > 0 && (
            <span className="absolute -top-1.5 -left-1.5 min-w-[20px] h-5 rounded-full bg-badge px-1 text-[11px] font-bold leading-5 text-white text-center">
              {unseen > 99 ? "99+" : unseen}
            </span>
          )}
        </button>
      )}
    </div>
  );
};

export default VirtualizedChatList;
