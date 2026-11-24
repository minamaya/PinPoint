/**
 * E2E Tests: Collection descriptions (PP-wqit.11)
 *
 * Real-browser TipTap editor & CSS `line-clamp` / `ClampedDescription` overflow
 * journey (collections-and-tags 2.8, 4.7, 4.12): writes a long description in
 * the Edit dialog, verifies real-browser clamping ("Show more" -> "Show less")
 * and cross-tab visibility, and clears it.
 *
 * Validation, normalization, permissions, empty-description omission, and View
 * Link description rendering are covered by:
 * - `src/test/integration/collections-actions.test.ts`
 * - `src/test/integration/collections-pages.test.tsx`
 * - `src/components/collections/ClampedDescription.test.tsx`
 */

import { test, expect } from "../support/fixtures.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import { getTestPrefix } from "../support/test-isolation.js";
import { clickPageAction } from "../support/page-actions.js";

// Long enough to run past three lines even when the description takes the
// full width under the title.
const DESCRIPTION =
  "The machines we put in front of players for the monthly tournament and the Thursday league. " +
  "Everything in this bank should be tournament-ready before each event: fresh rubbers, a level playfield, and tilt set to the league standard. " +
  "Report problems with the Tournament tag so the tournament director sees them first, and tell the director before swapping a machine out of the bank. " +
  "Backups, in order, are the machines listed on the league page. Ask in the league channel if a machine here is missing or out of order.";

test.describe("Collection descriptions (PP-wqit.11)", () => {
  test.use({ storageState: STORAGE_STATE.member });

  test("writes, clamps, persists across tabs, and clears a collection description", async ({
    page,
  }) => {
    const name = `${getTestPrefix()} Described`;

    await page.goto("/c/collections");
    await expect(async () => {
      await page.keyboard.press("Escape");
      await page.getByTestId("create-collection-trigger").click();
      const nameField = page.getByLabel("Name");
      await expect(nameField).toBeVisible({ timeout: 5_000 });
      await nameField.fill(name);
    }).toPass({ timeout: 15_000 });
    await page.getByTestId("create-collection-submit").click();
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}/);

    // No description yet: the header shows none (4.7).
    await expect(page.getByTestId("collection-description")).toHaveCount(0);

    // Write one in the Edit dialog via TipTap (4.17).
    await clickPageAction(page, "Edit collection…");
    const dialog = page.getByRole("dialog", { name: "Edit collection" });
    const editor = dialog.getByRole("textbox", { name: "Description" });
    await editor.click();
    await page.keyboard.type(DESCRIPTION);
    await dialog.getByTestId("collection-save").click();
    await expect(dialog).toBeHidden();

    // Real-browser CSS line-clamp triggers Show more / Show less (4.11, 4.12).
    const description = page.getByTestId("collection-description");
    await expect(description).toContainText("tournament-ready");
    const showMore = description.getByRole("button", { name: "Show more" });
    await expect(showMore).toBeVisible();
    await showMore.click();
    await expect(
      description.getByRole("button", { name: "Show less" })
    ).toHaveAttribute("aria-expanded", "true");

    // Shown across tabs, not just Overview.
    await page.getByTestId("collection-tab-issues").click();
    await expect(page).toHaveURL(/\/issues$/);
    await expect(page.getByTestId("collection-description")).toContainText(
      "tournament-ready"
    );

    // Clearing the description removes it.
    await clickPageAction(page, "Edit collection…");
    await dialog.getByRole("textbox", { name: "Description" }).click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await dialog.getByTestId("collection-save").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("collection-description")).toHaveCount(0);
  });
});
