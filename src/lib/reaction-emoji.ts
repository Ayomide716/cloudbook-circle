/**
 * Reaction faces as 3D emoji (Microsoft's Fluent Emoji, MIT), bundled in public/emoji so they
 * look the same on every phone instead of each system's own emoji font.
 */
export const EMOJI_FILES: Record<string, string> = {
  like: "like",
  love: "love",
  heart: "love",
  haha: "haha",
  laugh: "haha",
  wow: "wow",
  sad: "sad",
  angry: "angry",
  fire: "fire",
  wave: "wave",
  party: "party",
};

export const hasReactionEmoji = (type: string) => type in EMOJI_FILES;
