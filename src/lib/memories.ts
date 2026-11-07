/**
 * "On this day": today's date in past years, as time ranges to ask the database for. Local
 * days (a post at 11pm in Lagos belongs to that day there), up to `years` back.
 */
export function onThisDayRanges(now: Date, years = 5): { year: number; from: string; to: string }[] {
  const out: { year: number; from: string; to: string }[] = [];
  for (let back = 1; back <= years; back++) {
    const y = now.getFullYear() - back;
    // 29 February in a year without it: that year has no such day.
    const start = new Date(y, now.getMonth(), now.getDate());
    if (start.getMonth() !== now.getMonth()) continue;
    const end = new Date(y, now.getMonth(), now.getDate() + 1);
    out.push({ year: y, from: start.toISOString(), to: end.toISOString() });
  }
  return out;
}

/** "1 year ago today", "3 years ago today". */
export const yearsAgo = (fromYear: number, now: Date) => {
  const n = now.getFullYear() - fromYear;
  return `${n} ${n === 1 ? "year" : "years"} ago today`;
};
