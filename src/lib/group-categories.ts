/** What a group is about, for browsing Discover (the database checks the same list). */
export const GROUP_CATEGORIES = [
  { value: "church", label: "Church & faith" },
  { value: "school", label: "School & alumni" },
  { value: "estate", label: "Estate & street" },
  { value: "hobbies", label: "Hobbies" },
  { value: "business", label: "Business" },
  { value: "sports", label: "Sports" },
  { value: "family", label: "Family" },
  { value: "other", label: "Other" },
] as const;

export type GroupCategory = (typeof GROUP_CATEGORIES)[number]["value"];

export const categoryLabel = (value: string | null | undefined) =>
  GROUP_CATEGORIES.find((c) => c.value === value)?.label ?? null;
