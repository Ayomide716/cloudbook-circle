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
type TenorFormat = { url?: string };
interface TenorItem {
  id: string;
  content_description?: string;
  media_formats?: { gif?: TenorFormat; tinygif?: TenorFormat; gif_transparent?: TenorFormat; tinygif_transparent?: TenorFormat };
}

/** Only GIPHY's and Tenor's own media hosts count as animated stickers when shown in a chat. */
export const isGiphyMedia = (url: string | null | undefined) =>
  !!url && /^https:\/\/(media\d*\.giphy\.com|media\.tenor\.com)\//.test(url);

export const fromGiphy = (items: GiphyItem[]): GifResult[] =>
  items
    .map((g) => {
      const url = g.images.fixed_height?.url || g.images.fixed_width?.url;
      const preview = g.images.fixed_width_small?.webp || g.images.fixed_width_small?.url || g.images.fixed_width?.webp || url;
      return url && preview ? { id: g.id, url, preview, title: g.title || "GIF" } : null;
    })
    .filter((g): g is GifResult => !!g);

// GIPHY allows a limited number of requests an hour per key, and phones drop requests now and
// then. So: remember what we fetched for a while, try once more after a hiccup, and fall back
// to Tenor when GIPHY says no.
const CACHE_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; results: GifResult[] }>();

const isAbort = (e: unknown) => (e as Error)?.name === "AbortError";
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });

/** One retry after a network error or a server hiccup; none after "no" (4xx), which goes to Tenor. */
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let status = 0;
    try {
      const res = await fetch(url, { signal });
      if (res.ok) return (await res.json()) as T;
      status = res.status;
    } catch (e) {
      if (isAbort(e) || attempt > 0) throw e;
    }
    if (status && (status < 500 || attempt > 0)) throw new Error(`HTTP ${status}`);
    await wait(700, signal);
  }
}

async function cached(key: string, load: () => Promise<GifResult[]>): Promise<GifResult[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.results;
  const results = await load();
  if (results.length) cache.set(key, { at: Date.now(), results });
  return results;
}

async function giphy(kind: "gifs" | "stickers", query: string, signal?: AbortSignal): Promise<GifResult[]> {
  const q = query.trim();
  const path = q ? `search?q=${encodeURIComponent(q)}&` : "trending?";
  const data = await getJson<{ data?: GiphyItem[] }>(`https://api.giphy.com/v1/${kind}/${path}api_key=${GIPHY_API_KEY}&limit=24&rating=pg-13`, signal);
  return fromGiphy(data.data ?? []);
}

async function tenor(kind: "gifs" | "stickers", query: string, signal?: AbortSignal): Promise<GifResult[]> {
  const q = query.trim();
  const path = q ? `search?q=${encodeURIComponent(q)}&` : "featured?";
  const stickers = kind === "stickers";
  const data = await getJson<{ results?: TenorItem[] }>(
    `https://tenor.googleapis.com/v2/${path}key=${TENOR_API_KEY}&client_key=ember&limit=24&contentfilter=medium` +
      (stickers ? "&searchfilter=sticker&media_filter=gif_transparent,tinygif_transparent" : "&media_filter=gif,tinygif"),
    signal
  );
  return (data.results ?? [])
    .map((t) => {
      const f = t.media_formats ?? {};
      const url = stickers ? f.gif_transparent?.url || f.tinygif_transparent?.url : f.gif?.url || f.tinygif?.url;
      const preview = (stickers ? f.tinygif_transparent?.url : f.tinygif?.url) || url;
      return url && preview ? { id: t.id, url, preview, title: t.content_description || (stickers ? "Sticker" : "GIF") } : null;
    })
    .filter((g): g is GifResult => !!g);
}

/** GIPHY first, then Tenor; either one's results are kept for a while. */
function find(kind: "gifs" | "stickers", query: string, signal?: AbortSignal): Promise<GifResult[]> {
  return cached(`${kind}:${query.trim().toLowerCase()}`, async () => {
    try {
      const found = await giphy(kind, query, signal);
      if (found.length) return found;
    } catch (e) {
      if (isAbort(e)) throw e;
    }
    return tenor(kind, query, signal);
  });
}

/** Trending GIFs (no query) or a search. */
export const findGifs = (query: string, signal?: AbortSignal) => find("gifs", query, signal);

/** Trending animated stickers (no query) or a search. */
export const findStickers = (query: string, signal?: AbortSignal) => find("stickers", query, signal);
