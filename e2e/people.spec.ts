import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

const ids = () => JSON.parse(process.env.E2E_IDS ?? "{}") as Record<string, string>;

test.describe("profiles and friends", () => {
  test("a friend's profile says Friends and offers Message", async ({ page }) => {
    await signIn(page, "alice");
    await page.goto(`/profile/${ids().bob}`);
    await expect(page.getByRole("heading", { level: 1, name: "Bob Martins" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Friends\. Unfriend/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Message", exact: true })).toBeVisible();
  });

  test("your own profile has Facebook's header: stats, Add to story, Edit profile and chips", async ({ page }) => {
    await signIn(page, "alice");
    const bar = page.getByRole("navigation", { name: "Main" }).last();
    await bar.getByRole("button", { name: "Profile" }).click();
    await expect(page).toHaveURL(new RegExp(`/profile/${ids().alice}$`));
    await expect(bar.getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1, name: "Alice Johnson" })).toBeVisible();
    await expect(page.getByText(/1\s+friend\s+·\s+\d+\s+posts?/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to story" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit profile" })).toBeVisible();
    const chips = page.getByRole("navigation", { name: "Profile sections" });
    // Only sections with something in them: no videos, so no Videos chip; your own Albums stays.
    await expect(chips.getByRole("button", { name: /^All/ })).toBeVisible();
    await expect(chips.getByRole("button", { name: /^Videos/ })).toHaveCount(0);
    await expect(chips.getByRole("button", { name: /^Albums/ })).toBeVisible();

    await page.getByRole("button", { name: "Add to story" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("an incoming request can be accepted from the profile", async ({ page }) => {
    await signIn(page, "alice");
    await page.goto(`/profile/${ids().dave}`);
    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByRole("button", { name: /^Friends\. Unfriend/ })).toBeVisible();
  });
});

test.describe("groups", () => {
  test("creating a group makes you its admin and opens it", async ({ page }) => {
    await signIn(page, "bob");
    await page.goto("/groups");
    await page.getByRole("button", { name: "Create group" }).click();
    const name = `E2E Group ${Date.now()}`;
    await page.getByLabel("Group Name").fill(`  ${name}  `);
    await page.getByRole("dialog").getByRole("button", { name: "Create Group" }).click();

    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Joined/ })).toBeVisible();
    await page.getByRole("tab", { name: "Members" }).click();
    await expect(page.getByRole("tabpanel")).toContainText(/admin/i);
  });

  test("nobody can make themselves admin of someone else's group", async ({ page, request }) => {
    await signIn(page, "dave");
    const token = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.includes("auth-token"));
      return key ? JSON.parse(localStorage.getItem(key)!).access_token : null;
    });
    const db = (await import("./fixtures")).admin();
    const { data: group } = await db.from("groups").insert({ name: "Guarded", created_by: ids().alice }).select().single();

    const res = await request.post(`${process.env.E2E_SUPABASE_URL}/rest/v1/group_members`, {
      headers: { apikey: process.env.E2E_SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { group_id: group!.id, user_id: ids().dave, role: "admin" },
    });
    expect(res.status()).toBe(403);
  });
});
