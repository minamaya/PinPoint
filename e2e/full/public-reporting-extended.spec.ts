/**
 * E2E Tests for Public Issue Reporting - Extended (Full Suite)
 *
 * Tests the anonymous reporter -> success prompt -> pre-filled signup journey.
 * Core reporting tests are in e2e/smoke/public-reporting.spec.ts.
 * Action redirect parameters, status/priority enforcement, and signup form
 * pre-fill variants are tested in public-issue-submit.test.ts and signup-form.test.tsx.
 */

import { test, expect } from "../support/fixtures.js";
import { selectMachine } from "../support/actions.js";
import { cleanupTestEntities } from "../support/cleanup.js";
import { fillReportForm } from "../support/page-helpers.js";

const PUBLIC_PREFIX = "E2E Public Report";

test.describe("Public Issue Reporting - Extended", () => {
  test.afterEach(async () => {
    await cleanupTestEntities({
      issueTitlePrefix: PUBLIC_PREFIX,
    });
  });

  test("should pre-fill name and email on signup when both provided", async ({
    page,
  }) => {
    const email = `reporter-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;

    await page.goto("/report/detailed");
    await selectMachine(page);
    await expect(page).toHaveURL(/machine=/);

    await fillReportForm(page, {
      title: `${PUBLIC_PREFIX} Signup Prefill ${Date.now()}`,
      includePriority: false,
    });

    await page.getByLabel("First Name").fill("John");
    await page.getByLabel("Last Name").fill("Smith");
    await page.getByLabel("Email Address").fill(email);

    await page.getByRole("button", { name: "Submit Issue Report" }).click();

    await expect(page).toHaveURL(/\/report\/success/);
    await expect(page.getByText("Want to track your reports?")).toBeVisible();

    await page.getByRole("link", { name: "Join PinPoint" }).click();

    await expect(page).toHaveURL(/\/signup\?/);
    await expect(page.getByLabel(/First Name/i)).toHaveValue("John");
    await expect(page.getByLabel(/Last Name/i)).toHaveValue("Smith");
    await expect(page.getByLabel(/Email/i)).toHaveValue(email);
  });

  test("success and signup routes pre-fill name without email via SSR", async ({
    request,
  }) => {
    const headers = { "x-skip-autologin": "true" };

    const successResponse = await request.get(
      "/report/success?new_pending=true&firstName=Jane&lastName=Reporter",
      { headers }
    );
    expect(successResponse.status()).toBe(200);
    const successHtml = await successResponse.text();
    expect(successHtml).toContain("Want to track your reports?");
    expect(successHtml).toContain(
      'href="/signup?firstName=Jane&amp;lastName=Reporter"'
    );

    const signupResponse = await request.get(
      "/signup?firstName=Jane&lastName=Reporter",
      { headers }
    );
    expect(signupResponse.status()).toBe(200);
    const signupHtml = await signupResponse.text();
    expect(signupHtml).toMatch(/name="firstName"[^>]*value="Jane"/);
    expect(signupHtml).toMatch(/name="lastName"[^>]*value="Reporter"/);
    expect(signupHtml).not.toMatch(/name="email"[^>]*readonly/i);
  });
});
