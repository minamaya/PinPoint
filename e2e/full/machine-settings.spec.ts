/**
 * E2E Tests for the Machine Settings tab (PP-43q3)
 *
 * Class-F multi-step journeys — the things only an end-to-end run can prove:
 * - create a set → name it → Save → it persists across a full page reload
 *   (proves the per-unit Save actually wrote to the DB, not just local island
 *   state)
 * - the Settings tab is reachable from the machine tab strip
 *
 * Permission splits (owner / technician / admin can edit; non-owner cannot) are
 * class-E and covered exhaustively at the action layer in
 * src/test/integration/machine-settings-actions.test.ts — duplicating them here
 * would be misallocation per CORE-TEST-005. We include only a single light
 * read-only affordance check (a distinct rendered UI state).
 *
 * TAF (addamsFamily) has no member owner in the seed, so: admin can edit it
 * (admin edits any machine), and the member test user sees it read-only. Only
 * the read-only check still uses TAF — it reads and never writes. Every test
 * that CREATES a set seeds its own machine (see the editor-journey block).
 */

import { test, expect, type Locator, type Page } from "../support/fixtures.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import { TEST_USERS } from "../support/constants.js";
import {
  createTestMachine,
  deleteTestMachine,
  deleteTestSettingsTags,
  getProfileIdByEmail,
  seedSettingsSet,
} from "../support/supabase-admin.js";
import { getTestPrefix } from "../support/test-isolation.js";
import { clickPageAction } from "../support/page-actions.js";

const PREFIX = "E2E PP-43q3";

/**
 * Every section's ⋯ "Section actions" button, in section order. Each says
 * which section it belongs to in its accessible description ("the Rubbers
 * section"), which Playwright's role queries cannot filter on.
 */
function sectionMenuButtons(page: Page): Locator {
  return page.getByRole("button", { name: "Section actions", exact: true });
}

/** The accessible descriptions of the section ⋯ buttons, in section order. */
async function sectionMenuDescriptions(page: Page): Promise<string[]> {
  return sectionMenuButtons(page).evaluateAll((buttons) =>
    buttons.map((button) =>
      (button.getAttribute("aria-describedby") ?? "")
        .split(" ")
        .map((id) => document.getElementById(id))
        // A tooltip is never part of the description (NameTooltip, with its
        // unit tests); skip one anyway, so where the pointer rests can't
        // change what this reads.
        .filter((element) => element?.getAttribute("role") !== "tooltip")
        .map((element) => element?.textContent ?? "")
        .join(" ")
        .trim()
    )
  );
}

/** One section's ⋯ button, found by its accessible description. */
async function sectionMenuButton(
  page: Page,
  sectionLabel: string
): Promise<Locator> {
  const description = `the ${sectionLabel} section`;
  const index = (await sectionMenuDescriptions(page)).indexOf(description);
  if (index < 0) throw new Error(`No ⋯ menu for ${description}`);
  const button = sectionMenuButtons(page).nth(index);
  await expect(button).toHaveAccessibleDescription(description);
  return button;
}

/**
 * Open a section's ⋯ menu and click one of its items.
 *
 * Context: on a machine with no machine-wide guidance yet, the two "Before you
 * change anything" / "How to change settings" blocks render as tall always-open
 * editors that push the settings sets far down the page. At the default 720px
 * test viewport a section's ⋯ menu could sit at the very bottom edge, and the
 * Radix menu — a fixed-position portal — then opened below the fold where its
 * items reported "outside of the viewport" and a plain click could never reach
 * them (a fixed element can't be scrolled into view; the last section can't be
 * scrolled up either — nothing below it). A real user is never blocked: the menu
 * is reachable once there's room, and Radix flips it up near the viewport bottom
 * anyway. The describe blocks give these tests a tall viewport so the whole page
 * fits and every menu opens on-screen, which is all this needs. (PP-43q3 review
 * casework — verified a plain menu-item click works once the trigger has room.)
 */
async function activateSectionMenuItem(
  page: Page,
  sectionLabel: string,
  itemName: RegExp
): Promise<void> {
  await (await sectionMenuButton(page, sectionLabel)).click();
  await page.getByRole("menuitem", { name: itemName }).click();
  // The menu now fades out (tw-animate-css, PP-p2ts.7). While it unmounts,
  // Radix keeps the rest of the page aria-hidden, so role queries find nothing.
  await expect(page.getByRole("menu")).toHaveCount(0);
}

test.describe("Machine Settings (PP-43q3)", () => {
  // Seeds its OWN machine per test, for the same reason the section-ops block
  // below does. This block CREATES a settings set and never deleted it, so on a
  // shared machine every run left one behind. The set-name assertion below
  // reads `.first()`, and the settings route orders sets
  // preferred House, then preferred Tournament, then `asc(createdAt)`
  // (src/lib/machines/settings-queries.ts)
  // — so after the reload `.first()` is the OLDEST set, i.e. the leftover from a
  // previous run, not the one this test just made. That is invisible on a clean
  // machine and fails on the second run against a dirty one, which is exactly
  // how it presented: green in whichever browser project got scheduled first,
  // red in the next two. (PP-168u.)
  test.describe("editor journey (admin)", () => {
    test.use({
      storageState: STORAGE_STATE.admin,
      // Tall viewport so the always-open machine-wide guidance editors can't
      // push a set's controls or a section's ⋯ menu below the fold, where a
      // fixed-position Radix menu item can't be scrolled into view for a click
      // (PP-43q3 review casework).
      viewport: { width: 1280, height: 1800 },
    });

    let editorMachineId: string | null = null;
    let editorMachine: string;

    test.beforeEach(async () => {
      editorMachineId = null;
      const adminId = await getProfileIdByEmail("admin@test.com");
      const created = await createTestMachine(adminId);
      editorMachineId = created.id;
      editorMachine = created.initials;
    });

    test.afterEach(async () => {
      // Guarded: afterEach still runs when beforeEach threw, and calling
      // deleteTestMachine with no id raises an invalid-uuid error that would
      // replace the real setup failure in the report.
      if (editorMachineId === null) return;
      // ON DELETE CASCADE drops any set this journey created with the machine.
      await deleteTestMachine(editorMachineId);
      editorMachineId = null;
    });

    test("reaches Settings from tab strip, creates a set, auto-saves, and survives a reload", async ({
      page,
    }) => {
      // The reload recompiles the route in dev mode (the E2E webServer runs
      // `next dev`); under suite load that first post-reload render is slow,
      // so give this journey extra budget rather than racing a fixed timeout.
      test.slow();
      // Auto-accept any confirm (delete/duplicate/unsaved-guard) so a stray
      // dialog can't hang the run.
      page.on("dialog", (d) => void d.accept());

      const name = `${PREFIX} Tournament ${Date.now().toString()}`;
      await page.goto(`/m/${editorMachine}`);
      await page.getByRole("link", { name: /^settings$/i }).click();
      await expect(page).toHaveURL(new RegExp(`/m/${editorMachine}/settings$`));

      // New set opens straight into edit mode with the name field focused.
      await page.getByRole("button", { name: /new set/i }).click();
      // The machine is freshly seeded and holds no other set, so the one "set
      // name" field on the page is this test's. `.first()` is belt-and-braces.
      const nameField = page
        .getByRole("textbox", { name: /set name/i })
        .first();
      await nameField.fill(name);
      // The set name is always-live: blurring commits it (onBlurCommit), which
      // auto-saves the new set as a row insert — there is no explicit Save
      // button (PP-43q3 pivoted the sets to always-live auto-save). Tab moves
      // focus off the field to fire the blur.
      await nameField.press("Tab");
      await expect(nameField).toHaveValue(name);

      // Reload — if the set is still here, the auto-save wrote it to the DB (not
      // just local island state). The set name renders into the always-present
      // name input, so assert on its value. Wrapped in toPass: the dev webServer
      // can briefly serve a stale route render right after the action's
      // revalidate, so retry the reload until the persisted name reappears.
      // (Production renders this route dynamically, so the staleness is a
      // dev-mode artifact.)
      await expect(async () => {
        await page.reload();
        await expect(
          page.getByRole("textbox", { name: /set name/i }).first()
        ).toHaveValue(name, { timeout: 8_000 });
      }).toPass({ timeout: 45_000 });
    });
  });

  // Structural section ops (delete / reorder) persist IMMEDIATELY — there's no
  // set-level "Done"; the action fires on confirm/click. The only thing an E2E
  // run can prove that the integration tests can't is that the persisted result
  // survives a real page reload (the route re-renders from the DB, not local
  // island state). Each test seeds its OWN machine + set so it never touches the
  // shared AFM seed and can't cross-talk with another worker. (PP-43q3)
  test.describe("section ops persist (admin, isolated machine)", () => {
    test.use({
      storageState: STORAGE_STATE.admin,
      // Tall viewport so the always-open machine-wide guidance editors can't
      // push a set's controls or a section's ⋯ menu below the fold, where a
      // fixed-position Radix menu item can't be scrolled into view for a click
      // (PP-43q3 review casework).
      viewport: { width: 1280, height: 1800 },
    });

    // "" rather than null so the tests below can keep passing `machineId`
    // straight to seedSettingsSet without a null check.
    let machineId = "";
    let machineInitials: string;

    test.beforeEach(async () => {
      machineId = "";
      const adminId = await getProfileIdByEmail("admin@test.com");
      const created = await createTestMachine(adminId);
      machineId = created.id;
      machineInitials = created.initials;
    });

    test.afterEach(async () => {
      // Guarded for the same reason as the editor journey above: afterEach
      // still runs when beforeEach threw, and deleteTestMachine("") raises an
      // invalid-uuid error that would replace the real setup failure in the
      // report.
      if (machineId === "") return;
      // ON DELETE CASCADE drops the seeded settings sets with the machine.
      await deleteTestMachine(machineId);
      machineId = "";
    });

    // The two named sections used by both tests: a software section (heading
    // "Software settings", ⋯ described "the Software settings section") and a
    // "Rubbers" preset note (heading "Rubbers", ⋯ "the Rubbers section").
    const softwareSection = {
      id: "e2e-software",
      kind: "software",
      baseline: "Factory",
      rows: [{ id: "A.1 01", name: "Balls Per Game", value: "3" }],
    };
    const rubbersSection = {
      id: "e2e-rubbers",
      kind: "note",
      title: "Rubbers",
      customTitle: false,
      body: null,
    };

    test("reordering and deleting sections via ⋯ menus survive a reload", async ({
      page,
    }) => {
      test.slow();
      // Seed software FIRST, Rubbers second.
      await seedSettingsSet(machineId, `${PREFIX} Section ops target`, [
        softwareSection,
        rubbersSection,
      ]);

      const sectionOrder = (): Promise<string[]> =>
        sectionMenuDescriptions(page);
      const expandSet = (): Promise<void> =>
        page
          .getByRole("button", {
            name: `Expand ${PREFIX} Section ops target settings set`,
          })
          .click();

      await page.goto(`/m/${machineInitials}/settings`);
      // Sets render collapsed by default (PP-tn6t) — expand the seeded set.
      await expandSet();
      await expect(
        page.getByText("Software settings", { exact: true })
      ).toBeVisible();
      expect(await sectionOrder()).toEqual([
        "the Software settings section",
        "the Rubbers section",
      ]);

      // Move the first section (software) down — persists immediately.
      await activateSectionMenuItem(page, "Software settings", /move down/i);
      expect(await sectionOrder()).toEqual([
        "the Rubbers section",
        "the Software settings section",
      ]);

      // Reload and verify the new section order persisted in Postgres.
      await expect(async () => {
        await page.reload();
        await expandSet();
        await expect(
          page.getByText("Software settings", { exact: true })
        ).toBeVisible({ timeout: 8_000 });
        expect(await sectionOrder()).toEqual([
          "the Rubbers section",
          "the Software settings section",
        ]);
      }).toPass({ timeout: 45_000 });

      // Delete the Rubbers section via its ⋯ menu + AlertDialog confirm.
      const rubbersHeading = page.getByRole("paragraph").filter({
        hasText: /^Rubbers$/,
      });
      await expect(rubbersHeading).toBeVisible();
      await activateSectionMenuItem(page, "Rubbers", /delete section/i);
      const dialog = page.getByRole("alertdialog");
      await expect(
        dialog.getByText(/Delete the Rubbers section\?/i)
      ).toBeVisible();
      await dialog.getByRole("button", { name: /^delete$/i }).click();
      await expect(rubbersHeading).toHaveCount(0);

      // Reload and verify the deletion persisted while Software remains.
      await expect(async () => {
        await page.reload();
        await expandSet();
        await expect(
          page.getByText("Software settings", { exact: true })
        ).toBeVisible({ timeout: 8_000 });
        await expect(
          page.getByRole("paragraph").filter({ hasText: /^Rubbers$/ })
        ).toHaveCount(0);
      }).toPass({ timeout: 45_000 });
    });
  });

  // Custom settings tags (machine-settings §3, PP-k3km.2). The journey crosses
  // three pages — a machine's Settings tab, the Settings tags list, and the
  // tag's own page — which is what only a browser run proves. Create/rename/
  // delete authorization and name rules are covered at the action layer in
  // src/test/integration/machine-settings-actions.test.ts.
  test.describe("custom settings tag lifecycle (admin, isolated machine)", () => {
    test.use({
      storageState: STORAGE_STATE.admin,
      viewport: { width: 1280, height: 1800 },
    });

    let machineId = "";
    let machineInitials: string;
    let machineName: string;
    // At most 20 characters (TAG_NAME_MAX) and unique per worker run.
    const tagName = `ST ${getTestPrefix()}`;
    const renamedTag = `ST2 ${getTestPrefix()}`;

    test.beforeEach(async () => {
      machineId = "";
      const adminId = await getProfileIdByEmail(TEST_USERS.admin.email);
      const created = await createTestMachine(adminId);
      machineId = created.id;
      machineInitials = created.initials;
      machineName = created.name;
      await seedSettingsSet(machineId, `${PREFIX} Tag target`, []);
    });

    test.afterEach(async () => {
      // Settings tags are global, so a run that failed midway would leave its
      // tag on the shared Settings tags page.
      await deleteTestSettingsTags([tagName, renamedTag]);
      if (machineId === "") return;
      await deleteTestMachine(machineId);
      machineId = "";
    });

    test("create a tag from the picker, then rename and delete it on its page", async ({
      page,
    }) => {
      test.slow();

      // Create the tag from the set's picker; it applies to the set at once.
      await page.goto(`/m/${machineInitials}/settings`);
      await page.getByRole("button", { name: "Set actions" }).click();
      await page.getByRole("menuitem", { name: "Edit tags…" }).click();
      const picker = page.getByRole("dialog", { name: "Tags" });
      await picker.getByLabel("Find or create a tag").fill(tagName);
      await picker.getByRole("button", { name: `Create “${tagName}”` }).click();
      await expect(
        picker.getByRole("checkbox", { name: tagName, exact: true })
      ).toBeChecked();
      await picker.getByRole("button", { name: "Done" }).click();
      await expect(picker).toBeHidden();

      // The set card links its custom tag. The picker checks the tag before
      // the apply action returns, so reload until the link renders from the
      // database (the dev webServer can also serve a stale render right after
      // a revalidate).
      await expect(async () => {
        await page.reload();
        await expect(
          page.getByRole("link", { name: tagName, exact: true })
        ).toBeVisible({ timeout: 8_000 });
      }).toPass({ timeout: 45_000 });

      // The tag lists on the Settings tags page with the one set it finds.
      await page.goto("/c/settings-tags");
      const row = page.getByRole("listitem").filter({
        has: page.getByRole("link", { name: tagName, exact: true }),
      });
      await expect(row).toContainText("1 set on 1 machine");

      // The tag page lists the machine the set belongs to.
      await row.getByRole("link", { name: tagName, exact: true }).click();
      await expect(page).toHaveURL(/\/c\/settings-tags\/[a-z0-9-]+$/);
      await expect(
        page.getByRole("heading", { level: 1, name: tagName })
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: machineName, exact: true })
      ).toBeVisible();

      // Rename keeps the page; the heading takes the new name. Both are in
      // the page's ⋯ More menu (design-bible §26).
      await clickPageAction(page, "Rename…");
      const renameDialog = page.getByRole("dialog", { name: "Rename tag" });
      await renameDialog.getByLabel("Name").fill(renamedTag);
      await renameDialog.getByRole("button", { name: "Rename" }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: renamedTag })
      ).toBeVisible();

      // Delete returns to the Settings tags page, where the tag is gone.
      await clickPageAction(page, "Delete tag");
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete tag" })
        .click();
      await expect(page).toHaveURL(/\/c\/settings-tags$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Settings tags" })
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: renamedTag, exact: true })
      ).toHaveCount(0);
    });
  });
});
