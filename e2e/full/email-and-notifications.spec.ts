/**
 * E2E Tests: Email and Notifications (Full Suite)
 *
 * Keeps two non-vacuous live journeys:
 * 1. Public issue report -> SSR MainLayout bell menu -> click navigates & marks read.
 * 2. Issue creation -> Mailpit "New Issue" email + real unsubscribe link ->
 *    status update -> Mailpit "Status Changed" email -> GET/POST /api/unsubscribe.
 */

import { test, expect, attachHydrationWait } from "../support/fixtures.js";
import { MailpitClient } from "../support/mailpit.js";
import {
  ensureLoggedIn,
  updateIssueField,
  selectMachine,
  machineSelectValue,
} from "../support/actions.js";
import {
  fillReportForm,
  submitFormAndWaitForRedirect,
} from "../support/page-helpers.js";
import {
  createTestUser,
  createTestMachine,
  deleteTestUser,
  deleteTestMachine,
  updateUserRole,
  updateNotificationPreferences,
  getNotificationPreferences,
} from "../support/supabase-admin.js";
import {
  getTestIssueTitle,
  getTestEmail,
  getTestMachineInitials,
} from "../support/test-isolation.js";

test.describe("Notifications", () => {
  const cleanupUserIds: string[] = [];
  const cleanupMachineIds: string[] = [];

  test.afterAll(async () => {
    for (const machineId of cleanupMachineIds) {
      await deleteTestMachine(machineId).catch(() => undefined);
    }
    for (const userId of cleanupUserIds) {
      await deleteTestUser(userId).catch(() => undefined);
    }
  });

  test("notifies machine owner in the bell menu on public report and marks read on click", async ({
    browser,
  }, testInfo) => {
    const ownerEmail = getTestEmail("notify-owner@test.com");
    const owner = await createTestUser(ownerEmail);
    cleanupUserIds.push(owner.id);
    const machine = await createTestMachine(owner.id);
    cleanupMachineIds.push(machine.id);

    await updateNotificationPreferences(owner.id, {
      inAppNotifyOnNewIssue: true,
    });

    const ownerContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const publicContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });

    try {
      const ownerPage = attachHydrationWait(await ownerContext.newPage());
      const publicPage = attachHydrationWait(await publicContext.newPage());

      await ensureLoggedIn(ownerPage, testInfo, {
        email: ownerEmail,
        password: "TestPassword123",
      });

      await publicPage.goto("/report/detailed");
      await selectMachine(publicPage, machine.id);
      await expect(machineSelectValue(publicPage)).toHaveValue(machine.id);

      const issueTitle = getTestIssueTitle("Public Report");
      await fillReportForm(publicPage, {
        title: issueTitle,
        includePriority: false,
      });
      await publicPage
        .getByRole("button", { name: "Submit Issue Report" })
        .click();
      await expect(publicPage).toHaveURL("/report/success");

      await ownerPage.bringToFront();
      await ownerPage.goto("/dashboard");

      await ownerPage.getByRole("button", { name: /notifications/i }).click();
      const menu = ownerPage.getByRole("menu");
      const item = menu.getByRole("menuitem", {
        name: new RegExp(`New report ${machine.initials}-1`),
      });
      await expect(item).toBeVisible();

      await item.click();
      await expect(ownerPage).toHaveURL(
        new RegExp(`/m/${machine.initials}/i/1$`)
      );
      await expect(
        ownerPage.getByRole("heading", { level: 1, name: issueTitle })
      ).toBeVisible();

      await expect(async () => {
        await ownerPage.reload({ waitUntil: "domcontentloaded" });
        await ownerPage.getByRole("button", { name: /notifications/i }).click();
        await expect(
          ownerPage.getByRole("menu").getByText("No new notifications")
        ).toBeVisible();
      }).toPass({ timeout: 15000 });
    } finally {
      await ownerContext.close();
      await publicContext.close();
    }
  });
});

test.describe("Email Notifications & Unsubscribe", () => {
  const mailpit = new MailpitClient();
  const cleanupUserIds: string[] = [];
  const cleanupMachineIds: string[] = [];
  let testAdminEmail: string;
  let testAdminUserId: string;
  let testMachineInitials: string;

  test.beforeAll(async () => {
    testAdminEmail = getTestEmail("worker-admin@test.com");
    const user = await createTestUser(testAdminEmail);
    testAdminUserId = user.id;
    await updateUserRole(user.id, "admin");
    cleanupUserIds.push(user.id);

    const initials = getTestMachineInitials();
    const machine = await createTestMachine(user.id, initials);
    testMachineInitials = machine.initials;
    cleanupMachineIds.push(machine.id);

    await updateNotificationPreferences(user.id, {
      emailNotifyOnStatusChange: true,
    });
  });

  test.afterAll(async () => {
    for (const machineId of cleanupMachineIds) {
      await deleteTestMachine(machineId).catch(() => undefined);
    }
    for (const userId of cleanupUserIds) {
      await deleteTestUser(userId).catch(() => undefined);
    }
  });

  test.skip(
    ({ browserName }) => browserName === "webkit",
    "Next.js Issue #48309: Safari Server Action redirect timing"
  );

  test("delivers Mailpit emails on issue creation and status change, and unsubscribes via email link", async ({
    page,
    request,
  }, testInfo) => {
    const issueTitle = getTestIssueTitle("Email Flow");

    await ensureLoggedIn(page, testInfo, {
      email: testAdminEmail,
      password: "TestPassword123",
    });

    await page.goto(`/report/detailed?machine=${testMachineInitials}`);
    await fillReportForm(page, {
      title: issueTitle,
      description: "Testing email notifications",
    });

    await submitFormAndWaitForRedirect(
      page,
      page.getByRole("button", { name: "Submit Issue Report" }),
      { awayFrom: "/report/detailed" }
    );

    const issueUrlPattern = new RegExp(
      `\\/m\\/${testMachineInitials}\\/i\\/[0-9]+`
    );
    await expect(page).toHaveURL(
      new RegExp(`(${issueUrlPattern.source})|(\\/report\\/success)`)
    );

    if (page.url().includes("/report/success")) {
      await page.goto("/dashboard");
      await page
        .getByTestId("recent-issue-card")
        .filter({ hasText: issueTitle })
        .first()
        .click();
    }

    await expect(page).toHaveURL(issueUrlPattern);
    const titlePattern = issueTitle
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    await expect(
      page
        .getByRole("main")
        .getByRole("heading", { level: 1, name: new RegExp(titlePattern) })
    ).toBeVisible();

    const email1 = await mailpit.waitForEmail(testAdminEmail, {
      subjectContains: issueTitle,
      timeout: 30000,
      pollIntervalMs: 750,
    });
    expect(email1).not.toBeNull();
    expect(email1?.to).toContain(testAdminEmail);
    const email1Id = email1?.ID;
    if (!email1Id) {
      throw new Error("Expected initial email to have a Mailpit message ID");
    }

    const detail1 = await mailpit.getMessage(testAdminEmail, email1Id);
    const body1 = (detail1.HTML ?? detail1.Text ?? "").toString();
    expect(body1).toContain("New Issue");

    const unsubMatch =
      /\/api\/unsubscribe\?uid=([^"&\s<>]+)(?:&amp;|&)token=([^"&\s<>]+)/.exec(
        body1
      );
    if (!unsubMatch?.[1] || !unsubMatch[2]) {
      throw new Error("Expected unsubscribe link in email body");
    }
    const uid = decodeURIComponent(unsubMatch[1]);
    const token = decodeURIComponent(unsubMatch[2]);
    expect(uid).toBe(testAdminUserId);

    await updateIssueField(page, "status", "in_progress");

    let email2Id: string | null = null;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const allEmails = await mailpit.getMessages(testAdminEmail);
      const statusEmail = allEmails.find(
        (m) =>
          m.ID !== email1Id &&
          m.Subject.includes(issueTitle) &&
          (m.to?.some(
            (addr) => addr.toLowerCase() === testAdminEmail.toLowerCase()
          ) ??
            false)
      );
      if (statusEmail?.ID) {
        email2Id = statusEmail.ID;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    if (!email2Id) {
      throw new Error("Expected status-change email in Mailpit");
    }

    const detail2 = await mailpit.getMessage(testAdminEmail, email2Id);
    const body2 = (detail2.HTML ?? detail2.Text ?? "").toString();
    expect(body2).toContain("Status Changed");

    const headers = { "x-skip-autologin": "true" };
    const getRes = await request.get(
      `/api/unsubscribe?uid=${encodeURIComponent(uid)}&token=${encodeURIComponent(token)}`,
      { headers, maxRedirects: 0 }
    );
    expect(getRes.status()).toBe(200);
    const confirmHtml = await getRes.text();
    expect(confirmHtml).toContain("Unsubscribe from PinPoint emails?");
    expect(confirmHtml).toContain(
      `<input type="hidden" name="uid" value="${uid}" />`
    );
    expect(confirmHtml).toContain(
      `<input type="hidden" name="token" value="${token}" />`
    );
    const prefsBeforePost = await getNotificationPreferences(testAdminUserId);
    expect(prefsBeforePost.email_enabled).toBe(true);

    const postRes = await request.post("/api/unsubscribe", {
      headers,
      form: { uid, token },
      maxRedirects: 0,
    });
    expect(postRes.status()).toBe(200);
    expect(await postRes.text()).toContain("You have been unsubscribed");

    const prefsAfterPost = await getNotificationPreferences(testAdminUserId);
    expect(prefsAfterPost.email_enabled).toBe(false);
    expect(prefsAfterPost.email_notify_on_assigned).toBe(false);
    expect(prefsAfterPost.email_notify_on_status_change).toBe(false);
    expect(prefsAfterPost.email_notify_on_new_comment).toBe(false);
    expect(prefsAfterPost.email_notify_on_new_issue).toBe(false);
    expect(prefsAfterPost.email_watch_new_issues_global).toBe(false);
    expect(prefsAfterPost.email_notify_on_pinballmap_comment).toBe(false);
  });
});
