import { cn } from "@/lib/utils";

/**
 * "Typing…" as a chat bubble with three soft dots, as in WhatsApp and Messenger. The name is
 * read out to screen readers; on screen the dots say it.
 */
const TypingBubble = ({ name, className }: { name: string; className?: string }) => (
  <div className={cn("flex justify-start px-3 pb-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 duration-200", className)} role="status" aria-live="polite">
    <div className="flex h-9 items-center gap-1 rounded-2xl rounded-bl-md bg-chat-surface px-3.5 shadow-sm">
      {[0, 160, 320].map((d) => (
        <span
          key={d}
          className="h-2 w-2 rounded-full bg-muted-foreground motion-safe:animate-typing-dot motion-reduce:opacity-60"
          style={{ animationDelay: `${d}ms` }}
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">{name} is typing</span>
    </div>
  </div>
);

export default TypingBubble;
