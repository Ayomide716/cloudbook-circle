/** Relationship options, as on Facebook profiles. Values match the database check. */
export const RELATIONSHIP_OPTIONS = [
  { value: "single", label: "Single" },
  { value: "in_a_relationship", label: "In a relationship" },
  { value: "engaged", label: "Engaged" },
  { value: "married", label: "Married" },
  { value: "its_complicated", label: "It's complicated" },
] as const;

export const relationshipLabel = (value: string | null | undefined) =>
  RELATIONSHIP_OPTIONS.find((o) => o.value === value)?.label ?? null;

/** "December 15" (Facebook shows the birthday without the year). */
export function birthdayLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(2000, m - 1, d)).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}
