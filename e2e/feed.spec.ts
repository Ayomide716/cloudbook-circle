import { expect, test } from "@playwright/test";
import { pngBuffer, signIn } from "./fixtures";

test.describe("feed", () => {
  test("has the redesign's layout on a phone", async ({ page }) => {
    await signIn(page, "alice");

    // Bottom bar: the mockup's tabs, in a pill floating above the bottom of the screen.
    const bar = page.getByRole("navigation", { name: "Main" }).last();
    const tabs = bar.getByRole("button");
    await expect(tabs).toHaveCount(6);
    for (const [i, name] of [/^Home$/, /^Friends/, /^Reels$/, /^Groups$/, /^Notifications/, /^Profile$/].entries()) {
      await expect(tabs.nth(i)).toHaveAccessibleName(name);
    }
    await expect(bar.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
    // Dave's request shows on the Friends tab.
    await expect(bar.getByRole("button", { name: "Friends, 1 new" })).toBeVisible();
    // The bar slides in when the page opens; measure once it has settled.
    const viewport = page.viewportSize()!;
    // A floating pill: 10px above the bottom edge and 12px in from each side.
    await expect.poll(async () => {
      const box = (await bar.boundingBox())!;
      return Math.abs(viewport.height - (box.y + box.height) - 10) <= 1;
    }).toBe(true);
    const box = (await bar.boundingBox())!;
    expect(Math.round(box.x)).toBe(12);
    expect(Math.round(box.width)).toBe(viewport.width - 24);

    // As in Facebook's app: create, search and Messenger in the top bar; Menu is the last tab.
    await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
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

    const firstPost = page.locator("main .feed-section").filter({ has: page.getByRole("button", { name: /^Like/ }) }).first();
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

  test("the header and bottom bar stay put when changing tabs, as in Facebook's app", async ({ page }) => {
    await signIn(page, "alice");
    const bar = page.getByRole("navigation", { name: "Main" }).last();
    // Tag the bars; if a page change rebuilt them, the tags would be gone.
    await page.locator("header").first().evaluate((el) => el.setAttribute("data-kept", "1"));
    await bar.evaluate((el) => el.setAttribute("data-kept", "1"));

    for (const tab of ["Friends", "Groups", "Notifications", "Home"]) {
      await bar.getByRole("button", { name: new RegExp(`^${tab}`) }).click();
      await expect(bar.getByRole("button", { name: new RegExp(`^${tab}`) })).toHaveAttribute("aria-current", "page");
      await expect(page.locator("header[data-kept]")).toHaveCount(1);
      await expect(page.locator("nav[data-kept]")).toHaveCount(1);
    }
  });

  test("the Menu tab is a full page with shortcuts, and + opens the composer", async ({ page }) => {
    await signIn(page, "alice");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await expect(page).toHaveURL(/\/menu$/);
    await expect(page.getByRole("heading", { level: 1, name: "Menu" })).toBeVisible();
    await expect(page.getByText("Alice Johnson")).toBeVisible();
    await page.getByRole("navigation", { name: "Shortcuts" }).getByRole("button", { name: "Events" }).click();
    await expect(page).toHaveURL(/\/events$/);

    await page.getByRole("button", { name: "Create post" }).click();
    await expect(page.getByRole("dialog").getByText("Create post")).toBeVisible();
  });

  test("✕ hides a friend's post and asks why, as on Facebook", async ({ page }) => {
    await signIn(page, "alice");
    const post = page.locator(".feed-section")
      .filter({ hasText: "Saturday at Lekki Conservation Centre" })
      .filter({ has: page.getByRole("button", { name: "Hide post" }) })
      .last();
    await expect(post.getByText("Lekki, Lagos")).toBeVisible();
    await post.getByRole("button", { name: "Hide post" }).click();

    const panel = page.getByRole("region", { name: "Post hidden" });
    await expect(panel.getByText("Why aren't you interested?")).toBeVisible();
    await panel.getByRole("button", { name: "Seen it before" }).click();
    await expect(panel.getByText(/Thanks\. You'll see fewer posts like this/)).toBeVisible();
    await expect(panel.getByRole("button", { name: /Snooze Bob Martins for 30 days/ })).toBeVisible();
    await expect(page.getByText("Saturday at Lekki Conservation Centre")).toBeHidden();

    // Still hidden after a reload; Unhide brings it back.
    await page.reload();
    await expect(page.getByText("Saturday at Lekki Conservation Centre")).toBeHidden();
    await page.evaluate(() => localStorage.removeItem("cloudbook_hidden_posts"));
    await page.reload();
    await expect(page.getByText("Saturday at Lekki Conservation Centre")).toBeVisible();
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
