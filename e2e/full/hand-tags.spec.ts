/**
 * E2E: hand-applied tags journeys, browser chip measurement, and live redirects
 * (PP-wqit.3 / PP-wqit.4 / PP-wqit.16, spec collections-and-tags §11).
 *
 * Retained here are genuine multi-page browser journeys, real DOM width
 * measurement (`MachineTagList` +N collapse at 320px), RSC revalidation
 * persistence (`MachineTagEditor`), and live Next.js 307 redirects for moved
 * and merged tags (`{ request }` with `maxRedirects: 0`).
 *
 * Role-gating, conflict detection, and action wiring live at cheaper layers:
 * - `src/test/integration/tag-actions.test.ts` & `hand-tags.test.ts`
 * - `src/test/integration/tags-pages.test.tsx`
 * - `src/components/tags/*.test.tsx`
 */

import { test, expect } from "../support/fixtures.js";
import {
  assertNoA11yViolations,
  assertNoHorizontalOverflow,
} from "../support/actions.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import { seededMachines, TEST_USERS } from "../support/constants.js";
import {
  addTestMachineTags,
  createTestMachine,
  createTestTagType,
  deleteTestMachine,
  deleteTestTagType,
  getProfileIdByEmail,
  testTagSlug,
} from "../support/supabase-admin.js";
import { getTestPrefix } from "../support/test-isolation.js";
import { clickPageAction } from "../support/page-actions.js";

/** A machine-editor tag row's accessible name reads "<name>, <count> machines". */
function tagRow(name: string): RegExp {
  return new RegExp(`^${name},`);
}

test.describe("Hand-applied tags", () => {
  test.describe("technician", () => {
    test.use({ storageState: STORAGE_STATE.technician });

    // Names are capped at 20 characters; the prefix is ~11.
    const typeName = `Zone ${getTestPrefix()}`;
    const tagName = `Bay ${getTestPrefix()}`;
    let machine: { id: string; initials: string; name: string } | null = null;

    test.beforeAll(async () => {
      const ownerId = await getProfileIdByEmail(TEST_USERS.admin.email);
      machine = await createTestMachine(ownerId);
    });

    test.afterAll(async () => {
      await deleteTestTagType(typeName).catch(() => undefined);
      if (machine) await deleteTestMachine(machine.id).catch(() => undefined);
    });

    test("creates an exclusive tag type and tag, tags a machine, deletes the type", async ({
      page,
    }) => {
      if (!machine) throw new Error("Test machine was not created");
      const { initials, name: machineName } = machine;

      // --- Tag browse: Add tag type (exclusive) ---------------------------
      await page.goto("/c/tags");
      await expect(
        page.getByRole("heading", { level: 1, name: "Tags" })
      ).toBeVisible();
      await clickPageAction(page, {
        button: "Add tag type",
        entry: "Add tag type…",
      });
      const typeDialog = page.getByRole("dialog", { name: "Add tag type" });
      await expect(typeDialog).toBeVisible();
      await assertNoA11yViolations(page);
      await typeDialog.getByLabel("Name").fill(typeName);
      await typeDialog.getByLabel("One per machine").check();
      await typeDialog.getByRole("button", { name: "Add tag type" }).click();
      await expect(typeDialog).toBeHidden();

      // The new type's card links to its page.
      const typeLink = page.getByRole("link", { name: typeName, exact: true });
      await expect(typeLink).toBeVisible();
      await typeLink.click();
      await expect(
        page.getByRole("heading", { level: 1, name: typeName })
      ).toBeVisible();
      await expect(page.getByText("One per machine").first()).toBeVisible();

      // --- Tag type page: Add tag -----------------------------------------
      await clickPageAction(page, "Add tag");
      const tagDialog = page.getByRole("dialog", {
        name: `Add tag to ${typeName}`,
      });
      await tagDialog.getByLabel("Name").fill(tagName);
      await tagDialog.getByRole("button", { name: "Add tag" }).click();
      await expect(tagDialog).toBeHidden();

      const tagLink = page.getByRole("link", { name: new RegExp(tagName) });
      await expect(tagLink).toContainText("No machines");
      await tagLink.click();

      // --- Tag page: Edit machines, in ⋯ (4.17) ---------------------------
      await expect(
        page.getByRole("heading", { level: 1, name: tagName })
      ).toBeVisible();
      await clickPageAction(page, "Edit machines…");
      const machinesDialog = page.getByRole("dialog", {
        name: `Machines in ${tagName}`,
      });
      await machinesDialog.getByLabel("Find a machine").fill(initials);
      await machinesDialog
        .getByRole("checkbox", { name: new RegExp(machineName) })
        .check();
      await expect(machinesDialog.getByText("Adds 1 machine")).toBeVisible();
      await machinesDialog
        .getByRole("button", { name: "Add 1 machine" })
        .click();
      await expect(machinesDialog).toBeHidden();

      await expect(
        page.getByRole("link", { name: new RegExp(machineName) }).first()
      ).toBeVisible();
      const tagPageUrl = new URL(page.url()).pathname;

      // --- Machine Info tab: the tag links back to its page ---------------
      await page.goto(`/m/${initials}`);
      await expect(
        page
          .getByTestId("machine-tags")
          .getByRole("link", { name: tagName, exact: true })
      ).toHaveAttribute("href", tagPageUrl);

      // --- Delete the tag type from its page ------------------------------
      await page.goto(tagPageUrl.slice(0, tagPageUrl.lastIndexOf("/")));
      await expect(
        page.getByRole("heading", { level: 1, name: typeName })
      ).toBeVisible();
      await clickPageAction(page, "Delete tag type");
      const confirm = page.getByRole("alertdialog", {
        name: `Delete ${typeName}?`,
      });
      await confirm.getByRole("button", { name: "Delete tag type" }).click();

      await expect(page).toHaveURL(/\/c\/tags$/);
      await expect(
        page.getByRole("link", { name: typeName, exact: true })
      ).toHaveCount(0);

      // The machine no longer carries the deleted type's tag.
      await page.goto(`/m/${initials}`);
      await expect(
        page.getByTestId("machine-tags").getByRole("link", { name: tagName })
      ).toHaveCount(0);
    });
  });
});

test.describe("Machine tag editor", () => {
  const desktop = { width: 1280, height: 800 };
  /** Admin-owned and carries seeded hand-applied tags (seed-tags.mjs). */
  const seededInitials = seededMachines.medievalMadness.initials;

  test.describe("technician", () => {
    test.use({ storageState: STORAGE_STATE.technician, viewport: desktop });

    const prefix = getTestPrefix();
    const openType = `Kit ${prefix}`;
    const lamp = `Lamp ${prefix}`;
    const exclusiveType = `Spot ${prefix}`;
    const left = `Left ${prefix}`;
    const right = `Right ${prefix}`;
    const created = `New ${prefix}`;
    let machine: { id: string; initials: string } | null = null;

    test.beforeAll(async () => {
      const ownerId = await getProfileIdByEmail(TEST_USERS.admin.email);
      machine = await createTestMachine(ownerId);
      await createTestTagType(openType, { exclusive: false, tags: [lamp] });
      await createTestTagType(exclusiveType, {
        exclusive: true,
        tags: [left, right],
      });
    });

    test.afterAll(async () => {
      await deleteTestTagType(openType).catch(() => undefined);
      await deleteTestTagType(exclusiveType).catch(() => undefined);
      if (machine) await deleteTestMachine(machine.id).catch(() => undefined);
    });

    test("applies, swaps, clears, and creates tags from the machine page", async ({
      page,
    }) => {
      if (!machine) throw new Error("Test machine was not created");
      await page.goto(`/m/${machine.initials}`);

      const tagsCard = page.getByTestId("machine-tags");
      const cardTag = (name: string) =>
        tagsCard.getByRole("link", { name, exact: true });
      const editor = page.getByRole("dialog", { name: "Edit tags" });

      // --- Open type: checkbox saved on click -----------------------------
      await tagsCard.getByRole("button", { name: "Edit tags" }).click();
      await expect(editor).toBeVisible();
      await editor.getByRole("checkbox", { name: tagRow(lamp) }).check();
      await expect(editor.getByRole("status")).toHaveText("Saved");
      await editor.getByRole("button", { name: "Done" }).click();
      await expect(editor).toBeHidden();
      await expect(cardTag(lamp)).toBeVisible();

      // --- Exclusive type: swap, then None --------------------------------
      await tagsCard.getByRole("button", { name: "Edit tags" }).click();
      const exclusiveGroup = editor.getByRole("group", {
        name: new RegExp(`^${exclusiveType}`),
      });
      await exclusiveGroup.getByRole("radio", { name: tagRow(left) }).check();
      await expect(cardTag(left)).toBeVisible();

      await exclusiveGroup.getByRole("radio", { name: tagRow(right) }).check();
      await expect(cardTag(right)).toBeVisible();
      await expect(cardTag(left)).toHaveCount(0);

      await exclusiveGroup.getByRole("radio", { name: "None" }).check();
      await expect(cardTag(right)).toHaveCount(0);

      // --- Create a tag into a type while tagging -------------------------
      await editor.getByLabel("Find or create a tag").fill(created);
      await editor
        .getByLabel("Tag type for the new tag")
        .selectOption({ label: openType });
      await editor.getByRole("button", { name: `Create “${created}”` }).click();
      await expect(
        editor
          .getByRole("group", { name: new RegExp(`^${openType}`) })
          .getByRole("checkbox", { name: tagRow(created) })
      ).toBeChecked();
      await expect(cardTag(created)).toBeVisible();
      await editor.getByRole("button", { name: "Done" }).click();
      await expect(editor).toBeHidden();

      // --- The saved set survives a fresh render --------------------------
      await page.reload();
      await expect(cardTag(lamp)).toBeVisible();
      await expect(cardTag(created)).toBeVisible();
      await expect(cardTag(left)).toHaveCount(0);
      await expect(cardTag(right)).toHaveCount(0);
    });
  });

  test.describe("phone", () => {
    // The narrowest review viewport (pinpoint-design-bible §4).
    test.use({
      storageState: STORAGE_STATE.technician,
      viewport: { width: 320, height: 568 },
    });

    test("collapses chips behind +N and edits in a bottom sheet", async ({
      page,
    }) => {
      await page.goto(`/m/${seededInitials}`);
      const tagsCard = page.getByTestId("machine-tags");
      const chips = tagsCard.getByRole("link");

      // One line of chips; the rest wait behind the "+N" chip.
      const more = tagsCard.getByRole("button", {
        name: /^\+\d+ more tags?$/,
      });
      await expect(more).toBeVisible();
      const total = await tagsCard
        .getByRole("link", { includeHidden: true })
        .count();
      const shown = await chips.count();
      expect(shown).toBeLessThan(total);
      await expect(more).toHaveText(`+${String(total - shown)}`);
      await assertNoHorizontalOverflow(page, {
        scopeTestIds: ["machine-tags"],
      });

      await more.click();
      await expect(more).toHaveCount(0);
      await expect(chips).toHaveCount(total);

      // The editor opens as a bottom sheet and closes with Done.
      await tagsCard.getByRole("button", { name: "Edit tags" }).click();
      const sheet = page.getByRole("dialog", { name: "Edit tags" });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByLabel("Find or create a tag")).toBeVisible();
      await assertNoA11yViolations(page);
      await sheet.getByRole("button", { name: "Done" }).click();
      await expect(sheet).toBeHidden();
    });
  });
});

test.describe("Tag type changes", () => {
  test.use({
    storageState: STORAGE_STATE.technician,
    viewport: { width: 1280, height: 800 },
  });

  test.describe("move a tag", () => {
    const prefix = getTestPrefix();
    const fromType = `From ${prefix}`;
    const toType = `To ${prefix}`;
    const exclusiveType = `One ${prefix}`;
    const tagName = `Mv ${prefix}`;
    const held = `Own ${prefix}`;
    let machine: { id: string; initials: string } | null = null;

    test.beforeAll(async () => {
      const ownerId = await getProfileIdByEmail(TEST_USERS.admin.email);
      const created = await createTestMachine(ownerId);
      machine = created;
      await createTestTagType(fromType, { exclusive: false, tags: [tagName] });
      await createTestTagType(toType, { exclusive: false, tags: [] });
      await createTestTagType(exclusiveType, { exclusive: true, tags: [held] });
      await addTestMachineTags(created.id, [tagName, held]);
    });

    test.afterAll(async () => {
      await deleteTestTagType(fromType).catch(() => undefined);
      await deleteTestTagType(toType).catch(() => undefined);
      await deleteTestTagType(exclusiveType).catch(() => undefined);
      if (machine) await deleteTestMachine(machine.id).catch(() => undefined);
    });

    test("moves a tag to another tag type; the old address redirects", async ({
      page,
      request,
    }) => {
      if (!machine) throw new Error("Test machine was not created");
      const oldPath = `/c/tags/${testTagSlug(fromType)}/${testTagSlug(tagName)}`;
      const newPath = `/c/tags/${testTagSlug(toType)}/${testTagSlug(tagName)}`;
      const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });

      await page.goto(oldPath);
      await expect(
        page.getByRole("heading", { level: 1, name: tagName })
      ).toBeVisible();
      await clickPageAction(page, "Move to another tag type…");
      const dialog = page.getByRole("dialog", { name: `Move ${tagName}` });
      const select = dialog.getByLabel("Tag type");

      // --- Blocked exclusive conflict dialog fits 320px and passes axe ----
      await select.selectOption({
        label: `${exclusiveType} · one per machine`,
      });
      await expect(dialog.getByRole("alert")).toHaveText(
        `1 machine would hold two ${exclusiveType} tags`
      );
      await expect(
        dialog.getByRole("button", { name: "Move tag" })
      ).toBeDisabled();
      await page.setViewportSize({ width: 320, height: 568 });
      const fit = await dialog.evaluate((element) => ({
        right: element.getBoundingClientRect().right,
        overflow: element.scrollWidth - element.clientWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(fit.right).toBeLessThanOrEqual(fit.viewport);
      expect(fit.overflow).toBeLessThanOrEqual(0);
      await assertNoA11yViolations(page);

      await page.setViewportSize({ width: 1024, height: 768 });
      await select.selectOption({ label: toType });
      await dialog.getByRole("button", { name: "Move tag" }).click();

      // --- Lands on the new address and updates the breadcrumb ------------
      await expect(page).toHaveURL(new RegExp(`${newPath}$`));
      await expect(
        page.getByRole("heading", { level: 1, name: tagName })
      ).toBeVisible();
      await expect(
        breadcrumb.getByRole("link", { name: toType })
      ).toHaveAttribute("href", `/c/tags/${testTagSlug(toType)}`);

      // --- The old address HTTP-redirects to the new one ------------------
      const redirect = await request.get(oldPath, {
        headers: { "x-skip-autologin": "true" },
        maxRedirects: 0,
      });
      expect(redirect.status()).toBe(307);
      expect(
        new URL(redirect.headers()["location"] ?? "", "http://localhost")
          .pathname
      ).toBe(newPath);

      // --- The machine keeps the tag, linked to its new page --------------
      await page.goto(`/m/${machine.initials}`);
      await expect(
        page
          .getByTestId("machine-tags")
          .getByRole("link", { name: tagName, exact: true })
      ).toHaveAttribute("href", newPath);
    });
  });

  test.describe("merge a tag", () => {
    const prefix = getTestPrefix();
    const typeName = `Mrg ${prefix}`;
    const source = `Old ${prefix}`;
    const target = `New ${prefix}`;
    let both: { id: string; initials: string } | null = null;
    let onlySource: { id: string; initials: string } | null = null;

    test.beforeAll(async () => {
      const ownerId = await getProfileIdByEmail(TEST_USERS.admin.email);
      const holdsBoth = await createTestMachine(ownerId);
      const holdsSource = await createTestMachine(ownerId);
      both = holdsBoth;
      onlySource = holdsSource;
      await createTestTagType(typeName, {
        exclusive: false,
        tags: [source, target],
      });
      await addTestMachineTags(holdsBoth.id, [source, target]);
      await addTestMachineTags(holdsSource.id, [source]);
    });

    test.afterAll(async () => {
      await deleteTestTagType(typeName).catch(() => undefined);
      for (const m of [both, onlySource]) {
        if (m) await deleteTestMachine(m.id).catch(() => undefined);
      }
    });

    test("merges a tag into another; its machines and old links move to the target", async ({
      page,
      request,
    }) => {
      if (!both || !onlySource) throw new Error("Test machines not created");
      const typeSlug = testTagSlug(typeName);
      const oldPath = `/c/tags/${typeSlug}/${testTagSlug(source)}`;
      const newPath = `/c/tags/${typeSlug}/${testTagSlug(target)}`;

      await page.goto(oldPath);
      await expect(
        page.getByRole("heading", { level: 1, name: source })
      ).toBeVisible();
      await clickPageAction(page, "Merge into another tag…");
      const dialog = page.getByRole("dialog", {
        name: `Merge ${source} into another tag`,
      });
      await dialog
        .getByLabel("Merge into")
        .selectOption({ label: `${target} · 1 machine` });
      await expect(
        dialog.getByText(
          `All 2 machines will be tagged ${target} (1 already is).`,
          { exact: false }
        )
      ).toBeVisible();
      await dialog.getByRole("button", { name: "Merge tags" }).click();

      // --- Lands on the target, which now holds both machines -------------
      await expect(page).toHaveURL(new RegExp(`${newPath}$`));
      await expect(
        page.getByRole("heading", { level: 1, name: target })
      ).toBeVisible();
      for (const machine of [both, onlySource]) {
        await expect(
          page.getByRole("link", {
            name: `Test Machine ${machine.initials}`,
            exact: true,
          })
        ).toBeVisible();
      }

      // --- The merged tag's addresses redirect to the target (11.19) ------
      for (const suffix of ["", "/issues"]) {
        const redirect = await request.get(`${oldPath}${suffix}`, {
          headers: { "x-skip-autologin": "true" },
          maxRedirects: 0,
        });
        expect(redirect.status(), `expected 307 for ${oldPath}${suffix}`).toBe(
          307
        );
        expect(
          new URL(redirect.headers()["location"] ?? "", "http://localhost")
            .pathname
        ).toBe(`${newPath}${suffix}`);
      }

      // --- The machine that held only the source now holds the target ------
      await page.goto(`/m/${onlySource.initials}`);
      const tags = page.getByTestId("machine-tags");
      await expect(
        tags.getByRole("link", { name: target, exact: true })
      ).toHaveAttribute("href", newPath);
      await expect(
        tags.getByRole("link", { name: source, exact: true })
      ).toHaveCount(0);
    });
  });
});
