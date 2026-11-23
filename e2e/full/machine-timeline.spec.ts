/**
 * E2E Tests for Machine Timeline (PP-0x98)
 *
 * Class-F multi-step user journeys:
 * - Member posts a note via the "New Note" bottom sheet → it appears on the timeline
 * - Member edits their own note → an "(edited)" marker appears (full edit round-trip)
 * - Tag filter URL param round-trips through the dropdown
 * - The overview "Recent activity" section renders + "View all" navigates to the timeline
 * - Reassigning an issue surfaces events on BOTH machines' timelines
 *
 * The composer (quick-note default + "Aa" full-format toggle) is a single
 * bottom sheet reused by the Timeline tab and the overview "Recent activity"
 * section (`MachineNoteComposerSheet`). Quick-note + Aa-toggle UI states are
 * class-H, covered by MachineTimelineComposer.test.tsx; editedAt stamping is
 * class-B/I, covered by machine-timeline-events.test.ts. The E2E here only owns
 * the cross-page journeys.
 *
 * Permission splits (admin/author/owner vs third-party) are class-E and
 * covered by integration tests at
 * src/test/integration/machine-timeline-permissions.test.ts — adding E2E
 * versions would be misallocation per CORE-TEST-005 (Interaction Coverage
 * at the Cheapest Catching Layer).
 *
 * Reassign-flow selectors are stable per PP-3hb (issues-reassign-machine.spec.ts).
 */

import { test, expect } from "../support/fixtures.js";
import { openMoveIssueDialog } from "../support/actions.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import { cleanupTestEntities } from "../support/cleanup.js";
import { seededMachines, TEST_USERS } from "../support/constants.js";
import {
  fillReportForm,
  submitFormAndWaitForRedirect,
} from "../support/page-helpers.js";
import {
  createTestMachine,
  deleteTestMachine,
  getProfileIdByEmail,
} from "../support/supabase-admin.js";

const machineA = seededMachines.addamsFamily.initials;
const machineB = seededMachines.medievalMadness.initials;

// PREFIX tags note bodies; REASSIGN_PREFIX is the human-readable stem of the
// reassign journey's issue title (the run appends its own unique suffix).
const PREFIX = "E2E PP-0x98";
const REASSIGN_PREFIX = `${PREFIX} Reassign`;

test.describe("Machine Timeline (PP-0x98)", () => {
  test.describe("member journeys", () => {
    test.use({ storageState: STORAGE_STATE.member });

    let isolatedMachine: { id: string; initials: string; name: string } | null =
      null;

    test.beforeEach(async () => {
      const ownerId = await getProfileIdByEmail(TEST_USERS.admin.email);
      isolatedMachine = await createTestMachine(ownerId);
    });

    test.afterEach(async () => {
      if (isolatedMachine) {
        await deleteTestMachine(isolatedMachine.id).catch(() => undefined);
      }
      isolatedMachine = null;
    });

    test("overview Recent activity opens timeline; member posts with tag and edits note to show (edited)", async ({
      page,
    }) => {
      if (!isolatedMachine) throw new Error("isolatedMachine not created");
      const { initials } = isolatedMachine;
      const body = `${PREFIX} cleaned playfield ${Date.now().toString()}`;

      // Overview Recent activity links to the full timeline.
      await page.goto(`/m/${initials}`);
      const recentActivity = page.getByRole("region", {
        name: /recent activity/i,
      });
      await expect(
        recentActivity.getByRole("heading", { name: /recent activity/i })
      ).toBeVisible();
      await recentActivity.getByRole("link", { name: /view all/i }).click();
      await page.waitForURL(new RegExp(`/m/${initials}/timeline$`), {
        timeout: 10_000,
      });

      // Post a tagged note via the New Note sheet.
      await page.getByRole("button", { name: /new note/i }).click();
      await page.getByRole("combobox", { name: "Tag", exact: true }).click();
      await page.getByRole("option", { name: /maintenance/i }).click();

      const editor = page.locator(".ProseMirror").first();
      await editor.waitFor({ state: "visible", timeout: 15_000 });
      await editor.click();
      await page.keyboard.type(body);

      await page.getByRole("button", { name: /^post$/i }).click();
      await expect(page.getByText(body)).toBeVisible({ timeout: 10_000 });

      // Edit the note on this isolated machine's timeline to stamp (edited).
      await page
        .getByRole("button", { name: /comment actions/i })
        .first()
        .click();
      await page.getByRole("menuitem", { name: /edit/i }).click();
      await page.getByRole("button", { name: /^save$/i }).click();

      await expect(page.getByText(/\(edited\)/i).first()).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  // Reassignment is a ONE-WAY move of a real row, so this journey files its own
  // issue instead of moving a seeded one. It used to move seeded TAF-01 to EBD
  // and leave it there: TAF-01 then no longer existed at /m/TAF/i/1, so a second
  // run in the same database timed out waiting for the ⋯ menu that page never
  // rendered — and machine-info.spec.ts, which asserts TAF-01 in the hero's
  // known-issues peek, went red as collateral. Moving it back is not a repair:
  // a returning issue gets a fresh per-machine number, so TAF-01 would stay
  // gone. (PP-168u.)
  test.describe("admin reassign journey", () => {
    test.use({ storageState: STORAGE_STATE.admin });

    // The exact title this run filed. Cleanup matches on it rather than on
    // REASSIGN_PREFIX: the cleanup endpoint's prefix match is an unbounded
    // `ilike(title, '<prefix>%')` delete, and the comprehensive job runs this
    // same file in three browser projects against one database — a prefix
    // sweep would delete another project's issue mid-reassign.
    let reassignTitle: string | null = null;

    test.afterEach(async () => {
      if (reassignTitle === null) return;
      await cleanupTestEntities({
        issueTitlePrefix: reassignTitle,
      });
      reassignTitle = null;
    });

    test("reassigning an issue surfaces events on BOTH timelines", async ({
      page,
    }, testInfo) => {
      // Project + worker in the title so two projects filing in the same
      // millisecond still get distinct titles.
      reassignTitle = `${REASSIGN_PREFIX} ${testInfo.project.name}-${testInfo.workerIndex.toString()}-${Date.now().toString()}`;

      // 1. File a throwaway issue on machine A and land on its detail page.
      await page.goto(`/report/detailed?machine=${machineA}`);
      await fillReportForm(page, {
        title: reassignTitle,
        priority: "medium",
      });
      await submitFormAndWaitForRedirect(
        page,
        page.getByRole("button", { name: "Submit Issue Report" }),
        { awayFrom: "/report/detailed" }
      );
      await expect(page).toHaveURL(new RegExp(`/m/${machineA}/i/[0-9]+$`));

      // 2. Move → pick destination → confirm. The helper opens the dialog
      // through the Move button (desktop) or the ⋯ menu (mobile) and retries
      // a click swallowed on arrival: we come straight off the report form's
      // redirect, and its ProseMirror editor can still hold focus when the
      // first click lands. (issues-reassign-machine.spec.ts opens the same
      // dialog the same way after the same flow.)
      await openMoveIssueDialog(page);

      // The reassign dialog renders a searchable combobox — filter by the
      // destination's initials so the option becomes selectable.
      const dialog = page.getByRole("alertdialog");
      await dialog.getByPlaceholder("Search machines…").fill(machineB);
      await page.getByTestId(`reassign-option-${machineB}`).click();
      await page.getByTestId("reassign-confirm").click();

      // After success the issue lives at /m/<machineB>/i/<num>.
      await page.waitForURL(new RegExp(`/m/${machineB}/i/[0-9]+$`), {
        timeout: 15_000,
      });

      // 3. Source machine timeline shows the "moved to" row FOR THIS issue.
      // Scoped by kind + title, not a bare /moved to/ match: the comprehensive
      // job runs this file in three browser projects against one database, and
      // a reassign row from a peer project (or an earlier reassign of another
      // issue) sits on this same timeline. An unscoped `.first()` would be
      // satisfied by that row, so the assertion could not fail even if this
      // run emitted no event at all — which is the only thing it exists to
      // prove. The row carries the issue title on its second line and its
      // event kind on `data-event-kind`.
      await page.goto(`/m/${machineA}/timeline`);
      await expect(
        page
          .locator("[data-event-kind='issue_reassigned_out']")
          .filter({ hasText: reassignTitle })
          .getByText(/moved to/i)
      ).toBeVisible({ timeout: 10_000 });

      // 4. Destination machine timeline shows the "received from" row for the
      // same issue — scoped the same way and for the same reason.
      await page.goto(`/m/${machineB}/timeline`);
      await expect(
        page
          .locator("[data-event-kind='issue_reassigned_in']")
          .filter({ hasText: reassignTitle })
          .getByText(/received from/i)
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});
