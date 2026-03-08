import { BadgeCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

const VerifiedBadge = ({ className, size = "sm" }: VerifiedBadgeProps) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <BadgeCheck
          className={cn(
            sizes[size],
            "text-primary fill-primary/20 inline-block flex-shrink-0",
            className
          )}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        Verified Account
      </TooltipContent>
    </Tooltip>
  );
};

export default VerifiedBadge;
