import { supabase } from "@/integrations/supabase/client";
import { uploadPhoto } from "@/lib/upload-photo";
import { plainMentions } from "@/lib/mentions";
import type { Json } from "@/integrations/supabase/types";

const W = 1080;
const H = 1920;

function loadImage(src: string, cors: boolean): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, max: number, limit: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > max && line) { lines.push(line); line = word; } else line = next;
      if (lines.length >= limit) break;
    }
    if (lines.length >= limit) break;
    lines.push(line);
  }
  if (lines.length > limit || (lines.length === limit && text.length > lines.join(" ").length)) {
    lines.length = limit;
    lines[limit - 1] = `${lines[limit - 1].replace(/\s*\S*$/, "")}…`;
  }
  return lines;
}

/**
 * The post as a card on an Ember-orange background, as Instagram does when you add a post to
 * your story. Its photo is included when the server allows it to be drawn (else just the text).
 */
async function drawPostCard(post: { content: string | null; image?: string | null; author: string }) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, "#ff7a3d");
  bg.addColorStop(0.55, "#e8552b");
  bg.addColorStop(1, "#b8321a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  await document.fonts?.ready;

  const font = (weight: number, size: number) => `${weight} ${size}px "Figtree Variable", Figtree, system-ui, sans-serif`;
  const cardX = 90, cardW = W - 180, pad = 48;
  const photo = post.image ? await loadImage(post.image, true) : null;
  ctx.font = font(500, 44);
  const lines = post.content ? wrapLines(ctx, plainMentions(post.content), cardW - pad * 2, photo ? 4 : 10) : [];
  const photoH = photo ? Math.min(760, (cardW * photo.naturalHeight) / photo.naturalWidth) : 0;
  const cardH = pad + 64 + (lines.length ? 24 + lines.length * 58 : 0) + (photo ? 32 + photoH : 0) + pad;
  const cardY = (H - cardH) / 2;

  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 40);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#171717";
  ctx.font = font(700, 46);
  ctx.textBaseline = "top";
  ctx.fillText(post.author, cardX + pad, cardY + pad);
  let y = cardY + pad + 64;
  if (lines.length) {
    y += 24;
    ctx.font = font(500, 44);
    ctx.fillStyle = "#262626";
    for (const l of lines) { ctx.fillText(l, cardX + pad, y); y += 58; }
  }
  if (photo) {
    y += 32;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cardX, y, cardW, photoH, [0, 0, 40, 40]);
    ctx.clip();
    const s = Math.max(cardW / photo.naturalWidth, photoH / photo.naturalHeight);
    ctx.drawImage(photo, cardX + (cardW - photo.naturalWidth * s) / 2, y + (photoH - photo.naturalHeight * s) / 2, photo.naturalWidth * s, photo.naturalHeight * s);
    ctx.restore();
  }

  const toBlob = () => new Promise<Blob | null>((resolve) => {
    try { canvas.toBlob(resolve, "image/jpeg", 0.9); } catch { resolve(null); }
  });
  const blob = await toBlob();
  // A photo from a server that doesn't allow drawing it: the card without it.
  if (!blob && photo) return drawPostCard({ ...post, image: null });
  if (!blob) throw new Error("Couldn't make the story");
  return new File([blob], `post-story-${Date.now()}.jpg`, { type: "image/jpeg" });
}

/** Puts a post on your story as a card; tapping "View post" on the story opens it. */
export async function sharePostToStory(postId: string, userId: string) {
  const { data: post, error } = await supabase
    .from("posts")
    .select("id, content, image_url, image_urls, profiles:user_id (full_name)")
    .eq("id", postId)
    .maybeSingle();
  if (error || !post) throw error ?? new Error("This post isn't available");
  const author = (post as unknown as { profiles: { full_name: string | null } | null }).profiles?.full_name || "Someone";
  const file = await drawPostCard({ content: post.content, image: post.image_urls?.[0] ?? post.image_url, author });
  const url = await uploadPhoto("post-images", userId, file);
  const { error: insertError } = await supabase.from("stories").insert({
    user_id: userId,
    media_url: url,
    media_type: "image",
    overlay: { post_id: postId } as unknown as Json,
  });
  if (insertError) throw insertError;
}
