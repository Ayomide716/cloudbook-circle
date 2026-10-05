import { admin, PASSWORD, USERS } from "./fixtures";

/**
 * Fresh test data for every run: three users, Alice and Bob are friends,
 * Dave has sent Alice a friend request, Bob has one post.
 */
export default async function globalSetup() {
  const db = admin();

  // Remove users from a previous run (their rows go with them via ON DELETE CASCADE).
  const { data: existing } = await db.auth.admin.listUsers({ perPage: 1000 });
  const ours = new Set<string>(Object.values(USERS).map((u) => u.email));
  for (const u of existing?.users ?? []) {
    if (!u.email || !ours.has(u.email)) continue;
    const { error } = await db.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`Could not remove old test user ${u.email}: ${error.message}`);
  }

  const ids: Record<string, string> = {};
  for (const [key, u] of Object.entries(USERS)) {
    const { data, error } = await db.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.name },
    });
    if (error || !data.user) throw new Error(`Could not create ${u.email}: ${error?.message}`);
    ids[key] = data.user.id;
  }

  const check = (label: string, error: { message: string } | null) => {
    if (error) throw new Error(`${label}: ${error.message}`);
  };
  check("friendship", (await db.from("friendships").insert([
    { user_id: ids.alice, friend_id: ids.bob, status: "accepted" },
    { user_id: ids.dave, friend_id: ids.alice, status: "pending" },
  ])).error);
  check("post", (await db.from("posts").insert({
    user_id: ids.bob,
    content: "Saturday at Lekki Conservation Centre",
    location: "Lekki, Lagos",
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  })).error);

  process.env.E2E_IDS = JSON.stringify(ids);
}
