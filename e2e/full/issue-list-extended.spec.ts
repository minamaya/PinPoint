/**
 * E2E Tests: Issue List Extended Journeys & Layout
 *
 * Covers browser-only CSS hit-testing (stretched row overlay vs machine link),
 * container-query responsive Summary Widget breakpoints, and multi-page
 * filter/return-to-list navigation. Read-only row assertions, segment filter
 * wiring, and server summary totals live in:
 *   - src/components/issues/view/IssueViewRows.test.tsx
 *   - src/components/issues/view/IssueView.test.tsx
 *   - src/components/issues/view/IssueSummaryWidgets.test.tsx
 *   - src/test/integration/issue-list-summary.test.ts
 */
import { test, expect, type Locator, type Page } from "../support/fixtures.js";
import { openListSearch, setListFilterOptions } from "../support/actions.js";
import { seededIssue, seededMachines } from "../support/constants.js";
import { STORAGE_STATE } from "../support/auth-state.js";

/**
 * The visible search field, without opening it. On a narrow phone a field
 * holding a search shows open by itself (list-views §7.3), so this finds it
 * there too; use openListSearch to type into it.
 */
function searchField(page: Page): Locator {
  return page.getByRole("searchbox", { name: "Search issues" });
}

/** The List View's announced result count (list-views §12.4). */
function resultCount(page: Page): Locator {
  return page.getByRole("status").filter({ hasText: /^(Showing|No) / });
}

test.describe("Issue List Features - Extended", () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test.beforeEach(() => {
    test.setTimeout(60000);
  });

  test("clicking the machine link opens the machine and clicking row padding opens the issue", async ({
    page,
  }) => {
    // Whole row links to the issue via ::after overlay, while the machine name
    // sits above it and navigates to the machine (issues-list §3.12).
    const issue = seededIssue("TAF");
    const machine = seededMachines.addamsFamily;
    const query = new URLSearchParams({ q: issue.title }).toString();

    await page.goto(`/issues?${query}`);
    await expect(resultCount(page)).toHaveText("Showing 1 to 1 of 1 issue");

    const row = page
      .getByRole("list", { name: "Issues" })
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: issue.title }) });
    await expect(row).toBeVisible();

    // The machine name opens the machine, not the issue.
    await row.getByRole("link", { name: machine.name }).click();
    await expect(page).toHaveURL(new RegExp(`/m/${machine.initials}$`));
    await page.goBack();
    await expect(row).toBeVisible();

    // A click anywhere on the row, away from the title, opens the issue: the
    // row's top-left corner is padding the title link's overlay covers.
    await row.click({ position: { x: 4, y: 4 } });
    await expect(page).toHaveURL(
      new RegExp(`/m/${machine.initials}/i/${String(issue.num)}$`)
    );
  });

  // Summary Widgets sit side by side at every width, each at least 240px
  // wide, and whole widgets drop from the right when the row cannot hold
  // them (widgets §2.3, §2.7). There is no Summary Row and no toggle.
  test("Summary Widgets sit side by side at desktop width and drop from the right as the row narrows", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/issues");

    const status = page.getByRole("region", { name: "Status" });
    const severity = page.getByRole("region", { name: "Severity" });
    const priority = page.getByRole("region", { name: "Priority" });

    const tops: number[] = [];
    for (const widget of [status, severity, priority]) {
      await expect(widget).toBeVisible();
      const box = await widget.boundingBox();
      expect(box).not.toBeNull();
      if (box) tops.push(box.y);
    }
    expect(new Set(tops).size).toBe(1);
    await expect(page.getByRole("button", { name: /^Summary: / })).toHaveCount(
      0
    );

    await page.setViewportSize({ width: 600, height: 900 });
    await expect(status).toBeVisible();
    await expect(severity).toBeVisible();
    await expect(priority).toBeHidden();

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(status).toBeVisible();
    await expect(severity).toBeHidden();
    await expect(priority).toBeHidden();
  });

  test("should persist filters when navigating to issue detail and back", async ({
    page,
  }) => {
    // 1. Go to issues and apply a severity filter
    await page.goto("/issues");
    await setListFilterOptions(page, "Severity", ["Major"]);

    // Wait for URL to update with filter
    await page.waitForURL(/[?&]severity=major(?:&|$)/);

    // 2. Click on an issue title link to navigate to detail page
    const issueLink = page.getByRole("link", {
      name: seededIssue("TAF").title,
    });
    await issueLink.click();

    // Wait for navigation to issue detail
    await expect(page).toHaveURL(/\/m\/[A-Z]+\/i\/\d+/);

    // 3. Return to the filtered issue list. The issue detail page has no back
    // link of its own; AppHeader path persistence is covered by the Issues
    // link test below.
    await page.goBack();
    await expect(page).toHaveURL(/[?&]severity=major(?:&|$)/);

    // The list is still filtered: every row is Major.
    const issues = page.getByRole("list", { name: "Issues" });
    await expect(
      issues.getByRole("link", { name: seededIssue("TAF").title })
    ).toBeVisible();
    await expect(
      issues.getByTestId("issue-severity").filter({ hasNotText: "Major" })
    ).toHaveCount(0);
  });

  test("should return to the filtered list from the app's Issues link", async ({
    page,
  }) => {
    // 1. Go to issues and apply a search filter
    await page.goto("/issues");
    const search = await openListSearch(page, "Search issues");
    await search.fill("Thing");
    await search.press("Enter");
    await page.waitForURL(/[?&]q=Thing(?:&|$)/);

    // 2. Navigate to a different page in the same tab (dashboard)
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/dashboard");

    // 3. The Issues link returns to the list this tab last showed
    // (list-views §11.1): the header link on desktop, the tab bar on phones.
    const issuesLink = page
      .getByRole("link", { name: "Issues", exact: true })
      .filter({ visible: true })
      .first();
    await expect(issuesLink).toHaveAttribute("href", /[?&]q=Thing(?:&|$)/);
    await issuesLink.click();
    await expect(page).toHaveURL(/[?&]q=Thing(?:&|$)/);

    // Verify search term is still in the input
    await expect(searchField(page)).toHaveValue("Thing");
  });
});
