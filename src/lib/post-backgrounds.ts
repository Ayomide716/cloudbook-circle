/**
 * Backgrounds for short text posts (Facebook's coloured posts). Saved on the post by key, so
 * the colours can be tuned later without changing old posts.
 */
export const POST_BACKGROUNDS = [
  { key: "teal", label: "Teal", css: "linear-gradient(135deg, #0f766e 0%, #14b8a6 55%, #5eead4 100%)" },
  { key: "sunset", label: "Sunset", css: "linear-gradient(135deg, #f97316 0%, #ef4444 55%, #db2777 100%)" },
  { key: "ocean", label: "Ocean", css: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #22d3ee 100%)" },
  { key: "grape", label: "Grape", css: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 55%, #c084fc 100%)" },
  { key: "gold", label: "Gold", css: "linear-gradient(135deg, #b45309 0%, #f59e0b 55%, #fde047 100%)" },
  { key: "night", label: "Night", css: "linear-gradient(135deg, #0b121e 0%, #1e293b 60%, #334155 100%)" },
] as const;

export type PostBackgroundKey = (typeof POST_BACKGROUNDS)[number]["key"];

/** Text up to this long can go on a background (longer reads badly in big type). */
export const BACKGROUND_MAX_LENGTH = 150;

export const backgroundCss = (key: string | null | undefined) => POST_BACKGROUNDS.find((b) => b.key === key)?.css ?? null;
