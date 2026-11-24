/**
 * E2E Tests: Personal collections (PP-wqit.1, Wave 0a & Wave 0b)
 *
 * Smoke journey for the personal collections flow: open "My Collections" from
 * the user menu, create a collection, confirm its empty state, add a machine
 * via the inline picker, browse Overview / Issues / Timeline without 500, then
 * enable a View Link and verify anonymous read-only vs. owner-full access.
 *
 * Deeper page/gating and action contracts live at cheaper layers:
 * - Server Actions: `src/test/integration/collections-actions.test.ts`
 * - Page loaders & gating: `src/test/integration/collections-pages.test.tsx`
 * - Dialog & inline picker UI: `src/components/collections/*.test.tsx`
 */

import { test, expect, attachHydrationWait } from "../support/fixtures.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import { getTestPrefix } from "../support/test-isolation.js";
import {
  clickPageAction,
  expectNoPageAction,
  expectPageAction,
} from "../support/page-actions.js";

test.describe("Personal collections (PP-wqit.1)", () => {
  test.use({ storageState: STORAGE_STATE.member });

  test("create a collection, add a machine, browse its tabs, and share a view link anonymously", async ({
    page,
    browser,
  }) => {
    const name = `${getTestPrefix()} Faves`;

    // Reach "My Collections" via the user menu.
    await page.goto("/");
    await page.getByTestId("user-menu-button").click();
    await page.getByTestId("user-menu-my-collections").click();
    await expect(page).toHaveURL(/\/c\/collections$/);

    // Create a collection via the "New collection" modal — redirects to its view.
    // Re-issue the trigger click until the modal opens AND the fill sticks
    // (PP-2b3r). The fill is inside the retry because a Fast Refresh remount
    // between seeing the Name field and filling it re-triggers the exact
    // dropped-click bug — the modal disappears and the fill dies on a hidden
    // field. The submit stays outside: re-clicking it would create a duplicate.
    await expect(async () => {
      await page.keyboard.press("Escape");
      await page.getByTestId("create-collection-trigger").click();
      const nameField = page.getByLabel("Name");
      await expect(nameField).toBeVisible({ timeout: 5_000 });
      await nameField.fill(name);
    }).toPass({ timeout: 15_000 });
    await page.getByTestId("create-collection-submit").click();
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}/);

    // Fresh collection is empty — the owner sees the inline add-machines picker.
    await expect(
      page.getByText("This collection is empty. Add machines to get started.")
    ).toBeVisible();

    // Add a machine via the inline empty-state picker.
    await page.getByTestId("collection-machines-multiselect").click();
    await page.getByPlaceholder("Search machines…").fill("Attack from Mars");
    await page.getByRole("option", { name: /Attack from Mars/ }).click();
    await page.keyboard.press("Escape"); // close the multi-select popover
    await page.getByTestId("collection-add-machines").click();

    // Overview now renders the shared Machine View and owner breadcrumb.
    await expect(
      page.getByRole("link", { name: "Attack from Mars", exact: true })
    ).toBeVisible();
    const title = page.getByRole("heading", { level: 1, name, exact: true });
    await expect(title).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Breadcrumb" })
        .getByRole("link", { name: "Collections", exact: true })
    ).toHaveAttribute("href", "/c/collections");

    // Issues and Timeline tabs render without 500, under the same header.
    await page.getByTestId("collection-tab-issues").click();
    await expect(page).toHaveURL(/\/issues$/);
    await expect(title).toBeVisible();

    await page.getByTestId("collection-tab-timeline").click();
    await expect(page).toHaveURL(/\/timeline$/);
    await expect(title).toBeVisible();

    // Enable view sharing and open the link anonymously — no login redirect,
    // read-only Overview without breadcrumb or owner controls.
    await clickPageAction(page, "Share");
    await page.getByTestId("collection-share-toggle").click();
    const shareUrl = await page
      .getByTestId("collection-share-url")
      .inputValue();
    expect(shareUrl).toMatch(/\/c\/[^/]+$/);

    const anon = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    try {
      const anonPage = attachHydrationWait(await anon.newPage());
      await anonPage.goto(shareUrl);
      await expect(
        anonPage.getByRole("link", { name: "Attack from Mars", exact: true })
      ).toBeVisible();
      await expect(anonPage).toHaveURL(/\/c\/[^/]+$/);
      await expect(
        anonPage.getByRole("heading", { level: 1, name, exact: true })
      ).toBeVisible();
      await expect(
        anonPage.getByRole("navigation", { name: "Breadcrumb" })
      ).toHaveCount(0);
      await expectNoPageAction(anonPage, "Share");
      await expectNoPageAction(anonPage, "Edit collection…");
    } finally {
      await anon.close();
    }

    // The owner opening their own share link still sees full controls.
    await page.goto(shareUrl);
    await expectPageAction(page, "Share");
    await expectPageAction(page, "Edit collection…");
  });
});
