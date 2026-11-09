/**
 * What can be tapped on a story (stories.overlay). Positions are fractions of the 9:16 story
 * (0..1 from the top left). Text, drawing and the time and place stickers are part of the
 * picture itself; these are drawn live on top of it.
 */
export interface StoryPoll {
  question: string;
  options: string[];
  x: number;
  y: number;
}

export interface StoryMention {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface StoryOverlay {
  poll?: StoryPoll;
  mentions?: StoryMention[];
  /** A post shared to the story: "View post" opens it. */
  post_id?: string;
}

/** The overlay from the database, or nothing if it isn't one we understand. */
export function readOverlay(value: unknown): StoryOverlay | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const out: StoryOverlay = {};
  const p = v.poll as Record<string, unknown> | undefined;
  if (p && typeof p.question === "string" && Array.isArray(p.options) && p.options.length >= 2) {
    out.poll = { question: p.question, options: p.options.slice(0, 4).map(String), x: Number(p.x) || 0.5, y: Number(p.y) || 0.5 };
  }
  if (Array.isArray(v.mentions)) {
    out.mentions = v.mentions
      .filter((m): m is Record<string, unknown> => !!m && typeof m === "object" && typeof (m as Record<string, unknown>).id === "string")
      .map((m) => ({ id: String(m.id), name: String(m.name ?? ""), x: Number(m.x) || 0.5, y: Number(m.y) || 0.5 }));
  }
  if (typeof v.post_id === "string") out.post_id = v.post_id;
  return out.poll || out.mentions?.length || out.post_id ? out : null;
}

/** Backgrounds for a text-only story. */
export const STORY_BACKGROUNDS = [
  "linear-gradient(160deg, #ff7a3d, #e8552b 55%, #b8321a)",
  "linear-gradient(160deg, #6366f1, #8b5cf6 55%, #d946ef)",
  "linear-gradient(160deg, #0ea5e9, #2563eb)",
  "linear-gradient(160deg, #10b981, #047857)",
  "linear-gradient(160deg, #f43f5e, #be123c)",
  "linear-gradient(160deg, #27272a, #09090b)",
];
