/**
 * E2E smoke: Settings page loads for an authenticated user and links to their
 * public profile page without 500s.
 *
 * Full OAuth round-trip behaviour is covered by unit tests (oauth-actions.test.ts,
 * connected-accounts-section.test.tsx); full profile editing is in
 * e2e/full/profile-edit.spec.ts.
 */

import { test, expect } from "../support/fixtures.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import { assertNoA11yViolations } from "../support/actions.js";

test.describe("Settings page (smoke)", () => {
  test.use({ storageState: STORAGE_STATE.member });

  test("Settings loads Connected Accounts and links to own profile", async ({
    page,
  }) => {
    await page.goto("/settings");

    await expect(
      page.getByRole("heading", { name: /connected accounts/i })
    ).toBeVisible();

    await assertNoA11yViolations(page);

    await page.getByRole("link", { name: /view your public profile/i }).click();

    await expect(page).toHaveURL(/\/u\//);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
