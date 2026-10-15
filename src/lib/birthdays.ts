/** "YYYY-MM-DD" birthdays that fall today (29 Feb counts on 28 Feb in other years). */
export function isBirthdayToday(birthday: string | null | undefined, now = new Date()): boolean {
  if (!birthday) return false;
  const [, m, d] = birthday.split("-").map(Number);
  if (!m || !d) return false;
  const month = now.getMonth() + 1;
  const day = now.getDate();
  if (m === month && d === day) return true;
  const leap = new Date(now.getFullYear(), 1, 29).getMonth() === 1;
  return m === 2 && d === 29 && !leap && month === 2 && day === 28;
}

