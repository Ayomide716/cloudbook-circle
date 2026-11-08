import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "@/components/icons";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // The same dim as the other sheets (menus, comments), so every pop-up feels like one family.
      "fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/** Where a drag can't start: typing, sliders, horizontal scrollers, or anything marked no-drag. */
const noDrag = (el: EventTarget | null) =>
  el instanceof Element && !!el.closest("input, textarea, select, [contenteditable=true], [role=slider], [data-vaul-no-drag], .overflow-x-auto");

/**
 * Phones: a sheet from the bottom with a handle, that you can swipe down to close (from the top
 * of the sheet, or anywhere once it's scrolled to the top), like the menus and comments.
 */
function useSwipeToClose(closeRef: React.RefObject<HTMLButtonElement>) {
  // The sheet mounts after this component renders (in a portal, once it's open), so the
  // listeners are attached when its element appears rather than on first render.
  const [el, setEl] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!el) return;
    let startY = 0;
    let startT = 0;
    let dy = 0;
    let dragging = false;
    let armed = false;
    const phone = () => window.matchMedia("(max-width: 639px)").matches;
    const onStart = (e: TouchEvent) => {
      if (!phone() || e.touches.length !== 1 || noDrag(e.target)) return;
      const rect = el.getBoundingClientRect();
      const y = e.touches[0].clientY;
      // From the handle area, or anywhere while the sheet's content is at its top.
      armed = y - rect.top < 56 || el.scrollTop <= 0;
      startY = y;
      startT = Date.now();
      dy = 0;
      dragging = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!armed) return;
      dy = e.touches[0].clientY - startY;
      if (!dragging) {
        if (dy < 6) { if (dy < -6) armed = false; return; }
        // Pulling down while the content can still scroll up is a scroll, not a close.
        if (el.scrollTop > 0) { armed = false; return; }
        dragging = true;
        el.style.transition = "none";
      }
      e.preventDefault();
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };
    const onEnd = () => {
      if (!dragging) { armed = false; return; }
      const fast = dy > 40 && dy / Math.max(1, Date.now() - startT) > 0.5;
      el.style.transition = "transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)";
      if (dy > Math.min(140, el.offsetHeight * 0.3) || fast) {
        el.style.transform = `translateY(${el.offsetHeight}px)`;
        window.setTimeout(() => closeRef.current?.click(), 180);
      } else {
        el.style.transform = "";
      }
      dragging = false;
      armed = false;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [el, closeRef]);
  return setEl;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Hide the phone drag handle (full-screen composers have their own top bar). */
    hideHandle?: boolean;
  }
>(({ className, children, hideHandle, ...props }, ref) => {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const attachSwipe = useSwipeToClose(closeRef);
  const setContent = React.useCallback((node: HTMLDivElement | null) => {
    attachSwipe(node);
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [attachSwipe, ref]);
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={setContent}
        className={cn(
          "fixed left-0 right-0 bottom-[var(--keyboard-inset,0px)] z-50 grid w-full max-h-[calc(90dvh-var(--keyboard-inset,0px))] overflow-y-auto overscroll-contain gap-4 border bg-background p-4 sm:p-6 shadow-lg duration-200 rounded-t-3xl max-sm:pt-7 max-sm:pb-[calc(1rem+env(safe-area-inset-bottom,0px))] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:rounded-2xl sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]",
          className,
        )}
        {...props}
      >
        {!hideHandle && (
          <div className="pointer-events-none absolute left-1/2 top-2.5 h-1.5 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/30 sm:hidden" aria-hidden="true" />
        )}
        {children}
        <DialogPrimitive.Close
          ref={closeRef}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

/**
 * Classes for a dialog that fills the screen on phones (a composer: story, event), with the
 * title under the status bar and the close button beside it. Use with hideHandle.
 */
export const fullScreenOnPhones =
  "max-sm:top-0 max-sm:h-[calc(100dvh-var(--keyboard-inset,0px))] max-sm:max-h-none max-sm:content-start max-sm:rounded-none max-sm:border-0 max-sm:pt-[calc(env(safe-area-inset-top,0px)+1rem)] max-sm:[&>button:last-child]:top-[calc(env(safe-area-inset-top,0px)+0.5rem)]";

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

/**
 * The form's buttons. On phones they stay pinned to the bottom of the sheet (above the keyboard)
 * however long the form is, so Save is always in reach.
 */
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      "max-sm:sticky max-sm:-bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] max-sm:z-10 max-sm:-mx-4 max-sm:-mb-[calc(1rem+env(safe-area-inset-bottom,0px))] max-sm:border-t max-sm:border-border/60 max-sm:bg-background max-sm:px-4 max-sm:pt-3 max-sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] max-sm:[&>button]:h-11 max-sm:[&>button]:w-full max-sm:[&>button]:rounded-xl",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
