import { expect, test } from "@playwright/test";
import { admin, PASSWORD } from "./fixtures";

test.describe("account", () => {
  test("Delete my account removes the user and their posts", async ({ page }) => {
    const db = admin();
    const email = `leaver.${Date.now()}@example.com`;
    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Leaving Soon" },
    });
    expect(error).toBeNull();
    const id = created.user!.id;
    await db.from("posts").insert({ user_id: id, content: "Goodbye post" });

    await page.goto("/auth");
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/settings");
    await page.getByRole("button", { name: "Delete my account" }).click();
    const dialog = page.getByRole("alertdialog");
    const confirm = dialog.getByRole("button", { name: "Delete account" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
    await confirm.click();

    await expect(page).toHaveURL(/\/auth$/);
    const { data: after } = await db.auth.admin.getUserById(id);
    expect(after.user).toBeNull();
    const { count } = await db.from("posts").select("id", { count: "exact", head: true }).eq("user_id", id);
    expect(count).toBe(0);
  });

  test("Forgot password: the emailed link lets you set a new password", async ({ page, request, baseURL }) => {
    const mailpit = process.env.E2E_MAILPIT_URL;
    test.skip(!mailpit, "E2E_MAILPIT_URL is not set (Supabase's Mailpit catches the email)");
    const db = admin();
    const email = `forgetful.${Date.now()}@example.com`;
    await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Forgetful" } });

    await page.goto("/auth");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByText("Enter your email first").first()).toBeVisible();

    await page.fill('input[type="email"]', email);
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByText(/a password reset link is on its way/).first()).toBeVisible();

    // Read the email from Mailpit and find the link in it.
    let link = "";
    await expect.poll(async () => {
      const list = await (await request.get(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
      const id = list.messages?.[0]?.ID;
      if (!id) return false;
      const message = await (await request.get(`${mailpit}/api/v1/message/${id}`)).json();
      link = (message.HTML ?? message.Text ?? "").match(/https?:\/\/[^"'\s]+\/auth\/v1\/verify[^"'\s]+/)?.[0]?.replace(/&amp;/g, "&") ?? "";
      return !!link;
    }, { timeout: 15_000 }).toBe(true);

    // Supabase verifies the token and redirects with the session in the URL fragment. Locally it
    // only redirects to its default site address, so send that fragment to the app under test.
    const verify = await request.get(link, { maxRedirects: 0 });
    const location = verify.headers()["location"];
    expect(location).toContain("type=recovery");
    await page.goto(`${baseURL}/reset-password${location.slice(location.indexOf("#"))}`);

    await page.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
    await page.getByLabel("Confirm new password").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/\/$/);

    // The new password works.
    const { error } = await (await import("@supabase/supabase-js"))
      .createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
      .auth.signInWithPassword({ email, password: "a-brand-new-password" });
    expect(error).toBeNull();
  });

  test("an expired reset link explains what to do", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText(/expired or was already used/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
  });
});
