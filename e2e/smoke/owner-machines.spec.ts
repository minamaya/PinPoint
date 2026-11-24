/**
 * E2E Tests: A person's machines (spec collections-and-tags 6.4–6.5)
 *
 * Smoke coverage for the account-menu My Machines journey (with overflow +
 * axe-core a11y checks) and permanent 308 redirects from retired Owner
 * Collection links (next.config.ts).
 *
 * Owner-filtered RSC rendering and InfoRail owner profile links live in:
 *   - `src/test/integration/machines-page.test.tsx`
 *   - `src/app/(app)/m/[initials]/(tabs)/info-rail-owner-link.test.tsx`
 */

import { test, expect } from "../support/fixtures.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import {
  assertNoA11yViolations,
  assertNoHorizontalOverflow,
  machineViewRow,
  retryNavClick,
} from "../support/actions.js";
import { seededMachines, seededMember } from "../support/constants.js";
import { getProfileIdByEmail } from "../support/supabase-admin.js";

const ownedMachine = seededMachines.attackFromMars.name;
const otherOwnersMachine = seededMachines.addamsFamily.name;

test.describe("A person's machines", () => {
  test.describe("signed in", () => {
    test.use({ storageState: STORAGE_STATE.member });

    test("My Machines in the account menu opens Machines filtered to Me", async ({
      page,
    }) => {
      await page.goto("/");
      // Re-issue the menu navigation until it takes (PP-2b3r). retryNavClick
      // presses Escape before each attempt to reset a Radix dropdown left open
      // by a prior failed click.
      await retryNavClick(
        page,
        async () => {
          await page.getByTestId("user-menu-button").click();
          await page.getByTestId("user-menu-my-machines").click();
        },
        /\/m\?owner=me$/
      );
      await expect(machineViewRow(page, ownedMachine)).toBeVisible();
      await expect(machineViewRow(page, otherOwnersMachine)).toHaveCount(0);
      await assertNoHorizontalOverflow(page);
      await assertNoA11yViolations(page);
    });
  });

  // Old Owner Collection links (spec 6.5). Anonymous: no session, and the
  // header keeps local dev autologin from signing the request in.
  test.describe("old Owner Collection links", () => {
    test.use({
      storageState: { cookies: [], origins: [] },
      extraHTTPHeaders: { "x-skip-autologin": "true" },
    });

    let memberId = "";
    test.beforeAll(async () => {
      memberId = await getProfileIdByEmail(seededMember.email);
    });

    test("redirect permanently to the owner-filtered lists", async ({
      request,
    }) => {
      const cases = [
        { tab: "", list: "/m" },
        { tab: "/timeline", list: "/m" },
        { tab: "/issues", list: "/issues" },
      ];
      for (const { tab, list } of cases) {
        const response = await request.get(`/c/owner/${memberId}${tab}`, {
          maxRedirects: 0,
        });
        expect(response.status(), `/c/owner/[member]${tab}`).toBe(308);
        const location = new URL(
          response.headers()["location"] ?? "",
          "http://localhost"
        );
        expect(location.pathname).toBe(list);
        expect(location.searchParams.get("owner")).toBe(memberId);
      }
    });
  });
});
