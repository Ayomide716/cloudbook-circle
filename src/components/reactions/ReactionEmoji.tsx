import { cn } from "@/lib/utils";
import { EMOJI_FILES } from "@/lib/reaction-emoji";

/** One reaction face as a 3D emoji image (see lib/reaction-emoji). */
interface ReactionEmojiProps {
  type: string;
  className?: string;
  /** Spoken name; leave out when the label is next to it. */
  label?: string;
}

const ReactionEmoji = ({ type, className, label }: ReactionEmojiProps) => (
  <img
    src={`/emoji/${EMOJI_FILES[type] ?? "like"}.webp`}
    alt={label ?? ""}
    aria-hidden={label ? undefined : true}
    draggable={false}
    decoding="async"
    className={cn("inline-block h-5 w-5 select-none object-contain", className)}
  />
);

export default ReactionEmoji;
