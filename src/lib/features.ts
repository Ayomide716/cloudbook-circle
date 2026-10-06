/**
 * Features that need database updates the live project hasn't had yet
 * (supabase/migrations/20261009090000_profile_details_post_location.sql and
 * 20261010090000_block_users.sql). They stay off until those have been run, so the app
 * never asks the database for columns or functions it doesn't have.
 *
 * Turn them on by setting VITE_DB_UPDATES_2026_10=true (in Vercel: Settings → Environment
 * Variables, then redeploy). The tests turn them on, since their database has every update.
 */
const on = import.meta.env.VITE_DB_UPDATES_2026_10 === "true";

export const features = {
  /** "Lekki, Lagos · 2h" on posts, and the place field when posting. */
  postLocation: on,
  /** Hometown, birthday and relationship on profiles. */
  profileDetails: on,
  /** Blocking people (Block in menus, Settings → Blocked people). */
  blocking: on,
} as const;
