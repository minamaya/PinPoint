import { test, expect } from "../support/fixtures.js";
import { loginAs } from "../support/actions.js";
import { cleanupTestEntities } from "../support/cleanup.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import { seededMachines } from "../support/constants.js";
import {
  createTestUser,
  deleteTestUser,
  updateUserRole,
} from "../support/supabase-admin.js";
import { getTestEmail } from "../support/test-isolation.js";

const afm = seededMachines.attackFromMars;
const MODE_PREFIX = "E2E Report Mode";

test.describe("report mode handoffs", () => {
  test("legacy Multiple URL redirects to its named route", async ({
    request,
  }) => {
    const response = await request.get("/report/quick", {
      headers: { "x-skip-autologin": "true" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    const location = new URL(
      response.headers()["location"] ?? "",
      "http://localhost"
    );
    expect(location.pathname).toBe("/report/multiple");
  });

  test.describe("member report flows", () => {
    test.use({ storageState: STORAGE_STATE.member });

    test.afterEach(async () => {
      await cleanupTestEntities({
        issueTitlePrefix: MODE_PREFIX,
      });
    });

    test("Quick report creates one issue from the short form", async ({
      page,
    }) => {
      const title = `${MODE_PREFIX} Quick ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await page.goto(`/report?machine=${afm.initials}`);
      await expect(
        page.getByRole("combobox", { name: "Machine" }).first()
      ).toContainText(afm.initials);
      await page.getByRole("textbox", { name: "Problem" }).fill(title);
      await page.getByRole("button", { name: "Report issue" }).click();

      await expect(page).toHaveURL(new RegExp(`/m/${afm.initials}/i/\\d+`));
      await expect(
        page.getByRole("heading", { level: 1, name: title })
      ).toBeVisible();
    });

    test("draft carries machine, problem, frequency, and extra rows across Quick, Detailed, and Multiple", async ({
      page,
    }) => {
      await page.goto("/report");
      await page.getByRole("combobox", { name: "Machine" }).first().click();
      await page.getByTestId(`machine-option-${afm.id}`).click();
      await page
        .getByRole("textbox", { name: "Problem" })
        .fill("Handoff test problem");
      await page.getByText("Frequent", { exact: true }).click();
      await expect(page.getByRole("radio", { name: "Frequent" })).toBeChecked();

      await page.getByRole("link", { name: "Add details" }).click();
      await expect
        .poll(() => {
          const url = new URL(page.url());
          return `${url.pathname}${url.search}`;
        })
        .toBe(`/report/detailed?machine=${afm.initials}`);
      await expect(
        page.getByRole("combobox", { name: "Select Machine" })
      ).toContainText(afm.initials);
      await expect(page.getByLabel("Issue Title *")).toHaveValue(
        "Handoff test problem"
      );
      await expect(page.getByTestId("issue-frequency-select")).toContainText(
        "Frequent"
      );

      await page.getByRole("link", { name: "Report multiple issues" }).click();
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe("/report/multiple");
      const firstRow = page.getByTestId("quick-row").first();
      await expect(
        firstRow.getByRole("textbox", { name: /Problem/ })
      ).toHaveValue("Handoff test problem");
      await expect(
        firstRow.getByRole("combobox", { name: "Machine" })
      ).toContainText(afm.initials);

      await page.getByRole("button", { name: /add issue/i }).click();
      const secondRow = page.getByTestId("quick-row").nth(1);
      await secondRow
        .getByRole("textbox", { name: /Problem/ })
        .fill("Second draft");

      await page.getByRole("link", { name: "Detailed report" }).click();
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe("/report/detailed");
      await expect(page.getByLabel("Issue Title *")).toHaveValue(
        "Handoff test problem"
      );

      await page.getByRole("link", { name: "Report multiple issues" }).click();
      await expect(
        page
          .getByTestId("quick-row")
          .nth(1)
          .getByRole("textbox", { name: /Problem/ })
      ).toHaveValue("Second draft");
    });
  });
});

test.describe("default report form preferences", () => {
  // A throwaway member: the test saves profile preferences, and the seeded
  // member is shared across parallel workers.
  let email: string;
  let userId: string;

  test.beforeAll(async () => {
    email = getTestEmail("report-defaults@test.com");
    const user = await createTestUser(email);
    userId = user.id;
    await updateUserRole(userId, "member");
  });

  test.afterAll(async () => {
    await deleteTestUser(userId).catch(() => {});
  });

  test("saved preferences drive the header and bottom-bar Report actions", async ({
    page,
  }, testInfo) => {
    await loginAs(page, testInfo, { email, password: "TestPassword123" });
    await page.goto("/settings");

    const mobile = page.getByRole("group", { name: "Mobile report form" });
    const desktop = page.getByRole("group", {
      name: "Desktop / Tablet report form",
    });
    await expect(mobile.getByRole("radio", { name: "Quick" })).toBeChecked();
    await expect(
      desktop.getByRole("radio", { name: "Detailed" })
    ).toBeChecked();

    const saveStatus = page.getByRole("status").filter({ hasText: /Sav/ });
    await mobile.getByText("Multiple", { exact: true }).click();
    await expect(saveStatus).toHaveText("Saved");
    await desktop.getByText("Quick", { exact: true }).click();
    await expect(saveStatus).toHaveText("Saved");

    await page.goto("/dashboard");
    const mobileReportLink = page
      .getByTestId("bottom-tab-bar")
      .getByRole("link", { name: /report/i, includeHidden: true });
    await expect(mobileReportLink).toHaveAttribute("href", "/report/multiple");
    await expect(page.getByTestId("nav-report-issue")).toHaveAttribute(
      "href",
      "/report"
    );

    if (testInfo.project.name.includes("Mobile")) {
      await mobileReportLink.click();
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe("/report/multiple");
      await expect(page.getByTestId("quick-report-grid")).toBeVisible();
    } else {
      await page.getByTestId("nav-report-issue").click();
      await expect.poll(() => new URL(page.url()).pathname).toBe("/report");
      await expect(
        page.getByRole("textbox", { name: "Problem" })
      ).toBeVisible();
    }
  });
});
