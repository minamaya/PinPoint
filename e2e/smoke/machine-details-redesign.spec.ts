/**
 * E2E Tests: Machine Details Redesign (Smoke)
 *
 * Keeps the browser-only admin `/m?presence=all` overflow + axe-core a11y
 * check and the Service-tab CSV download journey.
 *
 * Lowered / deduplicated coverage:
 * - Info tab & Service tab overflow/a11y: `e2e/smoke/responsive-overflow.spec.ts`
 * - MachineIssuesCard rendering: `src/app/(app)/m/[initials]/machine-issues-card.test.tsx`
 * - `/m/new` non-admin Forbidden guard: `src/test/integration/new-machine-page.test.tsx`
 */

import { test, expect } from "../support/fixtures.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import {
  assertNoHorizontalOverflow,
  assertNoA11yViolations,
} from "../support/actions.js";
import { seededMachines } from "../support/constants.js";

test.describe("Machine Details Redesign", () => {
  test.describe("Admin machine list overflow check", () => {
    test.use({ storageState: STORAGE_STATE.admin });

    test("should display machine list page without horizontal overflow", async ({
      page,
    }) => {
      await page.goto("/m?presence=all");
      await expect(
        page.getByRole("heading", { name: "Machines", exact: true })
      ).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await assertNoA11yViolations(page);
    });
  });

  test.describe("Service tab issue export", () => {
    test.use({ storageState: STORAGE_STATE.member });

    test("Service tab exports machine issues to CSV", async ({ page }) => {
      // Export lives inside the issues card's ⋯ "Issue list actions" menu.
      await page.goto(`/m/${seededMachines.addamsFamily.initials}/maintenance`);

      await page.getByRole("button", { name: "Issue list actions" }).click();
      const exportItem = page.getByRole("menuitem", {
        name: /Export all issues/i,
      });
      await expect(exportItem).toBeVisible();

      const downloadPromise = page.waitForEvent("download");
      await exportItem.click();

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(
        /^pinpoint-TAF-issues-\d{4}-\d{2}-\d{2}\.csv$/
      );
    });
  });
});
