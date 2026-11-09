import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ActionMenu, ActionMenuContent, ActionMenuItem, ActionMenuTrigger } from "@/components/ui/action-menu";
import { Plus, Play } from "@/components/icons";
import { useLongPress } from "@/hooks/use-long-press";
import { requestMyStory, useMyStory } from "@/lib/my-story";
import { cn } from "@/lib/utils";

interface MyStoryAvatarProps {
  avatarUrl: string | null;
  name: string | null;
}

/**
 * Your photo by "What's on your mind?", which is also your story: a glowing ring while your
 * story is up (tap to watch it), a + when it isn't (tap to add one). Hold it for both.
 */
const MyStoryAvatar = ({ avatarUrl, name }: MyStoryAvatarProps) => {
  const { has, closeFriends } = useMyStory();
  const [menuOpen, setMenuOpen] = useState(false);
  const hold = useLongPress(() => setMenuOpen(true));

  return (
    <ActionMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <ActionMenuTrigger asChild>
        <button
          type="button"
          {...hold.handlers}
          onClick={(e) => {
            e.preventDefault();
            // The tap that ends a hold already opened the menu.
            if (hold.fired.current) { hold.fired.current = false; return; }
            requestMyStory(has ? "view" : "create");
          }}
          aria-label={has ? "Your story. Hold for more" : "Add to your story"}
          className="relative h-10 w-10 shrink-0 rounded-full sm:h-11 sm:w-11"
        >
          <span
            className={cn(
              "block h-full w-full rounded-full",
              has && "p-[2px]",
              has && (closeFriends ? "bg-green-500 shadow-[0_0_10px_1px_rgb(34_197_94/0.55)]" : "bg-brand shadow-[0_0_10px_1px_hsl(var(--primary)/0.55)]"),
              has && "motion-safe:animate-story-glow",
            )}
          >
            <Avatar className={cn("h-full w-full", has && "border-2 border-card")}>
              <AvatarImage src={avatarUrl || undefined} className="object-cover" />
              <AvatarFallback className="bg-secondary text-secondary-foreground">{name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
            </Avatar>
          </span>
          {!has && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground" aria-hidden="true">
              <Plus className="h-2.5 w-2.5" strokeWidth={3.5} />
            </span>
          )}
        </button>
      </ActionMenuTrigger>
      <ActionMenuContent align="start" title="Your story">
        {has && (
          <ActionMenuItem onSelect={() => requestMyStory("view")}>
            <Play className="mr-2 h-4 w-4" /> View your story
          </ActionMenuItem>
        )}
        <ActionMenuItem onSelect={() => requestMyStory("create")}>
          <Plus className="mr-2 h-4 w-4" /> Add to your story
        </ActionMenuItem>
      </ActionMenuContent>
    </ActionMenu>
  );
};

export default MyStoryAvatar;
