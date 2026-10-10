/**
 * GIFs and animated stickers for chat, from GIPHY (Tenor as a fallback for GIFs).
 * These are browser keys (they ship with the app): set VITE_GIPHY_API_KEY to your own from
 * developers.giphy.com; VITE_TENOR_API_KEY likewise.
 */
const GIPHY_API_KEY: string = import.meta.env.VITE_GIPHY_API_KEY || "0UTRbFtkMxAplrohufYco5IY74U8hOes";
const TENOR_API_KEY: string = import.meta.env.VITE_TENOR_API_KEY || "AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ";

export interface GifResult {
  id: string;
  /** Small, for the picker grid. */
  preview: string;
  /** What gets sent. */
  url: string;
  title: string;
}

interface GiphyImage { url?: string; webp?: string }
interface GiphyItem { id: string; title?: string; images: { fixed_width_small?: GiphyImage; fixed_width?: GiphyImage; fixed_height?: GiphyImage } }
interface TenorItem { id: string; content_description?: string; media_formats?: { gif?: { url?: string }; tinygif?: { url?: string } } }

/** Only GIPHY's own media hosts count as GIPHY stickers when shown in a chat. */
export const isGiphyMedia = (url: string | null | undefined) => !!url && /^https:\/\/media\d*\.giphy\.com\//.test(url);

export const fromGiphy = (items: GiphyItem[]): GifResult[] =>
  items
    .map((g) => {
      const url = g.images.fixed_height?.url || g.images.fixed_width?.url;
      const preview = g.images.fixed_width_small?.webp || g.images.fixed_width_small?.url || g.images.fixed_width?.webp || url;
      return url && preview ? { id: g.id, url, preview, title: g.title || "GIF" } : null;
    })
    .filter((g): g is GifResult => !!g);

async function giphy(kind: "gifs" | "stickers", query: string, signal?: AbortSignal): Promise<GifResult[]> {
  const q = query.trim();
  const path = q ? `search?q=${encodeURIComponent(q)}&` : "trending?";
  const res = await fetch(`https://api.giphy.com/v1/${kind}/${path}api_key=${GIPHY_API_KEY}&limit=24&rating=pg-13`, { signal });
  if (!res.ok) throw new Error(`GIPHY ${res.status}`);
  const data: { data?: GiphyItem[] } = await res.json();
  return fromGiphy(data.data ?? []);
}

async function tenor(query: string, signal?: AbortSignal): Promise<GifResult[]> {
  const q = query.trim();
  const path = q ? `search?q=${encodeURIComponent(q)}&` : "featured?";
  const res = await fetch(`https://tenor.googleapis.com/v2/${path}key=${TENOR_API_KEY}&client_key=ember&limit=24&contentfilter=medium`, { signal });
  if (!res.ok) throw new Error(`Tenor ${res.status}`);
  const data: { results?: TenorItem[] } = await res.json();
  return (data.results ?? [])
    .map((t) => {
      const url = t.media_formats?.gif?.url || t.media_formats?.tinygif?.url;
      const preview = t.media_formats?.tinygif?.url || url;
      return url && preview ? { id: t.id, url, preview, title: t.content_description || "GIF" } : null;
    })
    .filter((g): g is GifResult => !!g);
}

/** Trending GIFs (no query) or a search: GIPHY first, then Tenor. */
export async function findGifs(query: string, signal?: AbortSignal): Promise<GifResult[]> {
  try {
    const found = await giphy("gifs", query, signal);
    if (found.length) return found;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
  }
  return tenor(query, signal);
}

/** Trending animated stickers (no query) or a search, from GIPHY. */
export const findStickers = (query: string, signal?: AbortSignal) => giphy("stickers", query, signal);
