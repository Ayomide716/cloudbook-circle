import { forwardRef, type SVGProps } from "react";
import { cn } from "@/lib/utils";

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
  strokeWidth?: number | string;
  /** Accepted for lucide compatibility; ignored. */
  absoluteStrokeWidth?: boolean;
}

/** The app's line weight (the design system's "1.9 line"). */
export const ICON_STROKE = 1.9;

const SOLID_CLASS = /(^|\s)fill-(?!none\b)/;

/**
 * An icon drawn from a Solar line body, or its solid body when filled. It takes the same props as a
 * lucide icon, so `fill="currentColor"` or a `fill-*` class switches to the solid shape, as for a
 * liked heart or the tab you're on.
 */
export function solarIcon(name: string, line: string, solid: string) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(
    ({ size = 24, strokeWidth = ICON_STROKE, absoluteStrokeWidth: _abs, fill, className, ...rest }, ref) => {
      const isSolid = (fill !== undefined && fill !== "none") || SOLID_CLASS.test(className ?? "");
      const body = isSolid ? solid : line.replace(/stroke-width="[\d.]+"/g, `stroke-width="${strokeWidth}"`);
      return (
        <svg
          ref={ref}
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={isSolid ? (fill ?? "currentColor") : "none"}
          aria-hidden={rest["aria-label"] ? undefined : true}
          className={cn("shrink-0", className)}
          {...rest}
          dangerouslySetInnerHTML={{ __html: body }}
        />
      );
    }
  );
  Icon.displayName = name;
  return Icon;
}
