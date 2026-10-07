/** The first web link in a text, without trailing punctuation ("see https://x.com/a." → the URL). */
export function firstLink(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"]+/i);
  if (!match) return null;
  const url = match[0].replace(/[.,!?;:)\]}'"]+$/, "");
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** The video id of a YouTube link (watch, youtu.be, shorts, embed), or null. */
export function youTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com" || host === "music.youtube.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else {
        const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
        id = m?.[2] ?? null;
      }
    }
    return id && /^[\w-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
