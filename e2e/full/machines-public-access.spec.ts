/**
 * E2E: Public Machine Access
 *
 * Covers the anonymous public-browsing journey across `/m` → `/m/[initials]`
 * → `/m/[initials]/maintenance` and the real browser CSS container-query
 * layout of the Summary Widgets (desktop side-by-side vs narrow phone drop).
 *
 * Playability Segment filter behavior and query counts live in
 * `src/components/machines/view/MachineView.test.tsx` and
 * `src/test/integration/machine-view-queries.test.ts`.
 */

import { test, expect } from "../support/fixtures.js";
import { machineViewRow } from "../support/actions.js";
import { seededMachines } from "../support/constants.js";

test.describe("Machines Public Access", () => {
  test("unauthenticated user can browse machines list, machine Info, and Service issues", async ({
    page,
  }) => {
    await page.goto("/m");
    await expect(page).toHaveURL(/\/m(?:\?.*)?$/);
    await expect(
      page.getByRole("heading", { name: "Machines", exact: true })
    ).toBeVisible();

    const row = machineViewRow(page, seededMachines.medievalMadness.name);
    await expect(row).toBeVisible();
    await row
      .getByRole("link", {
        name: seededMachines.medievalMadness.name,
        exact: true,
      })
      .click();

    await expect(page).toHaveURL(
      new RegExp(`/m/${seededMachines.medievalMadness.initials}$`)
    );
    await expect(
      page.getByRole("heading", { name: seededMachines.medievalMadness.name })
    ).toBeVisible();

    await page.getByTestId("machine-tab-maintenance").click();
    await expect(page).toHaveURL(
      new RegExp(`/m/${seededMachines.medievalMadness.initials}/maintenance$`)
    );
    await expect(page.getByTestId("issue-card").first()).toBeVisible();
  });

  // Summary Widgets sit side by side at every width, each at least 240px
  // wide, and whole widgets drop from the right when the row cannot hold
  // them (widgets §2.3, §2.7).
  test.describe("at a desktop width", () => {
    test.use({ viewport: { width: 1024, height: 768 } });

    test("Presence and Playability sit side by side", async ({ page }) => {
      await page.goto("/m");
      const presence = page.getByRole("region", { name: "Presence" });
      const playability = page.getByRole("region", { name: "Playability" });
      await expect(presence).toBeVisible();
      await expect(playability).toBeVisible();
      await expect(
        page.getByRole("button", { name: /^Summary: / })
      ).toHaveCount(0);

      const presenceBox = await presence.boundingBox();
      const playabilityBox = await playability.boundingBox();
      expect(presenceBox).not.toBeNull();
      expect(playabilityBox).not.toBeNull();
      if (presenceBox && playabilityBox) {
        expect(playabilityBox.y).toBe(presenceBox.y);
        expect(playabilityBox.x).toBeGreaterThan(
          presenceBox.x + presenceBox.width
        );
      }
    });
  });

  test.describe("on a phone too narrow for two widgets", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("only Presence shows; Playability drops from the right", async ({
      page,
    }) => {
      await page.goto("/m");
      await expect(
        page.getByRole("region", { name: "Presence" })
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Playability" })
      ).toBeHidden();
      await expect(
        page.getByRole("button", { name: /^Summary: / })
      ).toHaveCount(0);
    });
  });
});
