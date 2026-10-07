import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";

/**
 * A menu that is a bottom sheet on phones (big rows near your thumb, swipe down to close, as in
 * Facebook's and WhatsApp's apps) and the usual dropdown on bigger screens. Same parts as
 * DropdownMenu: ActionMenu, ActionMenuTrigger, ActionMenuContent, ActionMenuItem, ActionMenuSeparator.
 */

interface MenuState {
  sheet: boolean;
  setOpen: (open: boolean) => void;
}

const MenuContext = React.createContext<MenuState>({ sheet: false, setOpen: () => {} });

interface ActionMenuProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const ActionMenu = ({ children, open: openProp, onOpenChange }: ActionMenuProps) => {
  const sheet = useIsMobile();
  const [openState, setOpenState] = React.useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!controlled) setOpenState(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange]
  );
  const state = React.useMemo(() => ({ sheet, setOpen }), [sheet, setOpen]);

  return (
    <MenuContext.Provider value={state}>
      {sheet ? (
        <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
          {children}
        </Drawer>
      ) : (
        <DropdownMenu open={open} onOpenChange={setOpen}>
          {children}
        </DropdownMenu>
      )}
    </MenuContext.Provider>
  );
};

const ActionMenuTrigger = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof DropdownMenuTrigger>>(
  (props, ref) => {
    const { sheet } = React.useContext(MenuContext);
    return sheet ? <DrawerTrigger ref={ref} {...props} /> : <DropdownMenuTrigger ref={ref} {...props} />;
  }
);
ActionMenuTrigger.displayName = "ActionMenuTrigger";

interface ActionMenuContentProps {
  children: React.ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  /** Read out by screen readers when the sheet opens. */
  title?: string;
}

const ActionMenuContent = ({ children, className, align = "end", side, title = "Options" }: ActionMenuContentProps) => {
  const { sheet } = React.useContext(MenuContext);
  if (!sheet) {
    return (
      <DropdownMenuContent align={align} side={side} className={className}>
        {children}
      </DropdownMenuContent>
    );
  }
  return (
    <DrawerContent aria-describedby={undefined}>
      <DrawerTitle className="sr-only">{title}</DrawerTitle>
      <div role="menu" aria-label={title} className="flex flex-col px-2 pb-3 pt-2">
        {children}
      </div>
    </DrawerContent>
  );
};

type ItemEvent = Event | React.SyntheticEvent;

interface ActionMenuItemProps {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent) => void;
  /** Like DropdownMenuItem's: call event.preventDefault() to keep the menu open. */
  onSelect?: (event: ItemEvent) => void;
  asChild?: boolean;
}

const ActionMenuItem = React.forwardRef<HTMLButtonElement, ActionMenuItemProps>(
  ({ children, className, disabled, onClick, onSelect, asChild }, ref) => {
    const { sheet, setOpen } = React.useContext(MenuContext);
    if (!sheet) {
      return (
        <DropdownMenuItem className={className} disabled={disabled} onClick={onClick} onSelect={onSelect} asChild={asChild}>
          {children}
        </DropdownMenuItem>
      );
    }
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : "button"}
        role="menuitem"
        disabled={disabled}
        onClick={(e: React.MouseEvent) => {
          onClick?.(e);
          onSelect?.(e);
          if (!e.defaultPrevented) setOpen(false);
        }}
        className={cn(
          "flex min-h-12 w-full items-center gap-1 rounded-xl px-3 text-left text-[15px] font-medium transition-colors active:bg-secondary disabled:opacity-50",
          "[&_svg]:h-5 [&_svg]:w-5 [&_svg]:mr-2.5 [&_svg]:shrink-0",
          className
        )}
      >
        {children}
      </Comp>
    );
  }
);
ActionMenuItem.displayName = "ActionMenuItem";

const ActionMenuSeparator = ({ className }: { className?: string }) => {
  const { sheet } = React.useContext(MenuContext);
  return sheet ? <div role="separator" className={cn("mx-3 my-1.5 h-px bg-border", className)} /> : <DropdownMenuSeparator className={className} />;
};

export { ActionMenu, ActionMenuTrigger, ActionMenuContent, ActionMenuItem, ActionMenuSeparator };
