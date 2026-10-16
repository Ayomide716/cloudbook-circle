import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "@/components/icons";
import { cn } from "@/lib/utils";
import { fadeTheme } from "@/lib/theme-fade";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
] as const;

/** Light, dark, or following the phone. */
const AppearancePicker = () => {
  const { setTheme, theme } = useTheme();
  return (
    <div className="flex shrink-0 rounded-xl bg-secondary p-1" role="radiogroup" aria-label="Appearance">
      {THEMES.map((t) => (
        <button
          key={t.value}
          type="button"
          role="radio"
          aria-checked={theme === t.value}
          onClick={() => fadeTheme(() => setTheme(t.value))}
          className={cn(
            "flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors",
            theme === t.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <t.icon className="hidden h-3.5 w-3.5 min-[420px]:block" />
          {t.label}
        </button>
      ))}
    </div>
  );
};

export default AppearancePicker;
