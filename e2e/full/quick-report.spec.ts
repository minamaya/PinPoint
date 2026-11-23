import { test, expect } from "../support/fixtures.js";
import { cleanupTestEntities } from "../support/cleanup.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import { seededMachines } from "../support/constants.js";

/**
 * Quick report — full authoring journey (PP-sn34).
 *
 * Keyboard Tab order and Enter/Shift+Enter handling are covered in
 * `quick-report-grid.test.tsx`. This spec exercises the browser-only behaviors:
 * the real quick-submit round-trip + receipt navigation to issue detail, focus
 * advancing to a fresh row, and the container-query reflow that collapses the
 * machine picker to initials on a phone width.
 */

const afm = seededMachines.attackFromMars;
const createdIdPattern = new RegExp(`${afm.initials}-\\d+`);
const QUICK_PREFIX = "E2E Quick Report";

test.describe("quick report — authoring", () => {
  test.use({ storageState: STORAGE_STATE.member });

  test.beforeEach(async ({ page }) => {
    await page.goto("/report/multiple");
    await expect(page.getByTestId("quick-report-grid")).toBeVisible();
  });

  test.afterEach(async () => {
    await cleanupTestEntities({
      issueTitlePrefix: QUICK_PREFIX,
    });
  });

  test("quick-submits a row, advances focus to a fresh row, and links to issue detail", async ({
    page,
  }) => {
    const issueTitle = `${QUICK_PREFIX} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const firstRow = page.getByTestId("quick-row").first();
    await firstRow.getByRole("combobox", { name: "Machine" }).click();
    await page.getByTestId(`machine-option-${afm.id}`).click();
    await firstRow.getByRole("textbox", { name: /Problem/ }).fill(issueTitle);
    await firstRow.getByRole("button", { name: /^Submit$/ }).click();

    await expect(page.getByTestId("quick-receipt")).toHaveCount(1);
    const createdLink = page.getByRole("link", { name: createdIdPattern });
    await expect(createdLink).toBeVisible();

    // A fresh blank row remains and its machine picker takes focus.
    await expect(page.getByTestId("quick-row")).toHaveCount(1);
    await expect(page.getByRole("combobox", { name: "Machine" })).toBeFocused();

    await createdLink.click();
    await expect(page).toHaveURL(new RegExp(`/m/${afm.initials}/i/\\d+`));
    await expect(
      page.getByRole("heading", { level: 1, name: issueTitle })
    ).toBeVisible();
  });

  test("collapsed row shows initials-only at a phone width and the full name on desktop", async ({
    page,
  }) => {
    const firstRow = page.getByTestId("quick-row").first();
    await firstRow.getByRole("combobox", { name: "Machine" }).click();
    await page.getByTestId(`machine-option-${afm.id}`).click();

    const initialsOnly = firstRow.getByText(afm.initials, { exact: true });
    const fullName = firstRow.getByText(`${afm.name} (${afm.initials})`);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(initialsOnly).toBeVisible();
    await expect(fullName).toBeHidden();

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(fullName).toBeVisible();
    await expect(initialsOnly).toBeHidden();
  });
});
