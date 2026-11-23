/**
 * E2E: Machine Header Artwork (PP-o355.43)
 *
 * Verifies real browser CSS breakpoint switching (`md:hidden` vs
 * `hidden md:block`) and Next.js layout-segment transitions (`useSelectedLayoutSegment`)
 * between the Info tab and sibling tabs.
 *
 * Non-layout Info-tab contracts live at lower layers:
 * - InfoHero status/issues/links: `src/app/(app)/m/[initials]/(tabs)/info-hero.test.tsx`
 *   and `src/test/integration/machine-info-tab.test.tsx`
 * - Manage read-only Pinball Map gating: `src/test/integration/machine-edit-page.test.tsx`
 *   and `src/components/machines/PinballmapListingControl.test.tsx`
 * - Initials chip without artwork: `src/test/unit/components/machines/MachineDetailHeader.test.tsx`
 *   and `src/test/integration/machine-info-tab.test.tsx`
 */

import { test, expect } from "../support/fixtures.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import { seededMachines } from "../support/constants.js";

/**
 * Game artwork from the Pinball Map catalog (PP-o355.43). The seed gives only
 * Medieval Madness an OPDB image. Image requests are answered locally so the
 * suite never reaches img.opdb.org; the assertions cover which header renders,
 * not the third party's image.
 */
test.describe("Machine header artwork", () => {
  const artInitials = seededMachines.medievalMadness.initials;
  const artwork = { name: "Medieval Madness game artwork" };
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64"
  );

  test.use({ storageState: STORAGE_STATE.member });

  test.beforeEach(async ({ page }) => {
    await page.route("https://img.opdb.org/**", (route) =>
      route.fulfill({ contentType: "image/png", body: pixel })
    );
  });

  test.describe("desktop", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("every tab shows the artwork square with an OPDB credit", async ({
      page,
    }) => {
      for (const path of [`/m/${artInitials}`, `/m/${artInitials}/settings`]) {
        await page.goto(path);
        const header = page.locator("header").filter({
          has: page.getByRole("heading", { name: "Medieval Madness" }),
        });
        await expect(header.getByRole("img", artwork)).toBeVisible();
        await expect(
          header.getByRole("link", { name: "OPDB" })
        ).toHaveAttribute("href", /^https:\/\/img\.opdb\.org\//);
        await expect(page.getByTestId("machine-artwork-hero")).toBeHidden();
      }
    });
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("Info shows the full artwork; other tabs show the square", async ({
      page,
    }) => {
      await page.goto(`/m/${artInitials}`);
      const hero = page.getByTestId("machine-artwork-hero");
      await expect(hero).toBeVisible();
      await expect(hero.getByRole("img", artwork)).toBeVisible();
      await expect(
        hero.getByRole("heading", { name: "Medieval Madness" })
      ).toBeVisible();

      await page.getByTestId("machine-tab-settings").click();
      await expect(page).toHaveURL(new RegExp(`/m/${artInitials}/settings$`));
      await expect(page.getByTestId("machine-artwork-hero")).toHaveCount(0);
      await expect(page.getByRole("img", artwork)).toBeVisible();
    });
  });
});
