import { previewText } from "@/lib/stickers";
/** Messages in group chats, and how their media and quotes are described. */
export interface GroupMessage {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  reply_to?: string | null;
  edited_at?: string | null;
  forwarded?: boolean;
}

// Text saved with media that has no caption (it's what the chat list shows).
export const MEDIA_PLACEHOLDERS = ["📷 Photo", "🎥 Video", "GIF"];
export const isVoiceNote = (m: { content: string; image_url: string | null }) => !!m.image_url && m.content.startsWith("🎤");
export const mediaKind = (url: string) =>
  /giphy\.com|tenor\.com/.test(url) ? "gif" : /\.(mp4|mov|webm)(\?|$)/i.test(url) ? "video" : "image";
export const voiceSeconds = (content: string) => {
  const m = content.match(/\((\d+):(\d{2})\)\s*$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};

/** A short line describing a message, for quotes ("📷 Photo", "🎤 Voice message", or its text). */
export const quoteText = (m: GroupMessage) => (isVoiceNote(m) ? "🎤 Voice message" : previewText(m.content));
