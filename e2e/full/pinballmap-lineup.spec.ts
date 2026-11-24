/**
 * E2E: the Pinball Map lineup page at /m/pinball-map (PP-o355.65,
 * docs/feature-specs/pinballmap-lineup.md).
 *
 * What only a browser sees: the /m header entry point, the RSC assembling
 * stored state into sections, and the Create in PinPoint prefill journey into
 * /m/new. Section layout, row links, Confirm lineup, and role gating are
 * owned by `LineupHeader.test.tsx`, `LineupSections.test.tsx`,
 * `m/pinball-map/page.test.tsx`, `m/page.test.tsx`, and
 * `pinballmap-lineup-data.test.ts`; comparison rules and push/confirm actions
 * live in `lineup-comparison.test.ts` and `pinballmap-outbound-write.test.ts`.
 *
 * Catalog rows, the stored-lineup entry and the machines are seeded directly.
 * The stored lineup is shared, so assertions target this run's own rows and
 * never an absolute count.
 */

import { test, expect } from "../support/fixtures.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import { TEST_USERS } from "../support/constants.js";
import { getTestMachineInitials } from "../support/test-isolation.js";
import { cleanupTestEntities } from "../support/cleanup.js";
import { clickPageAction } from "../support/page-actions.js";
import {
  addLmxToStoredLineup,
  createTestMachine,
  deletePinballMapCatalogEntries,
  getProfileIdByEmail,
  removeLmxFromStoredLineup,
  seedPinballMapCatalogEntry,
  setMachinePinballMapTitle,
} from "../support/supabase-admin.js";

test.describe("Pinball Map lineup page (PP-o355.65)", () => {
  test("anonymous visitors are sent to sign in", async ({ request }) => {
    const response = await request.get("/m/pinball-map", {
      headers: { "x-skip-autologin": "true" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    const location = new URL(
      response.headers()["location"] ?? "",
      "http://localhost"
    );
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/m/pinball-map");
  });

  test.describe("as admin", () => {
    test.use({ storageState: STORAGE_STATE.admin });

    test("reaches the page from the machines list, displays seeded sections, and prefills /m/new from Create in PinPoint", async ({
      page,
    }) => {
      const toAddInitials = getTestMachineInitials();
      const unlinkedInitials = getTestMachineInitials();
      // Run-scoped ids so parallel workers never share a catalog primary key
      // or a stored-lineup entry.
      const base = Math.floor(Math.random() * 9_000_000) * 10;
      const toAddTitleId = 920_000_000 + base;
      const entryTitleId = 920_000_001 + base;
      const entryLmxId = 820_000_000 + base;
      const toAddName = `Zz E2E Lineup Add ${String(base)}`;
      const entryName = `Zz E2E Lineup Entry ${String(base)}`;

      try {
        const adminId = await getProfileIdByEmail(TEST_USERS.admin.email);
        await createTestMachine(adminId, toAddInitials);
        const unlinked = await createTestMachine(adminId, unlinkedInitials);
        await seedPinballMapCatalogEntry({
          pinballmapMachineId: toAddTitleId,
          name: toAddName,
        });
        await seedPinballMapCatalogEntry({
          pinballmapMachineId: entryTitleId,
          name: entryName,
        });
        // On the lineup in PinPoint, absent from Pinball Map: Out of sync.
        await setMachinePinballMapTitle(toAddInitials, {
          pinballmapMachineId: toAddTitleId,
          intent: "on",
        });
        // On Pinball Map, no PinPoint machine: On Pinball Map, not linked.
        await addLmxToStoredLineup({
          pinballmapMachineId: entryTitleId,
          pinballmapLmxId: entryLmxId,
        });

        // Entry point 1: the machines list's Pinball Map page action, or its
        // entry in ⋯ once it folds (machine-views §6.8).
        await page.goto("/m");
        await clickPageAction(page, "Pinball Map");
        await expect(page).toHaveURL(/\/m\/pinball-map$/);
        await expect(
          page.getByRole("heading", { name: "Pinball Map lineup" })
        ).toBeVisible();

        // Summary and section headings for the seeded state.
        await expect(page.getByTestId("pbm-lineup-summary")).toContainText(
          /\d+ to review/
        );
        for (const name of [
          "Out of sync",
          "In PinPoint, not linked to Pinball Map",
          "On Pinball Map, not linked to a PinPoint machine",
        ]) {
          await expect(
            page.getByRole("heading", { name, level: 3 })
          ).toBeVisible();
        }

        const addRow = page.getByTestId(
          `pbm-lineup-row-to_add-${String(toAddTitleId)}`
        );
        await expect(addRow).toContainText(toAddName);
        await expect(addRow).toContainText("To add");
        // The row offers the one push its tag names: the confirm button,
        // because the reset chain links the admin to a fake Pinball Map
        // account (seed-pinballmap-state.ts). Without one it would link out to
        // the location instead. The page never writes on its own (5.7, 5.8).
        await expect(
          addRow.getByRole("button", { name: "Add to Pinball Map" })
        ).toBeVisible();

        const unlinkedRow = page.getByTestId(
          `pbm-lineup-row-machine-${unlinked.id}`
        );
        await expect(
          unlinkedRow.getByRole("link", { name: "Edit Machine" })
        ).toHaveAttribute("href", `/m/${unlinkedInitials}/edit`);

        // Create in PinPoint: name and Pinball Map title preselected.
        const entryRow = page.getByTestId(
          `pbm-lineup-row-entry-${String(entryLmxId)}`
        );
        await expect(entryRow).toContainText(entryName);
        await entryRow
          .getByRole("link", { name: "Create in PinPoint" })
          .click();
        await expect(page).toHaveURL(/\/m\/new\?/);
        await expect(page.getByLabel("Machine Name")).toHaveValue(entryName);
        await expect(page.getByTestId("pinballmap-link-select")).toContainText(
          entryName
        );
      } finally {
        await cleanupTestEntities({
          machineInitials: [toAddInitials, unlinkedInitials],
        });
        await deletePinballMapCatalogEntries([toAddTitleId, entryTitleId]);
        await removeLmxFromStoredLineup([entryLmxId]);
      }
    });
  });
});
