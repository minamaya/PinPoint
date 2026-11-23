/**
 * E2E Tests: Mobile Comment Sheet — Draft Persistence & Discard Guard
 *
 * The unit tests (comment-draft.test.ts, AddCommentForm.test.tsx,
 * FloatingCommentButton.test.tsx) cover the draft store against jsdom storage
 * with the editor mocked; this spec verifies the real TipTap editor restoring
 * a draft from browser localStorage across a full page reload and clearing it
 * on Discard.
 *
 * Desktop vs mobile composer visibility is verified in:
 *   e2e/smoke/issues-crud.spec.ts
 *   src/components/issues/FloatingCommentButton.test.tsx
 *   src/test/unit/components/issues/issue-detail-permissions.test.tsx
 * Unauthenticated gating is verified in:
 *   e2e/smoke/issue-detail-permissions.spec.ts
 */

import { test, expect } from "../support/fixtures.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import { seededIssue } from "../support/constants.js";
import { openIssueCommentForm } from "../support/page-helpers.js";

const ISSUE = seededIssue("AFM");
const ISSUE_URL = `/m/AFM/i/${ISSUE.num}`;

test.describe("FloatingCommentButton — mobile draft & discard", () => {
  test.use({
    storageState: STORAGE_STATE.member,
    viewport: { width: 375, height: 667 },
  });

  test("a comment draft survives Keep editing and page reload, and Discard clears it", async ({
    page,
  }, testInfo) => {
    await page.goto(ISSUE_URL);
    const draft = `Draft ${testInfo.project.name} ${Date.now().toString()}`;

    const { form, isSheet } = await openIssueCommentForm(page);
    expect(isSheet).toBe(true);
    const editor = form.getByRole("textbox", { name: "Comment" });
    await expect(editor).toBeFocused();
    await page.keyboard.type(draft);
    await expect(editor).toContainText(draft);

    // Dismissing a typed comment asks first; Keep editing leaves it in place.
    await form.getByRole("button", { name: "Close" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Discard changes?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Keep editing" }).click();
    await expect(confirm).toBeHidden();
    await expect(editor).toContainText(draft);

    // A full reload restores the draft into the real TipTap editor.
    await page.reload();
    const afterReload = await openIssueCommentForm(page);
    await expect(
      afterReload.form.getByRole("textbox", { name: "Comment" })
    ).toContainText(draft);

    // Discard closes the sheet and empties the stored draft.
    await afterReload.form.getByRole("button", { name: "Close" }).click();
    await page
      .getByRole("alertdialog", { name: "Discard changes?" })
      .getByRole("button", { name: "Discard" })
      .click();
    await expect(afterReload.form).toBeHidden();

    const reopened = await openIssueCommentForm(page);
    await expect(
      reopened.form.getByRole("textbox", { name: "Comment" })
    ).not.toContainText(draft);
  });
});
