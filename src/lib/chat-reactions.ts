/**
 * Reactions on chat messages. The saved names stay as they were (like, heart, …); they show
 * as emoji, as on WhatsApp.
 */
export const CHAT_REACTIONS = [
  { type: "like", emoji: "👍", label: "Like" },
  { type: "heart", emoji: "❤️", label: "Love" },
  { type: "laugh", emoji: "😂", label: "Haha" },
  { type: "wow", emoji: "😮", label: "Wow" },
  { type: "sad", emoji: "😢", label: "Sad" },
  { type: "angry", emoji: "😡", label: "Angry" },
] as const;

export const reactionEmoji = (type: string) => CHAT_REACTIONS.find((r) => r.type === type)?.emoji ?? "👍";

export interface ChatReaction {
  message_id: string;
  user_id: string;
  reaction_type: string;
}
