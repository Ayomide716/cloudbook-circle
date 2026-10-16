import { Moon, Sun, Monitor } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { fadeTheme } from "@/lib/theme-fade";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ThemeToggle = () => {
  const { setTheme, theme } = useTheme();

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const label = theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fadeTheme(cycleTheme)}
          className="h-10 w-10 rounded-full bg-secondary/70 hover:bg-secondary transition-all"
        >
          <Sun className="h-[18px] w-[18px] rotate-0 scale-100 transition-all duration-300 dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[18px] w-[18px] rotate-90 scale-0 transition-all duration-300 dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme ({label})</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Theme: {label}</p>
      </TooltipContent>
    </Tooltip>
  );
};

export default ThemeToggle;
