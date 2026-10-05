import { expect, test } from "@playwright/test";
import { pngBuffer, signIn } from "./fixtures";

test.describe("feed", () => {
  test("has the redesign's layout on a phone", async ({ page }) => {
    await signIn(page, "alice");

    // Bottom bar: the mockup's tabs, flush with the bottom of the screen.
    const bar = page.getByRole("navigation", { name: "Main" }).last();
    const tabs = bar.getByRole("button");
    await expect(tabs).toHaveCount(6);
    for (const [i, name] of [/^Home$/, /^Reels$/, /^Friends/, /^Groups$/, /^Notifications/, /^Menu$/].entries()) {
      await expect(tabs.nth(i)).toHaveAccessibleName(name);
    }
    await expect(bar.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
    // Dave's request shows on the Friends tab.
    await expect(bar.getByRole("button", { name: "Friends, 1 new" })).toBeVisible();
    // The bar slides in when the page opens; measure once it has settled.
    const viewport = page.viewportSize()!;
    await expect.poll(async () => {
      const box = (await bar.boundingBox())!;
      return Math.abs(box.y + box.height - viewport.height) <= 1;
    }).toBe(true);
    expect(Math.round((await bar.boundingBox())!.width)).toBe(viewport.width);

    // Top bar, as in Facebook's app: create, search and Messenger.
    await expect(page.getByRole("button", { name: "Create post" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Messages/ })).toBeVisible();

    // Bob's post is in the feed and nothing scrolls sideways.
    await expect(page.getByText("Saturday at Lekki Conservation Centre")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("a new post appears first, once, even after a double tap", async ({ page }) => {
    await signIn(page, "alice");
    const text = `Hello from the e2e test ${Date.now()}`;
    await page.getByRole("button", { name: /What's on your mind/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("textarea").first().fill(text);
    await dialog.getByRole("button", { name: "Post", exact: true }).evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
    await expect(dialog).toBeHidden();

    const firstPost = page.locator("main .feed-section").filter({ hasText: /ago/ }).first();
    await expect(firstPost).toContainText(text);
    await expect(page.getByText(text)).toHaveCount(1);
  });

  test("several photos show as a collage and open in the viewer", async ({ page }) => {
    await signIn(page, "alice");
    await page.getByRole("button", { name: /What's on your mind/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type=file][multiple]').setInputFiles(
      Array.from({ length: 7 }, (_, i) => ({ name: `photo-${i + 1}.png`, mimeType: "image/png", buffer: pngBuffer(i) }))
    );
    await expect(dialog.getByRole("img", { name: /Attached photo/ })).toHaveCount(7);
    await dialog.locator("textarea").first().fill("Meetup photos");
    await dialog.getByRole("button", { name: "Post", exact: true }).click();
    await expect(dialog).toBeHidden();

    const plus = page.getByRole("button", { name: "Open photo 5 of 7, 2 more" });
    await expect(plus).toBeVisible();
    await expect(plus).toContainText("+2");
    await plus.click();

    const viewer = page.getByRole("dialog");
    await expect(viewer.getByText("5 of 7", { exact: true })).toBeVisible();
    await viewer.getByRole("button", { name: "Next photo" }).click();
    await expect(viewer.getByText("6 of 7", { exact: true })).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(viewer.getByText("5 of 7", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
  });

  test("the Menu tab is a full page with shortcuts, and + opens the composer", async ({ page }) => {
    await signIn(page, "alice");
    const bar = page.getByRole("navigation", { name: "Main" }).last();
    await bar.getByRole("button", { name: "Menu" }).click();
    await expect(page).toHaveURL(/\/menu$/);
    await expect(page.getByRole("heading", { level: 1, name: "Menu" })).toBeVisible();
    await expect(page.getByText("Alice Johnson")).toBeVisible();
    await page.getByRole("navigation", { name: "Shortcuts" }).getByRole("button", { name: "Marketplace" }).click();
    await expect(page).toHaveURL(/\/marketplace$/);

    await page.getByRole("button", { name: "Create post" }).click();
    await expect(page.getByRole("dialog").getByText("Create post")).toBeVisible();
  });

  test("double-tapping a photo likes the post", async ({ page }) => {
    await signIn(page, "alice");
    await page.getByRole("button", { name: /What's on your mind/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("input[type=file][multiple]").setInputFiles([{ name: "p.png", mimeType: "image/png", buffer: pngBuffer(1) }]);
    await expect(dialog.getByRole("img", { name: "Attached photo" })).toBeVisible();
    await dialog.locator("textarea").first().fill("Double tap me");
    await dialog.getByRole("button", { name: "Post", exact: true }).click();
    await expect(dialog).toBeHidden();

    const post = page.locator("main .feed-section").filter({ hasText: "Double tap me" }).first();
    await post.getByRole("button", { name: "Open photo" }).dblclick();
    await expect(post.getByRole("button", { name: /Like/, pressed: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
