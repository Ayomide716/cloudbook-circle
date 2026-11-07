import { Label } from "@/components/ui/label";
import { Globe, Lock } from "@/components/icons";
import { GROUP_CATEGORIES, type GroupCategory } from "@/lib/group-categories";
import { cn } from "@/lib/utils";

interface GroupSettingsFieldsProps {
  category: GroupCategory | "";
  isPrivate: boolean;
  onChange: (next: { category: GroupCategory | ""; isPrivate: boolean }) => void;
}

/** What a group is about and who can see its posts (Create group and Edit group). */
const GroupSettingsFields = ({ category, isPrivate, onChange }: GroupSettingsFieldsProps) => (
  <>
    <div className="space-y-2">
      <Label>What's it about?</Label>
      <div className="flex flex-wrap gap-2">
        {GROUP_CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={category === c.value}
            onClick={() => onChange({ category: category === c.value ? "" : c.value, isPrivate })}
            className={cn(
              "h-8 rounded-full px-3 text-[13px] font-semibold transition-colors",
              category === c.value ? "bg-foreground text-background" : "bg-secondary text-foreground hover:bg-secondary/80"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
    <div className="space-y-2">
      <Label>Who can see posts?</Label>
      <div className="grid grid-cols-2 gap-2">
        {([[false, Globe, "Public", "Anyone can join and see posts"], [true, Lock, "Private", "People ask to join; admins let them in"]] as const).map(([value, Icon, title, text]) => (
          <button
            key={title}
            type="button"
            aria-pressed={isPrivate === value}
            onClick={() => onChange({ category, isPrivate: value })}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              isPrivate === value ? "border-foreground bg-secondary" : "border-border hover:bg-secondary/60"
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="h-4 w-4" />{title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{text}</span>
          </button>
        ))}
      </div>
    </div>
  </>
);

export default GroupSettingsFields;
