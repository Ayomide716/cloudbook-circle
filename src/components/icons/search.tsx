import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import type { IconProps } from "./solar-icon";

/** Search is Phosphor Bold's magnifier (the design system's one exception to Solar). */
export const Search = forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, strokeWidth: _sw, absoluteStrokeWidth: _abs, className, ...rest }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden={rest["aria-label"] ? undefined : true}
      className={cn("shrink-0", className)}
      {...rest}
    >
      <path d="M232.49 215.51 185 168a92.12 92.12 0 1 0-17 17l47.53 47.54a12 12 0 0 0 17-17ZM44 112a68 68 0 1 1 68 68 68.07 68.07 0 0 1-68-68" />
    </svg>
  )
);
Search.displayName = "Search";
