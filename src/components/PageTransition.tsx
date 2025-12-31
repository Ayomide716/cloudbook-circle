import { useEffect, useState, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PageTransitionProps {
  children: ReactNode;
}

const PageTransition = ({ children }: PageTransitionProps) => {
  const location = useLocation();
  const [displayChildren, setDisplayChildren] = useState(children);
  const [transitionStage, setTransitionStage] = useState<"enter" | "exit">("enter");

  useEffect(() => {
    if (children !== displayChildren) {
      setTransitionStage("exit");
    }
  }, [children, displayChildren]);

  const handleTransitionEnd = () => {
    if (transitionStage === "exit") {
      setDisplayChildren(children);
      setTransitionStage("enter");
    }
  };

  return (
    <div
      className={cn(
        "transition-all duration-200 ease-out",
        transitionStage === "enter" && "opacity-100 translate-y-0",
        transitionStage === "exit" && "opacity-0 translate-y-2"
      )}
      onTransitionEnd={handleTransitionEnd}
    >
      {displayChildren}
    </div>
  );
};

export default PageTransition;
