/**
 * How many emoji a message is, when it's only emoji (1 to 3), else 0. Such messages show big,
 * with no bubble, as on WhatsApp.
 */
type Segmenter = { segment: (s: string) => Iterable<{ segment: string }> };
const SegmenterCtor = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => Segmenter }).Segmenter;
const segmenter = SegmenterCtor ? new SegmenterCtor(undefined, { granularity: "grapheme" }) : null;
const EMOJI = /^(\p{Extended_Pictographic}|\p{Regional_Indicator})/u;

export function emojiOnlyCount(text: string | null | undefined): number {
  const t = text?.replace(/\s+/g, "");
  if (!t || t.length > 40 || !segmenter) return 0;
  const parts = [...segmenter.segment(t)].map((p) => p.segment);
  if (parts.length > 3) return 0;
  return parts.every((p) => EMOJI.test(p)) ? parts.length : 0;
}
