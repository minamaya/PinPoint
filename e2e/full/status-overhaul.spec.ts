import { test, expect } from "../support/fixtures.js";
import {
  machineSelectValue,
  showIssueSection,
  updateIssueField,
  visibleIssueFieldControl,
} from "../support/actions.js";
import { cleanupTestEntities } from "../support/cleanup.js";
import { seededMachines, TEST_USERS } from "../support/constants.js";
import {
  fillReportForm,
  submitFormAndWaitForRedirect,
} from "../support/page-helpers.js";
import { STORAGE_STATE } from "../support/auth-state.js";

test.describe("Status Overhaul E2E", () => {
  test.use({ storageState: STORAGE_STATE.member });

  let createdTitle: string | null = null;

  test.beforeEach(() => {
    createdTitle = null;
    test.setTimeout(60000);
  });

  test.afterEach(async () => {
    if (!createdTitle) {
      return;
    }
    await cleanupTestEntities({
      issueTitlePrefix: createdTitle,
    });
    createdTitle = null;
  });

  test("creates issue with metadata, updates status and assignee, and records activity", async ({
    page,
  }, testInfo) => {
    const machine = seededMachines.addamsFamily;
    createdTitle = `E2E Status Overhaul ${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;

    // 1. Create Issue with pre-selected machine
    await page.goto(`/report/detailed?machine=${machine.initials}`);
    await expect(page.getByTestId("issue-priority-select")).toBeVisible();
    await expect(machineSelectValue(page)).toHaveValue(machine.id);

    await fillReportForm(page, {
      title: createdTitle,
      severity: "unplayable",
      priority: "high",
      frequency: "frequent",
    });
    await submitFormAndWaitForRedirect(
      page,
      page.getByRole("button", { name: "Submit Issue Report" }),
      {
        awayFrom: "/report/detailed",
        expectedIssueTitle: createdTitle,
      }
    );

    await expect(page).toHaveURL(/\/m\/TAF\/i\/[0-9]+$/);

    // 2. Verify initial Details fields
    await showIssueSection(page, "Details");
    await expect(visibleIssueFieldControl(page, "status")).toContainText(
      /New/i
    );
    await expect(visibleIssueFieldControl(page, "severity")).toContainText(
      /Unplayable/i
    );
    await expect(visibleIssueFieldControl(page, "priority")).toContainText(
      /High/i
    );
    await expect(visibleIssueFieldControl(page, "frequency")).toContainText(
      /Frequent/i
    );
    const assigneePicker = page.getByTestId("assignee-picker-trigger");
    await expect(assigneePicker).toContainText("Unassigned");

    // 3. Update Status and self-assign via "Me"
    await updateIssueField(page, "status", "in_progress");
    await expect(visibleIssueFieldControl(page, "status")).toContainText(
      /In Progress/i
    );

    const meOption = page.getByTestId("assignee-option-me");
    await expect(async () => {
      if (!(await meOption.isVisible())) {
        await assigneePicker.click();
      }
      await expect(meOption).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30000 });
    await meOption.click();
    await expect(assigneePicker).toContainText(TEST_USERS.member.name);

    // 4. Reload and verify persistence in Details and header summary line
    await page.reload();
    await expect(page.getByTestId("issue-summary-line")).toContainText(
      TEST_USERS.member.name
    );
    await expect(page.getByTestId("issue-summary-line")).toContainText(
      "In Progress"
    );
    await showIssueSection(page, "Details");
    await expect(visibleIssueFieldControl(page, "status")).toContainText(
      /In Progress/i
    );
    await expect(page.getByTestId("assignee-picker-trigger")).toContainText(
      TEST_USERS.member.name
    );

    // 5. Activity records both changes attributed to the member
    await showIssueSection(page, "Issue");
    const timeline = page.getByTestId("issue-timeline");
    for (const eventText of [
      "changed status New → In Progress",
      `assigned ${TEST_USERS.member.name}`,
    ]) {
      const eventItem = timeline.getByTestId(/^timeline-item-/).filter({
        has: page.getByTestId("system-event-text").filter({
          hasText: eventText,
        }),
      });
      await expect(eventItem).toBeVisible();
      await expect(eventItem.getByTestId("system-event-actor")).toHaveText(
        TEST_USERS.member.name
      );
    }
  });
});
