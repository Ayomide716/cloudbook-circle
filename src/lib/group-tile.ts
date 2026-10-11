// A group without a photo gets its initials on a colour of its own, so a list of groups doesn't
// look like the same row over and over. The colour comes from the group's id, so it never changes.
const TILE_COLORS = [
  "linear-gradient(135deg, #ff8a3d, #f0532d)",
  "linear-gradient(135deg, #f7b733, #fc6d26)",
  "linear-gradient(135deg, #ec4f8b, #b9407c)",
  "linear-gradient(135deg, #8b5cf6, #6d3fd6)",
  "linear-gradient(135deg, #3b82f6, #2659c9)",
  "linear-gradient(135deg, #14b8a6, #0d8a7c)",
  "linear-gradient(135deg, #22c55e, #15964a)",
  "linear-gradient(135deg, #64748b, #3f4a5c)",
];

export const groupInitials = (name: string) => {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

export const groupColor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
};
