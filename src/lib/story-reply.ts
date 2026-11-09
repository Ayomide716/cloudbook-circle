/**
 * A reply to a story (or a reaction to one) carries the story's picture as its image, marked
 * after # so the chat shows it as a small quote beside the reply, as on WhatsApp (older
 * versions of the app just show the picture).
 */
export function storyReplyImage(mediaUrl: string | null | undefined, mediaType?: string | null): string | null {
  if (!mediaUrl) return null;
  return `${mediaUrl.split("#")[0]}#story=1${mediaType === "video" ? "&video=1" : ""}`;
}

export function storyReplyOf(message: { content?: string | null; image_url?: string | null }): { image: string | null; video: boolean; text: string; reaction: boolean } | null {
  const content = message.content ?? "";
  const reply = content.match(/^💬 Replied to your story: "([\s\S]*)"$/);
  const reacted = /Reacted to your story$/.test(content);
  if (!reply && !reacted) return null;
  const hash = message.image_url?.split("#")[1] ?? "";
  const params = new URLSearchParams(hash);
  return {
    image: params.get("story") ? message.image_url!.split("#")[0] : null,
    video: params.get("video") === "1",
    text: reply ? reply[1] : content.replace(/\s*Reacted to your story$/, ""),
    reaction: !reply,
  };
}
