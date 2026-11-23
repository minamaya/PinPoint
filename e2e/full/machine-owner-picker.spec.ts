/**
 * E2E Tests: Machine Owner Picker UX (PP-6oi)
 *
 * Verifies the class-F multi-step user journey for the promote-and-assign
 * dialog that appears when a guest is selected as machine owner:
 * submitting `/m/new` with a guest owner triggers `ASSIGNEE_NOT_MEMBER`,
 * opens the confirmation dialog, and confirming atomically promotes the
 * guest and redirects to the new machine page.
 *
 * - Promote dialog open / badge / Cancel UI state: `src/app/(app)/m/new/create-machine-form.test.tsx`
 * - H-class `OwnerSelect` filtering, selection, and inline invite state: `src/components/machines/OwnerSelect.test.tsx`
 * - Server Action `forcePromoteUserId` atomicity: `src/test/integration/machine-owner-promotion.test.ts`
 */

import { test, expect, type Page } from "../support/fixtures.js";
import { selectOwnerBySearch } from "../support/actions.js";
import { cleanupTestEntities } from "../support/cleanup.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import { createTestUser, deleteTestUser } from "../support/supabase-admin.js";

const testMachines = new Set<string>();

// Each test gets its OWN throwaway guest instead of the seeded guest@test.com.
//
// The promote journey flips a guest to member for real — that is the whole
// point of the flow — so pointing it at a seeded user left a member where the
// next run needed a guest: no promote dialog appeared and both tests failed.
// Demoting the seeded user in teardown would restore it, but not safely: the
// comprehensive job runs this file in three browser projects against one
// database, so one project's demote can land while another still holds a
// guest-owned machine, and migration 0027's `user_profiles_no_demote_owner`
// trigger raises `check_violation` on exactly that. A per-test user mutates
// nothing shared, so there is no restore to get wrong. (PP-168u.)
let guestUserId: string | null = null;
let guestName = "";

/** Open the owner picker popover and wait for it to be interactive. */
async function openOwnerPicker(page: Page) {
  await page.getByTestId("owner-select").click();
  // Wait for the search input to be visible — it's a reliable sign the
  // popover is fully open and interactive.
  await expect(page.getByPlaceholder("Search users...")).toBeVisible({
    timeout: 5000,
  });
}

test.describe("Machine Owner Picker — promote-dialog journey (PP-6oi)", () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test.beforeEach(async () => {
    const testId = Math.random().toString(36).substring(7);
    guestName = `Ownerpick Guest${testId}`;
    // A user created through the auth admin API lands on `guest` by default
    // (the handle_new_user trigger in supabase/seed.sql), which is what this
    // journey needs.
    //
    // `@example.com`, NOT `@test.com`: nothing else can reclaim a leaked
    // auth.users row. `db:fast-reset` deliberately never truncates the auth
    // schema, and `cleanupTestEntities` lacks the privilege, so the ONLY
    // sweeper is global-setup's `cleanupInviteSignupUsers`, whose filter is
    // `@example.com`. A run that dies between this hook and the afterEach
    // (worker kill, timeout) would leave a `@test.com` row in auth.users
    // forever, regrowing the unbounded-growth problem PP-ph46 fixed. Seed
    // users are `@test.com` / `@pinpoint.internal`, so this domain also can
    // never collide with one.
    const user = await createTestUser(
      `owner-picker-guest-${testId}@example.com`,
      "TestPassword123",
      { firstName: "Ownerpick", lastName: `Guest${testId}` }
    );
    guestUserId = user.id;
  });

  test.afterEach(async () => {
    const userId = guestUserId;
    guestUserId = null;

    // Machines go first: machines.owner_id references user_profiles with no
    // ON DELETE, so a still-owned machine blocks the user delete.
    let machineError: Error | null = null;
    try {
      if (testMachines.size > 0) {
        await cleanupTestEntities({
          machineInitials: Array.from(testMachines),
        });
      }
    } catch (error) {
      machineError = error instanceof Error ? error : new Error(String(error));
    } finally {
      testMachines.clear();
    }

    // The user delete runs even when the machine cleanup failed — skipping it
    // would leak an auth.users row that only global-setup's sweeper can
    // reclaim. But it is NOT allowed to become the reported failure in that
    // case: with the machine still around it raises an FK error that is a
    // symptom of the machine cleanup failing, and letting it propagate (the
    // previous `finally` did) would replace the real error with a misleading
    // one.
    if (userId !== null) {
      try {
        await deleteTestUser(userId);
      } catch (error) {
        if (machineError === null) {
          throw error instanceof Error ? error : new Error(String(error));
        }
      }
    }

    if (machineError !== null) throw machineError;
  });

  test("promote dialog confirm creates machine and promotes guest to member", async ({
    page,
  }) => {
    const testId = Math.random().toString(36).substring(7);
    // 6 chars, not 5 — the form's own maxLength. Truncating to 5 left only two
    // random characters (1296 combinations) to keep three browser projects on
    // one database apart, and a collision does not just fail the create: the
    // loser's afterEach deletes machines BY INITIALS, so it would delete the
    // winner's machine mid-test. Three characters is 46656.
    const machineInitials = `OPC${testId.toUpperCase()}`.substring(0, 6);

    testMachines.add(machineInitials);

    await page.goto("/m/new");

    // Fill required fields
    await page.getByLabel(/Initials/i).fill(machineInitials);
    await page
      .getByLabel(/Machine Name/i)
      .fill(`Owner Picker Confirm ${testId}`);
    // Every new machine needs a Pinball Map title or Manual Entry (not on
    // Pinball Map); this spec is not about Pinball Map, so take Manual Entry.
    await page.getByRole("radio", { name: "Manual Entry" }).click();

    // Open picker and select guest via search (search bypasses the
    // "Show guests" checkbox filter — more robust on mobile viewports).
    await openOwnerPicker(page);
    await selectOwnerBySearch(page, guestName);

    // Verify selection
    await expect(page.getByTestId("owner-select")).toContainText(guestName);

    // Submit
    await page.getByRole("button", { name: /Create Machine/i }).click();

    // Promote dialog should appear after the server action round-trip +
    // React useEffect cycle. Rely on the config's CI-aware `expect.timeout`
    // (30s in CI, 10s locally) instead of a hardcoded override that undercuts it.
    await expect(
      page.getByRole("heading", { name: /Promote to member and assign/i })
    ).toBeVisible();
    const promoteDialog = page.getByRole("dialog").filter({
      has: page.getByText("Promote to member and assign"),
    });
    await expect(promoteDialog.getByText("(GUEST)")).toBeVisible();

    await page.getByRole("button", { name: /Promote and assign/i }).click();

    // Should redirect to machine detail page and show the promoted owner.
    await expect(page).toHaveURL(new RegExp(`/m/${machineInitials}`));
    await expect(
      page.getByRole("heading", { name: `Owner Picker Confirm ${testId}` })
    ).toBeVisible();
    await expect(page.getByTestId("machine-owner-card")).toContainText(
      guestName
    );
  });
});
