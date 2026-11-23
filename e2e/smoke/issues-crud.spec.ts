/**
 * Smoke: Authenticated issue creation → issue detail render (Class F + D).
 *
 * Unauthenticated detail render + comment gating:
 *   e2e/smoke/issue-detail-permissions.spec.ts
 * Field updates + Activity system events (status, assignee):
 *   e2e/full/status-overhaul.spec.ts
 * Action permissions, field row states, and service logic:
 *   src/test/integration/issue-detail-permissions.test.ts
 *   src/app/(app)/m/[initials]/i/[issueNumber]/issue-field-rows.test.tsx
 */

import { test, expect } from "../support/fixtures.js";
import {
  assertNoHorizontalOverflow,
  assertNoA11yViolations,
  showIssueSection,
} from "../support/actions.js";
import { cleanupTestEntities } from "../support/cleanup.js";
import { seededMachines } from "../support/constants.js";
import {
  fillReportForm,
  submitFormAndWaitForRedirect,
} from "../support/page-helpers.js";
import { STORAGE_STATE } from "../support/auth-state.js";

test.describe("Issues System", () => {
  test.use({ storageState: STORAGE_STATE.member });

  let createdTitle: string | null = null;

  test.beforeEach(({}, testInfo) => {
    createdTitle = null;
    // Mobile Safari can take longer to settle Server Action redirects.
    test.setTimeout(
      testInfo.project.name.includes("Mobile Safari") ? 120000 : 60000
    );
  });

  test.afterEach(async () => {
    if (!createdTitle) {
      return;
    }
    await cleanupTestEntities({ issueTitlePrefix: createdTitle });
    createdTitle = null;
  });

  test("creates an issue and renders the detail page", async ({
    page,
  }, testInfo) => {
    const machineInitials = seededMachines.addamsFamily.initials;
    const isMobile = testInfo.project.name.includes("Mobile");
    createdTitle = `E2E Issues CRUD ${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;

    await page.goto(`/report/detailed?machine=${machineInitials}`);
    await assertNoA11yViolations(page);

    await fillReportForm(page, {
      title: createdTitle,
      description: "The right flipper does not respond when button is pressed",
      priority: "medium",
    });

    await submitFormAndWaitForRedirect(
      page,
      page.getByRole("button", { name: "Submit Issue Report" }),
      {
        awayFrom: "/report/detailed",
        expectedIssueTitle: createdTitle,
      }
    );

    const urlMatch = /\/m\/TAF\/i\/([0-9]+)$/.exec(page.url());
    expect(urlMatch).not.toBeNull();
    const issueNumber = Number(urlMatch?.[1]);

    await expect(
      page
        .getByRole("main")
        .getByRole("heading", { level: 1, name: createdTitle })
    ).toBeVisible();
    await assertNoA11yViolations(page);

    const idText = `${machineInitials}-${String(issueNumber).padStart(2, "0")}`;
    await expect(
      page.getByRole("main").getByText(idText).filter({ visible: true }).first()
    ).toBeVisible();
    await expect(
      page.getByTestId("machine-link").filter({ visible: true }).first()
    ).toBeVisible();
    await expect(page.getByTestId("issue-timeline")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Activity" })
    ).toBeVisible();

    const floatingComment = page.getByRole("button", {
      name: "Comment",
      exact: true,
    });
    const inlineCommentForm = page.getByTestId("issue-comment-form");
    if (isMobile) {
      await expect(floatingComment).toBeVisible();
      await expect(inlineCommentForm).toBeHidden();
    } else {
      await expect(inlineCommentForm).toBeVisible();
      await expect(floatingComment).toBeHidden();
    }

    const fieldRows = page.getByTestId("issue-field-rows");
    if (isMobile) {
      await expect(fieldRows).toBeHidden();
      await showIssueSection(page, "Details");
    }
    await expect(fieldRows).toBeVisible();
    await expect(page.getByRole("button", { name: /^Status: / })).toBeVisible();
    await expect(page.getByTestId("assignee-picker-trigger")).toContainText(
      "Unassigned"
    );
    await expect(page.getByTestId("issue-context-rows")).toBeVisible();

    await assertNoHorizontalOverflow(page);
  });
});
