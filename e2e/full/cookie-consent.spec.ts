/**
 * E2E Test: Cookie Consent Banner
 *
 * Verifies RootLayout mounts the cookie consent banner when enabled and that
 * dismissing it persists across a full browser reload. Copy, /privacy link,
 * and client cookie state logic are covered in `CookieConsentBanner.test.tsx`
 * and `src/lib/cookies/client.test.ts`.
 *
 * Uses /m (public machines list) instead of / (landing page) for faster,
 * more reliable hydration on mobile viewports in CI.
 */

import { test, expect } from "../support/fixtures.js";
import { DEV_SHOW_COOKIE_BANNER_KEY } from "~/lib/cookies/constants.js";

test.describe("Cookie Consent Banner", () => {
  // Override the default storageState to specifically enable the banner for this test.
  // Even though it's disabled by default in E2E/Dev/Preview, the override
  // cookie will trigger its visibility in RootLayout.
  test.use({
    storageState: {
      cookies: [
        {
          name: DEV_SHOW_COOKIE_BANNER_KEY,
          value: "true",
          domain: process.env["PLAYWRIGHT_HOST"] ?? "localhost",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  });

  test("appears on first visit, dismisses on click, and stays dismissed across reload", async ({
    page,
  }) => {
    await page.goto("/m", { waitUntil: "domcontentloaded" });

    const banner = page.getByRole("region", {
      name: /cookie consent/i,
    });
    await expect(banner).toBeVisible();

    // Remove the Next.js dev overlay that intercepts pointer events on mobile
    // viewports. Under `next dev` (local runs) the <nextjs-portal> overlay
    // blocks clicks on fixed-position elements on small screens; CI's
    // production build has none, so this is a no-op there.
    await page.evaluate(() => {
      document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
    });

    await banner.getByRole("button", { name: /got it/i }).click();
    await expect(banner).not.toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(banner).not.toBeVisible();
  });
});
