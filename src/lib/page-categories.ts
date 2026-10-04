export const PAGE_CATEGORIES = [
  { value: "business", label: "Business" },
  { value: "brand", label: "Brand" },
  { value: "community", label: "Community" },
  { value: "creator", label: "Creator / Public Figure" },
  { value: "entertainment", label: "Entertainment" },
  { value: "education", label: "Education" },
  { value: "nonprofit", label: "Nonprofit" },
  { value: "technology", label: "Technology" },
  { value: "other", label: "Other" },
];

export const pageCategoryLabel = (value: string) =>
  PAGE_CATEGORIES.find((c) => c.value === value)?.label ?? value.charAt(0).toUpperCase() + value.slice(1);
