/**
 * E2E: Collection edit sharing via account collaborators (PP-wqit.7).
 *
 * Full journey: the owner (Member User) creates a collection with a machine and
 * grants Technician User editor access; the editor sees the collection under
 * "Shared with you" and can edit its machines but not delete/share; the owner
 * revokes; the editor loses access on both My Collections and direct URL.
 *
 * Action-level auth and page-level gating are also guarded in:
 * - `src/test/integration/collections-actions.test.ts`
 * - `src/test/integration/collections-pages.test.tsx`
 */

import { test, expect, attachHydrationWait } from "../support/fixtures.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import { getTestPrefix } from "../support/test-isolation.js";
import {
  clickPageAction,
  expectNoPageAction,
  expectPageAction,
} from "../support/page-actions.js";

const EDITOR_NAME = "Technician User";

test.describe("Collection edit sharing (PP-wqit.7)", () => {
  test.use({ storageState: STORAGE_STATE.member });

  test("owner grants an editor, editor edits, owner revokes", async ({
    page,
    browser,
  }) => {
    const name = `${getTestPrefix()} EditShare`;

    // --- Owner creates a collection with one machine ----------------------
    await page.goto("/c/collections");
    await expect(async () => {
      await page.keyboard.press("Escape");
      await page.getByTestId("create-collection-trigger").click();
      const nameField = page.getByLabel("Name");
      await expect(nameField).toBeVisible({ timeout: 5_000 });
      await nameField.fill(name);
    }).toPass({ timeout: 15_000 });
    await page.getByTestId("collection-machines-multiselect").click();
    await page.getByPlaceholder("Search machines…").fill("Attack from Mars");
    await page.getByRole("option", { name: /Attack from Mars/ }).click();
    await page.keyboard.press("Escape");
    await page.getByTestId("create-collection-submit").click();
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}/);
    const collectionUrl = page.url();
    await expect(
      page.getByRole("link", { name: "Attack from Mars", exact: true })
    ).toBeVisible();

    // --- Owner grants Technician User editor access -----------------------
    await clickPageAction(page, "Share");
    await page.getByTestId("collab-add-trigger").click();
    await page.getByPlaceholder("Search members…").fill("Technician");
    await page.getByRole("option", { name: new RegExp(EDITOR_NAME) }).click();
    await expect(page.getByLabel(`Remove ${EDITOR_NAME}`)).toBeVisible();
    await page.keyboard.press("Escape");

    // --- Editor sees it under "Shared with you" and can edit --------------
    const editorCtx = await browser.newContext({
      storageState: STORAGE_STATE.technician,
    });
    try {
      const ed = attachHydrationWait(await editorCtx.newPage());
      await ed.goto("/c/collections");
      await expect(
        ed.getByRole("heading", { name: "Shared with you" })
      ).toBeVisible();
      // Scope to this run's uniquely named row across parallel workers.
      const sharedLink = ed.getByRole("link", { name: new RegExp(name) });
      await expect(sharedLink).toBeVisible();
      await expect(sharedLink).toContainText("Shared by Member User");
      await expect(sharedLink).toContainText("Editor");

      await sharedLink.click();
      await expect(ed).toHaveURL(/\/c\/[0-9a-f-]{36}/);
      await expectPageAction(ed, "Edit collection…");
      await expectNoPageAction(ed, "Share");
      await expectNoPageAction(ed, "Delete collection");

      // Editor adds a machine and saves.
      await clickPageAction(ed, "Edit collection…");
      await ed.getByTestId("collection-machines-multiselect").click();
      await ed.getByPlaceholder("Search machines…").last().fill("Hyperball");
      await ed.getByRole("option", { name: /Hyperball/ }).click();
      await ed.keyboard.press("Escape");
      await ed.getByTestId("collection-save").click();
      await expect(
        ed.getByRole("link", { name: "Hyperball", exact: true })
      ).toBeVisible();

      // --- Owner revokes access -------------------------------------------
      await page.goto(collectionUrl);
      await clickPageAction(page, "Share");
      await page.getByLabel(`Remove ${EDITOR_NAME}`).click();
      await expect(page.getByLabel(`Remove ${EDITOR_NAME}`)).toHaveCount(0);
      await page.keyboard.press("Escape");

      // --- Revoked editor can no longer reach it --------------------------
      await ed.goto("/c/collections");
      await expect(
        ed.getByRole("link", { name: new RegExp(name) })
      ).toHaveCount(0);
      const response = await ed.goto(collectionUrl);
      expect(response?.status()).toBe(404);
      await expect(
        ed.getByRole("heading", { name: "Page not found" })
      ).toBeVisible();
    } finally {
      await editorCtx.close();
    }
  });
});
