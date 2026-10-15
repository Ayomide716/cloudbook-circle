/** When you last opened each group, on this phone, so Menu can list your groups by use (as Facebook does). */
const KEY = "ember:recent-groups";

export function recordGroupVisit(groupId: string) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, number>;
    all[groupId] = Date.now();
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Private mode: the order just falls back to names.
  }
}

export function groupVisits(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}
