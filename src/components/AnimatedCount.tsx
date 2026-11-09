import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface AnimatedCountProps {
  value: number;
  format?: (n: number) => string;
  className?: string;
}

/**
 * A count that rolls when it changes, as on Instagram and Facebook: the new number slides up
 * into place when it goes up, down when it goes down. Still on first show and with reduce motion.
 */
const AnimatedCount = ({ value, format = String, className }: AnimatedCountProps) => {
  const previous = useRef(value);
  const mounted = useRef(false);
  const direction = value > previous.current ? "up" : value < previous.current ? "down" : null;
  useEffect(() => {
    previous.current = value;
    mounted.current = true;
  }, [value]);
  return (
    <span className={cn("inline-flex overflow-hidden tabular-nums", className)}>
      <span
        key={value}
        className={cn(
          mounted.current && direction && "motion-safe:animate-in motion-safe:fade-in-0 duration-300 [animation-timing-function:cubic-bezier(0.2,0,0,1)]",
          mounted.current && direction === "up" && "motion-safe:slide-in-from-bottom-3",
          mounted.current && direction === "down" && "motion-safe:slide-in-from-top-3",
        )}
      >
        {format(value)}
      </span>
    </span>
  );
};

export default AnimatedCount;
