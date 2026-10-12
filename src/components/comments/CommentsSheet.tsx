import { useRef, useState, type ReactNode } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

interface CommentsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  /** The comment box, kept at the bottom of the sheet. */
  footer: ReactNode;
}

/**
 * Comments in a sheet from the bottom, as on TikTok and Instagram: it opens part-way, you pull
 * the top up for the full screen, and swipe it down to close.
 */
const CommentsSheet = ({ open, onOpenChange, title, children, footer }: CommentsSheetProps) => {
  const [expanded, setExpanded] = useState(false);
  const startY = useRef<number | null>(null);

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => { onOpenChange(next); if (!next) setExpanded(false); }}
      shouldScaleBackground={false}
    >
      <DrawerContent
        aria-describedby={undefined}
        className={cn(
          "mt-0 max-h-none transition-[height] duration-300 ease-out",
          expanded ? "h-[calc(96dvh-var(--keyboard-inset,0px))]" : "h-[calc(68dvh-var(--keyboard-inset,0px))]"
        )}
        style={{ bottom: "var(--keyboard-inset, 0px)" }}
      >
        {/* Pull this part up to make the sheet full height. */}
        <div
          className="relative flex items-center justify-center border-b border-border px-4 pb-2.5 pt-1.5"
          onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
          onTouchMove={(e) => {
            if (startY.current === null) return;
            if (!expanded && e.touches[0].clientY - startY.current < -30) { setExpanded(true); startY.current = null; }
          }}
          onTouchEnd={() => { startY.current = null; }}
        >
          <DrawerTitle className="text-[15px] font-semibold">{title}</DrawerTitle>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3" data-vaul-no-drag="">
          {children}
        </div>
        {/* no-drag: tapping the comment box must never start a swipe that closes the sheet. */}
        <div className="border-t border-border bg-card px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-2" data-vaul-no-drag="">{footer}</div>
      </DrawerContent>
    </Drawer>
  );
};

export default CommentsSheet;
