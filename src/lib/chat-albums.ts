import type { ChatMessage } from "@/components/ChatBubble";
import { isGiphyMedia } from "@/lib/giphy";

/** A row in a chat: one message, or an album of photos sent together. */
export interface ChatRow {
  message: ChatMessage;
  /** Four or more photos sent together, shown as one grid (as on WhatsApp). */
  album?: ChatMessage[];
}

const PLAIN = "Sent an image";

/** A photo on its own (no caption beyond the album's first, not a video, GIF, sticker or view once). */
function albumPhoto(m: ChatMessage, first: boolean): boolean {
  if (!m.image_url || m.view_once || m._video || m.deleted_at) return false;
  if (isGiphyMedia(m.image_url) || /\.(mp4|mov|webm)(\?|#|$)/i.test(m.image_url)) return false;
  if (m.content?.startsWith("🎤")) return false;
  if (!first && (m.content !== PLAIN || m.reply_to)) return false;
  return true;
}

/** Groups runs of 4+ photos from the same person, sent within two minutes, into albums. */
export function groupAlbums(messages: ChatMessage[]): ChatRow[] {
  const rows: ChatRow[] = [];
  let i = 0;
  while (i < messages.length) {
    const first = messages[i];
    let j = i + 1;
    if (albumPhoto(first, true)) {
      while (
        j < messages.length &&
        messages[j].sender_id === first.sender_id &&
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
export const lastOf = (row: ChatRow) => (row.album ? row.album[row.album.length - 1] : row.message);
