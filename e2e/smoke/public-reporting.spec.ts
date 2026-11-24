/**
 * E2E Tests for Public Issue Reporting
 *
 * Covers the anonymous reporting journey, success-page draft clearing, and
 * draft preservation across login. Non-journey parameter/UI variants live in
 * `public-issue-submit.test.ts`, `clear-draft.test.tsx`,
 * `unified-report-form.test.tsx`, and `header-sign-in-button.test.tsx`.
 */

import { test, expect } from "../support/fixtures.js";
import {
  assertNoHorizontalOverflow,
  assertNoA11yViolations,
  selectMachine,
  machineSelectValue,
} from "../support/actions.js";
import { cleanupTestEntities } from "../support/cleanup.js";
import { TEST_USERS } from "../support/constants.js";
import { fillReportForm } from "../support/page-helpers.js";

const PUBLIC_PREFIX = "E2E Public Report";

function uniqueTitle(label: string): string {
  return `${PUBLIC_PREFIX} ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

test.describe("Public Issue Reporting", () => {
  test.afterEach(async () => {
    await cleanupTestEntities({
      issueTitlePrefix: PUBLIC_PREFIX,
    });
  });

  test("should submit anonymous issue, clear draft, and start fresh on next report", async ({
    page,
  }) => {
    await page.goto("/report/detailed");
    await expect(
      page.getByRole("heading", { name: "Report an Issue" })
    ).toBeVisible();

    const machineValue = machineSelectValue(page);
    expect(await machineValue.inputValue()).toBe("");

    await selectMachine(page);
    const selectedMachineId = await machineValue.inputValue();
    expect(selectedMachineId).toBeTruthy();
    await expect(page).toHaveURL(/machine=/);

    await assertNoHorizontalOverflow(page);
    await assertNoA11yViolations(page);

    await fillReportForm(page, {
      title: uniqueTitle("Anon Submit"),
      description: "Playfield gets stuck during multiball.",
      includePriority: false,
    });

    await expect
      .poll(() =>
        page.evaluate(() => window.localStorage.getItem("report_draft"))
      )
      .not.toBeNull();

    await page.getByRole("button", { name: "Submit Issue Report" }).click();

    await expect(page).toHaveURL("/report/success");
    await expect(
      page.getByRole("heading", { name: "Issue Sent!" })
    ).toBeVisible();
    await assertNoA11yViolations(page);

    // ClearReportDraft effect removes persisted draft after anonymous submit.
    await expect
      .poll(() =>
        page.evaluate(() => window.localStorage.getItem("report_draft"))
      )
      .toBeNull();

    await page.getByRole("link", { name: "Report Another Issue" }).click();
    await expect(page).toHaveURL("/report");
    await expect(
      page.getByRole("heading", { name: "Report an Issue" })
    ).toBeVisible();

    await page.getByRole("link", { name: "Add details" }).click();
    await expect(page).toHaveURL("/report/detailed");
    await expect(page.getByLabel("Issue Title")).toHaveValue("");
    await expect(page.getByLabel("Description")).toHaveText("");
    const machineAfterReset = await machineValue.inputValue();
    expect(machineAfterReset).toBe("");
    expect(machineAfterReset).not.toBe(selectedMachineId);
  });

  test("should preserve draft and update sign-in return links across login", async ({
    page,
  }) => {
    await page.goto("/report/detailed");
    await selectMachine(page);
    await expect(page).toHaveURL(/machine=/);

    const machineInitials = new URL(page.url()).searchParams.get("machine");
    expect(machineInitials).toBeTruthy();
    if (!machineInitials) {
      throw new Error("Expected machine initials in report URL before login.");
    }

    const issueTitle = uniqueTitle("Login Draft");
    const issueDescription = "Draft should survive login round-trip.";
    await fillReportForm(page, {
      title: issueTitle,
      description: issueDescription,
      includePriority: false,
    });

    const expectedNext = `/report/detailed?machine=${machineInitials}`;
    const headerSignInHref = await page
      .getByTestId("nav-signin")
      .getAttribute("href");
    const headerSignInUrl = new URL(headerSignInHref ?? "", "http://localhost");
    expect(headerSignInUrl.pathname).toBe("/login");
    expect(headerSignInUrl.searchParams.get("next")).toBe(expectedNext);

    await page.getByRole("link", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/login\?/);

    const loginUrl = new URL(page.url());
    expect(loginUrl.searchParams.get("next")).toBe(expectedNext);

    await page.getByLabel("Email").fill(TEST_USERS.member.email);
    await page.getByLabel(/^Password\s*\*?$/).fill(TEST_USERS.member.password);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect
      .poll(() => {
        const url = new URL(page.url());
        return `${url.pathname}${url.search}`;
      })
      .toBe(expectedNext);
    await expect(page.getByLabel("Issue Title")).toHaveValue(issueTitle);
    await expect(page.getByLabel("Description")).toHaveText(issueDescription);
    await expect(page.getByLabel("First Name")).toHaveCount(0);
  });
});
