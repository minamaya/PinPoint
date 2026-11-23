/**
 * Print settings sheets (PP-k3km, docs/feature-specs/settings-sheets.md).
 *
 * What only a browser proves: an anonymous visitor reaches the page from the
 * Machines list's ⋯ (§2.1), adds machines from the list (§2.2–§2.3),
 * the print run shows what each block will print and asks for a set when a
 * tag finds several (§2.5, §6.3), Print opens the sheet on its own page and
 * links back to the same run (§2.8), and a tag page opens the page with its
 * machines On the Floor already added (§2.6).
 *
 * The comparison and default-resolution rules are unit-tested
 * (src/lib/machines/settings-sheet*.test.ts) and the loaders at the
 * integration layer (src/test/integration/settings-sheet-queries.test.ts).
 * These tests read the seeded settings sets (supabase/seed-machine-settings.mjs)
 * and never write them.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures.js";
import {
  assertNoA11yViolations,
  machineViewRow,
  openListSearch,
} from "../support/actions.js";
import { clickPageAction } from "../support/page-actions.js";

// The print page opens the print dialog on load; a test has no use for it.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.print = (): void => undefined;
  });
});

async function addByInitials(page: Page, initials: string): Promise<void> {
  const search = await openListSearch(page, "Search machines");
  await search.fill(initials);
  // The search applies after a debounce, through a router transition that
  // dims the list. Wait for it to land so neither the click below nor a later
  // accessibility scan meets the list mid-update (PP-4bhb).
  await expect(page).toHaveURL(new RegExp(`[?&]q=${initials}(&|$)`));
  await expect(
    page.getByRole("region", { name: "Machines list" })
  ).not.toHaveAttribute("aria-busy", "true");
  // The machine rows are list items at every width. Scoped to the "Add
  // machines" section so they can't collide with the print-run list's items.
  const entry = machineViewRow(page, initials);
  await entry.getByRole("button", { name: /^Add / }).click();
  await expect(entry.getByText("Added")).toBeVisible();
}

function printRunRow(page: Page, name: string) {
  return page
    .getByRole("region", { name: "In this print run" })
    .getByRole("listitem")
    .filter({ hasText: name });
}

test.describe("Print settings sheets", () => {
  test("an anonymous visitor builds a run, previews, prints, and comes back", async ({
    page,
  }) => {
    await page.goto("/m");
    // An entry in /m's ⋯ for everyone (machine-views §6.6).
    await clickPageAction(page, "Print settings sheets");
    await expect(page).toHaveURL(/\/m\/settings-sheets/);
    await expect(
      page.getByRole("heading", { name: "Print settings sheets" })
    ).toBeVisible();

    await addByInitials(page, "MM");
    await addByInitials(page, "GDZ2");

    await expect(printRunRow(page, "Medieval Madness")).toContainText(
      "9 changes"
    );
    await expect(printRunRow(page, "Godzilla")).toContainText(
      "No House set: record values"
    );
    await expect(
      page.getByRole("complementary", { name: "Print run" })
    ).toContainText("2 machines print");
    await assertNoA11yViolations(page);

    await page.getByRole("button", { name: "Preview" }).click();
    const preview = page.getByRole("dialog", { name: "Preview" });
    await expect(
      preview.getByRole("article", { name: "Settings sheet" })
    ).toContainText("No House set — record original values");
    await page.keyboard.press("Escape");

    await page.getByRole("radio", { name: /Set up and restore/ }).check();
    await page
      .getByRole("complementary", { name: "Print run" })
      .getByRole("link", { name: "Print" })
      .click();
    await expect(page).toHaveURL(/\/m\/settings-sheets\/print\?/);
    const sheet = page.getByRole("article", { name: "Settings sheet" });
    await expect(sheet).toContainText("Set up and restore");
    await expect(sheet).toContainText("Castle Difficulty");

    await page.getByRole("link", { name: "Back to print run" }).click();
    await expect(page).toHaveURL(/\/m\/settings-sheets/);
    await expect(printRunRow(page, "Medieval Madness")).toBeVisible();
    await expect(printRunRow(page, "Godzilla")).toBeVisible();
    await expect(
      page.getByRole("radio", { name: /Set up and restore/ })
    ).toBeChecked();

    // Once the list has rewritten the URL, a reload restores the run from
    // this tab's storage.
    await expect(page).not.toHaveURL(/[?&]m=/);
    await page.reload();
    await expect(printRunRow(page, "Medieval Madness")).toContainText(
      "9 changes"
    );
    await expect(printRunRow(page, "Godzilla")).toBeVisible();
  });
});
