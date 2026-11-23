// e2e/full/rich-text.spec.ts
import { test, expect } from "../support/fixtures.js";
import { loginAs } from "../support/actions.js";
import { cleanupTestEntities } from "../support/cleanup.js";
import {
  createTestUser,
  createTestMachine,
  deleteTestUser,
} from "../support/supabase-admin.js";
import {
  openIssueCommentForm,
  submitFormAndWaitForRedirect,
} from "../support/page-helpers.js";
import { getTestPrefix } from "../support/test-isolation.js";

/**
 * E2E tests for Rich Text Editor, @Mentions, and Rich Text Display (Class F).
 *
 * Lower-layer coverage:
 * - TipTap HTML serialization & XSS sanitization: src/lib/tiptap/render.test.ts
 * - Mention search & name resolution: src/test/integration/mention-names.test.ts
 * - Editor UI components: src/components/editor/{EditorToolbar,MentionList,RichTextDisplay}.test.tsx
 * - Mention notifications: src/test/integration/notifications.test.ts
 */

test.describe("Rich Text and Mentions", () => {
  let createdMachineInitials: string | null = null;
  const createdUserIds: string[] = [];

  test.beforeEach(() => {
    createdMachineInitials = null;
    createdUserIds.length = 0;
  });

  test.afterEach(async () => {
    if (createdMachineInitials) {
      await cleanupTestEntities({
        machineInitials: [createdMachineInitials],
      });
      createdMachineInitials = null;
    }
    for (const userId of createdUserIds) {
      await deleteTestUser(userId);
    }
    createdUserIds.length = 0;
  });

  test("creates an issue with bold and @mention, then adds an italic comment", async ({
    page,
  }, testInfo) => {
    const prefix = getTestPrefix();
    const reporterEmail = `reporter-${prefix}@example.com`;
    const mentionedEmail = `mentioned-${prefix}@example.com`;

    // Unique display names prevent mention autocomplete from matching other parallel test users
    const reporter = await createTestUser(reporterEmail, undefined, {
      firstName: `Reporter${prefix}`,
      lastName: "RT",
    });
    createdUserIds.push(reporter.id);
    const mentioned = await createTestUser(mentionedEmail, undefined, {
      firstName: `Mention${prefix}`,
      lastName: "Person",
    });
    createdUserIds.push(mentioned.id);

    await loginAs(page, testInfo, { email: reporterEmail });

    const initials = `T${prefix.slice(-2).toUpperCase()}`;
    const machine = await createTestMachine(reporter.id, initials);
    createdMachineInitials = machine.initials;

    // 1. Create issue with @mention + bold formatting
    await page.goto(`/report/detailed?machine=${machine.initials}`);
    await page.getByLabel("Issue Title *").fill("Test Rich Text Issue");

    const editor = page.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.type("Hello ");

    const mentionedDisplayName = `Mention${prefix} Person`;
    await page.keyboard.type(`@Mention${prefix}`);

    const mentionItem = page
      .getByRole("button", { name: new RegExp(mentionedDisplayName) })
      .first();
    await expect(mentionItem).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(editor).toContainText(`@${mentionedDisplayName}`);

    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "Toggle bold" }).click();

    await submitFormAndWaitForRedirect(
      page,
      page.getByRole("button", { name: "Submit Issue Report" }),
      { awayFrom: "/report/detailed" }
    );

    // 2. Verify rendered rich text + mention on issue detail page
    await expect(page).toHaveURL(new RegExp(`/m/${machine.initials}/i/1$`));
    await expect(
      page.getByRole("heading", { level: 1, name: "Test Rich Text Issue" })
    ).toBeVisible();

    const description = page.locator(".prose");
    await expect(description.locator("strong").first()).toBeVisible();
    await expect(description.locator(".mention")).toContainText(
      `@${mentionedDisplayName}`
    );

    // 3. Add a formatted comment (using mobile "Aa formatting" toggle when in sheet)
    const { form: commentForm, isSheet } = await openIssueCommentForm(page);
    if (isSheet) {
      const formatting = commentForm.getByRole("button", {
        name: "Aa formatting",
      });
      await formatting.press("Enter");
      await expect(formatting).toHaveAttribute("aria-pressed", "true");
    }

    const commentEditor = commentForm.locator(".ProseMirror");
    await commentEditor.waitFor({ state: "visible", timeout: 15000 });
    await commentEditor.click();
    await page.keyboard.type("This is a ");
    await commentForm.getByRole("button", { name: "Toggle italic" }).click();
    await page.keyboard.type("rich text");
    await commentForm.getByRole("button", { name: "Toggle italic" }).click();
    await page.keyboard.type(" comment.");

    await commentForm.getByRole("button", { name: "Add Comment" }).click();

    const lastComment = page.locator(".prose").last();
    await expect(lastComment.locator("em")).toContainText("rich text");
  });
});
