import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { admin, PASSWORD, signIn, USERS } from "./fixtures";

const ids = () => JSON.parse(process.env.E2E_IDS ?? "{}") as Record<string, string>;

/** Erin's own database client (as the app would use it), to check what the database allows. */
async function asErin() {
  const db = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email: USERS.erin.email, password: PASSWORD });
  if (error) throw error;
  return db;
}

test.describe("blocking and reporting", () => {
  test("blocking someone hides them and stops them reaching you, until unblocked", async ({ page, browser }) => {
    await signIn(page, "alice");
    await expect(page.getByText("Erin's first post on CloudBook")).toBeVisible();

    await page.goto(`/profile/${ids().erin}`);
    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name: "Block" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("won't be able to see your posts");
    await page.getByRole("alertdialog").getByRole("button", { name: "Block" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "You blocked Erin Adeyemi" })).toBeVisible();

    // Gone from the feed.
    await page.goto("/");
    await expect(page.getByText("Saturday at Lekki Conservation Centre")).toBeVisible();
    await expect(page.getByText("Erin's first post on CloudBook")).toBeHidden();

    // The database refuses Erin's messages and friend requests to Alice.
    const erin = await asErin();
    const message = await erin.from("messages").insert({ sender_id: ids().erin, receiver_id: ids().alice, content: "hi" });
    expect(message.error?.code).toBe("42501");
    const request = await erin.from("friendships").insert({ user_id: ids().erin, friend_id: ids().alice, status: "pending" });
    expect(request.error?.code).toBe("42501");

    // Erin sees that Alice's profile isn't available.
    const erinContext = await browser.newContext();
    const erinPage = await erinContext.newPage();
    await signIn(erinPage, "erin");
    await erinPage.goto(`/profile/${ids().alice}`);
    await expect(erinPage.getByRole("heading", { level: 1, name: "This profile isn't available" })).toBeVisible();
    await erinContext.close();

    // Settings → Blocked people → Unblock.
    await page.goto("/settings");
    const list = page.locator("[aria-label='Blocked people']");
    await expect(list.getByText("Erin Adeyemi")).toBeVisible();
    await list.getByRole("button", { name: "Unblock" }).click();
    await expect(list.getByText("You haven't blocked anyone.")).toBeVisible();
    await page.goto("/");
    await expect(page.getByText("Erin's first post on CloudBook")).toBeVisible();
  });

  test("a profile can be reported from its ··· menu", async ({ page }) => {
    await signIn(page, "dave");
    await page.goto(`/profile/${ids().bob}`);
    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name: "Report profile" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Spam or misleading" }).click();
    await dialog.getByRole("button", { name: "Submit Report" }).click();
    await expect(dialog).toBeHidden();

    const { data } = await admin().from("reports").select("reason, reported_type").eq("reporter_id", ids().dave).eq("reported_id", ids().bob);
    expect(data).toEqual([{ reason: "Spam or misleading", reported_type: "profile" }]);
  });
});
