import { test, expect } from "../support/fixtures.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupTestEntities } from "../support/cleanup.js";
import {
  fillReportForm,
  submitFormAndWaitForRedirect,
} from "../support/page-helpers.js";
import { assertNoA11yViolations, selectMachine } from "../support/actions.js";
import { STORAGE_STATE } from "../support/auth-state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const IMAGE_UPLOAD_PREFIX = "E2E Image Upload";

test.describe("Image Upload Reporting", () => {
  test.use({ storageState: STORAGE_STATE.member });

  test.afterEach(async () => {
    await cleanupTestEntities({
      issueTitlePrefix: IMAGE_UPLOAD_PREFIX,
    });
  });

  test("authenticated user should see uploaded image on issue page", async ({
    page,
  }) => {
    await page.goto("/report/detailed");
    await selectMachine(page);
    await expect(page).toHaveURL(/machine=/);

    await assertNoA11yViolations(page);

    const issueTitle = `${IMAGE_UPLOAD_PREFIX} Auth ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await fillReportForm(page, {
      title: issueTitle,
      description: "Testing image persistence for auth user.",
      includePriority: true,
    });

    const testImagePath = join(__dirname, "..", "fixtures", "test-image.png");
    await page.setInputFiles(
      'input[data-testid="image-upload-input"]',
      testImagePath
    );

    await expect(
      page.getByRole("img", { name: "test-image.png" })
    ).toBeVisible();
    await expect(page.getByText("Image uploaded successfully")).toBeVisible();

    await submitFormAndWaitForRedirect(
      page,
      page.getByRole("button", { name: "Submit Issue Report" }),
      { awayFrom: "/report/detailed" }
    );

    await expect(page).toHaveURL(/\/i\/\d+/);

    await expect(page.getByText("Images (1)")).toHaveCount(0);
    const image = page
      .getByRole("region", { name: "Initial report" })
      .getByRole("img", { name: "test-image.png" })
      .first();
    await expect(image).toBeVisible();

    await page
      .waitForLoadState("networkidle", { timeout: 5000 })
      .catch(() => undefined);

    await image.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("img", { name: "test-image.png" })
        .first()
    ).toBeVisible();
  });
});
