import type { ChatMessage } from "@/components/ChatBubble";
import { isGiphyMedia } from "@/lib/giphy";

/** A row in a chat: one message, or an album of photos sent together. */
export interface ChatRow<T = ChatMessage> {
  message: T;
  /** Four or more photos sent together, shown as one grid (as on WhatsApp). */
  album?: T[];
}

/** What's saved as the text of a photo with no caption: in one-to-one chats, and in groups. */
const PLAIN = ["Sent an image", "📷 Photo"];

/** The parts of a message an album needs (one-to-one and group messages both have them). */
export interface AlbumCandidate {
  content: string;
  created_at: string;
  image_url?: string | null;
  reply_to?: string | null;
  view_once?: boolean;
  deleted_at?: string | null;
  _video?: boolean;
}

/** A photo on its own (no caption beyond the album's first, not a video, GIF, sticker or view once). */
function albumPhoto(m: AlbumCandidate, first: boolean): boolean {
  if (!m.image_url || m.view_once || m._video || m.deleted_at) return false;
  if (isGiphyMedia(m.image_url) || /\.(mp4|mov|webm)(\?|#|$)/i.test(m.image_url)) return false;
  if (m.content?.startsWith("🎤") || m.content === "GIF" || m.content === "🎥 Video") return false;
  if (!first && (!PLAIN.includes(m.content) || m.reply_to)) return false;
  return true;
}

/** Groups runs of 4+ photos from the same person, sent within two minutes, into albums. */
export function groupAlbums<T extends AlbumCandidate = ChatMessage>(messages: T[], senderOf: (m: T) => string = (m) => (m as unknown as ChatMessage).sender_id): ChatRow<T>[] {
  const rows: ChatRow<T>[] = [];
  let i = 0;
  while (i < messages.length) {
    const first = messages[i];
    let j = i + 1;
    if (albumPhoto(first, true)) {
      while (
        j < messages.length &&
        senderOf(messages[j]) === senderOf(first) &&
        albumPhoto(messages[j], false) &&
        Math.abs(new Date(messages[j].created_at).getTime() - new Date(messages[j - 1].created_at).getTime()) < 120_000
      ) j++;
    }
    if (j - i >= 4) {
      rows.push({ message: first, album: messages.slice(i, j) });
      i = j;
    } else {
      rows.push({ message: first });
      i++;
    }
  }
  return rows;
}

/** The newest message in a row. */
export const lastOf = <T,>(row: ChatRow<T>) => (row.album ? row.album[row.album.length - 1] : row.message);
