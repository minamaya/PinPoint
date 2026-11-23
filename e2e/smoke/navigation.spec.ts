/**
 * E2E Tests: App Shell Navigation
 *
 * Tests MainLayout async Server Component wiring into AppHeader, UserMenu, and
 * BottomTabBar across desktop and mobile viewports (Class F cross-page journeys).
 * Component item lists, active states, and admin gating are covered in
 * `AppHeader.test.tsx`, `BottomTabBar.test.tsx`, `HelpMenu.test.tsx`, and
 * `user-menu-client.test.tsx`.
 */

import { test, expect } from "../support/fixtures.js";
import { STORAGE_STATE } from "../support/auth-state.js";

test.describe("Navigation (member)", () => {
  test.use({ storageState: STORAGE_STATE.member });

  test("authenticated shell navigates and hides admin sheet links for non-admins", async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name.includes("Mobile");
    await page.goto("/dashboard");

    const appHeader = page.getByTestId("app-header");
    await expect(appHeader).toBeVisible();

    if (isMobile) {
      await expect(page.getByTestId("bottom-tab-bar")).toBeVisible();
      await page.getByRole("button", { name: /more options/i }).click();
      const moreSheet = page.getByRole("dialog");
      await expect(moreSheet).toBeVisible();
      await expect(moreSheet.getByTestId("more-sheet-admin")).toHaveCount(0);
      await moreSheet.getByRole("button", { name: "Close menu" }).click();
      await expect(moreSheet).toBeHidden();
    } else {
      await appHeader.getByRole("link", { name: "Issues" }).click();
      await expect(page).toHaveURL(/\/issues/);
      await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
    }

    const userMenu = page.getByTestId("user-menu-button");
    await expect(userMenu).toBeVisible();
    await userMenu.click();

    const menuContent = page.getByRole("menu");
    await expect(
      menuContent.getByRole("menuitem", { name: "Sign Out" })
    ).toBeVisible();
    await menuContent.getByRole("menuitem", { name: "Settings" }).click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true })
    ).toBeVisible();
  });
});

test.describe("Bottom Tab Bar (mobile admin)", () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test("More sheet navigates to User Management for admin users", async ({
    page,
  }, testInfo) => {
    if (!testInfo.project.name.includes("Mobile")) {
      test.skip();
    }

    await page.goto("/dashboard");

    await page.getByRole("button", { name: /more options/i }).click();
    const moreSheet = page.getByRole("dialog");
    await expect(moreSheet).toBeVisible();

    await moreSheet.getByTestId("more-sheet-admin").click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(
      page.getByRole("heading", { name: "User Management" })
    ).toBeVisible();
  });
});
