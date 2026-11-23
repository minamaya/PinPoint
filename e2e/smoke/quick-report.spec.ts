/**
 * Smoke tests for Multiple issues route access and layout (PP-sn34, PP-nffph.6).
 *
 * Role-capability matrix parity (member/technician/admin) is covered in
 * `permissions-matrix.test.ts` and `quick-report-form.test.tsx`.
 */

import { test, expect } from "../support/fixtures.js";
import {
  assertNoA11yViolations,
  assertNoHorizontalOverflow,
  loginAs,
} from "../support/actions.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import { TEST_USERS } from "../support/constants.js";

test.describe("quick report access", () => {
  test("unauthenticated request to /report/multiple redirects to login", async ({
    request,
  }) => {
    const response = await request.get("/report/multiple", {
      headers: { "x-skip-autologin": "true" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    const location = new URL(
      response.headers()["location"] ?? "",
      "http://localhost"
    );
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/report/multiple");
  });

  test("redirects a guest away from Multiple issues to Quick report", async ({
    page,
  }, testInfo) => {
    await loginAs(page, testInfo, {
      email: TEST_USERS.guest.email,
      password: TEST_USERS.guest.password,
    });
    await page.goto("/report/multiple");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/report");
    await expect(page.getByRole("textbox", { name: "Problem" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Report multiple issues" })
    ).toHaveCount(0);
  });

  test.describe("member access", () => {
    test.use({ storageState: STORAGE_STATE.member });

    test("Quick report navigates to Multiple issues and renders grid", async ({
      page,
    }) => {
      await page.goto("/report");
      await page.getByRole("link", { name: "Report multiple issues" }).click();

      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe("/report/multiple");
      await expect(
        page.getByRole("heading", { name: /report an issue/i })
      ).toBeVisible();
      await expect(page.getByTestId("quick-report-grid")).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Detailed report" })
      ).toBeVisible();

      await assertNoHorizontalOverflow(page);
      await assertNoA11yViolations(page);
    });
  });
});
