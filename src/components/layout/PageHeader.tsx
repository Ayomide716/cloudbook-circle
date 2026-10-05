import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Buttons on the right, usually HeaderAction. */
  actions?: ReactNode;
  /** Search, chips or tabs under the title. */
  children?: ReactNode;
  className?: string;
}

/**
 * The top of a page, as in the redesign: a bold title with round buttons on the right.
 * On phones it is a full-width white section joined to the top bar; on bigger screens it
 * sits on the page background.
 */
export const PageHeader = ({ title, subtitle, actions, children, className }: PageHeaderProps) => (
  <section
    className={cn(
      "feed-section bg-card border-b border-border px-4 pt-3 pb-3 space-y-3",
      "sm:bg-transparent sm:border-0 sm:px-0 sm:pt-0 sm:pb-0 sm:mb-6 sm:space-y-4",
      className
    )}
  >
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
    {children}
  </section>
);

interface HeaderActionProps {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  /** The page's main action: teal with its label on bigger screens. */
  primary?: boolean;
  badge?: number;
}

/** A round grey button on phones; on bigger screens the main action also shows its label. */
export const HeaderAction = ({ icon: Icon, label, onClick, primary, badge }: HeaderActionProps) => (
  <Button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className={cn(
      "relative h-10 w-10 shrink-0 rounded-full p-0 bg-secondary text-foreground hover:bg-secondary/70",
      primary && "sm:w-auto sm:px-4 sm:bg-primary sm:text-primary-foreground sm:hover:bg-primary/90"
    )}
  >
    <Icon className="h-5 w-5 sm:h-4 sm:w-4" />
    {primary && <span className="hidden sm:inline">{label}</span>}
    {!!badge && badge > 0 && (
      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-destructive px-1 text-[10px] font-bold leading-[18px] text-destructive-foreground">
        {badge > 9 ? "9+" : badge}
      </span>
    )}
  </Button>
);

interface PageSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
}

/** The rounded grey search field used under page titles. */
export const PageSearch = ({ value, onChange, placeholder, label }: PageSearchProps) => (
  <div className="relative">
    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    <Input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label ?? placeholder}
      className="h-10 rounded-full border-0 bg-secondary pl-10 text-[15px] focus-visible:ring-1"
    />
  </div>
);

interface ChipsProps<T extends string> {
  options: { value: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

/** Teal filter chips, the same style as the feed's All / Friends / Digest. */
export function Chips<T extends string>({ options, value, onChange, label }: ChipsProps<T>) {
  return (
    <div role="group" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-hide sm:mx-0 sm:px-0">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors",
              active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-secondary"
            )}
          >
            {o.icon && <o.icon className="h-4 w-4" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
