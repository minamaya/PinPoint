/**
 * Smoke Test: Landing Page
 *
 * Tests the public landing page renders with key elements, CTAs,
 * unauthenticated header controls, passes layout/a11y checks, and navigates
 * to the public dashboard. Static link attributes and copy live in
 * `src/app/(site)/site-pages.test.tsx`.
 */

import { test, expect } from "../support/fixtures.js";
import {
  assertNoA11yViolations,
  assertNoHorizontalOverflow,
} from "../support/actions.js";

test.describe("Landing Page", () => {
  test("loads welcome content, CTAs, unauthenticated header, and navigates to public dashboard", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/PinPoint/);
    await expect(
      page.getByRole("heading", { name: /Welcome to PinPoint/i })
    ).toBeVisible();
    await expect(page.getByTestId("hero-apc-logo")).toBeVisible();

    await expect(page.getByTestId("cta-browse-machines")).toHaveAttribute(
      "href",
      "/m"
    );
    await expect(page.getByTestId("cta-report-issue")).toHaveAttribute(
      "href",
      "/report"
    );
    const dashboardCta = page.getByTestId("cta-dashboard");
    await expect(dashboardCta).toHaveAttribute("href", "/dashboard");

    await expect(page.getByTestId("nav-signup")).toBeVisible();
    await expect(page.getByTestId("nav-signin")).toBeVisible();

    await assertNoHorizontalOverflow(page);
    await assertNoA11yViolations(page);

    await dashboardCta.click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId("quick-stats")).toBeVisible();
  });
});
