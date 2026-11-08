import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "@/components/icons";

import { cn } from "@/lib/utils";

/**
 * Toasts are short dark bars with an optional text action like Undo. Phones: at the top, under
 * the status bar (swipe up to close), so they never cover the keyboard or the composer. Bigger
 * screens: bottom left, above any "Posting…" bar (--posting-space, set by PostingBar).
 */
// Swiped away towards the edge it sits at: up on phones (top), down on bigger screens (bottom).
const ToastProvider = ({ swipeDirection, duration = 4000, ...props }: React.ComponentProps<typeof ToastPrimitives.Provider>) => {
  const [phone, setPhone] = React.useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return <ToastPrimitives.Provider swipeDirection={swipeDirection ?? (phone ? "up" : "down")} duration={duration} {...props} />;
};

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed inset-x-0 z-[100] mx-auto flex w-full max-w-md flex-col gap-2 px-3 outline-none",
      // Phones: at the top, under the status bar, where it never covers the keyboard, the
      // composer or the tab bar.
      "top-[calc(env(safe-area-inset-top,0px)+0.5rem)]",
      // Bigger screens: bottom left, as on facebook.com.
      "md:inset-x-auto md:top-auto md:bottom-[calc(var(--posting-space,0px)+var(--offline-space,0px)+1.5rem)] md:left-6 md:mx-0 md:w-auto md:max-w-sm md:px-0",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  [
    "group pointer-events-auto relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.25)]",
    // Dark on light pages, a lighter grey on dark ones (as Facebook does), so it always stands out.
    "bg-[#1c1e21] text-white dark:bg-[#3a3b3c]",
    "transition-all data-[swipe=cancel]:translate-y-0 data-[swipe=end]:translate-y-[var(--radix-toast-swipe-end-y)] data-[swipe=move]:translate-y-[var(--radix-toast-swipe-move-y)] data-[swipe=move]:transition-none",
    "data-[state=open]:animate-in data-[state=open]:fade-in-0 max-md:data-[state=open]:slide-in-from-top-4 md:data-[state=open]:slide-in-from-bottom-4 data-[state=open]:duration-200",
    "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 max-md:data-[state=closed]:slide-out-to-top-2 md:data-[state=closed]:slide-out-to-bottom-2 data-[swipe=end]:animate-out data-[swipe=end]:fade-out-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "",
        // Problems look the same, with a red mark (Toaster adds the icon).
        destructive: "destructive group",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return <ToastPrimitives.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props} />;
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      // A text button, like Facebook's "Undo" / "View".
      "-mr-2 inline-flex h-9 shrink-0 items-center justify-center rounded-lg px-3 text-sm font-semibold text-[#FFB380] transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "-mr-1 shrink-0 rounded-full p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title ref={ref} className={cn("line-clamp-2 text-[15px] font-medium leading-snug", className)} {...props} />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description ref={ref} className={cn("line-clamp-2 text-[13px] leading-snug text-white/70", className)} {...props} />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
