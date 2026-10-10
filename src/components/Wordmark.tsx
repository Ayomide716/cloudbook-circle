import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** The name in the display font, lowercase, with a tangerine full stop: "ember." */
const Wordmark = ({ className }: { className?: string }) => (
  <span className={cn("font-display font-extrabold leading-none tracking-[-0.04em] text-foreground", className)}>
    {APP_NAME.toLowerCase()}
    <span className="text-primary">.</span>
  </span>
);

export default Wordmark;
