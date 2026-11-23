import { test, expect } from "../support/fixtures.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import { TEST_USERS } from "../support/constants.js";
import { createTestUser, deleteTestUser } from "../support/supabase-admin.js";

test.describe("Admin User Management", () => {
  test.use({ storageState: STORAGE_STATE.admin });

  let targetEmail: string;
  const createdUserIds: string[] = [];

  test.beforeAll(async () => {
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    targetEmail = `target_${uniqueSuffix}@example.com`;
    const targetUser = await createTestUser(targetEmail);
    createdUserIds.push(targetUser.id);
  });

  test.afterAll(async () => {
    for (const userId of createdUserIds) {
      await deleteTestUser(userId);
    }
  });

  test("admin views users, enforces row invariants, and changes a user's role", async ({
    page,
  }) => {
    await page.goto("/admin/users");
    await expect(
      page.getByRole("heading", { name: "User Management" })
    ).toBeVisible();

    // Own active admin row: self-demotion control is disabled and Remove is absent.
    const ownRow = page.getByRole("row").filter({
      has: page.getByRole("cell", {
        name: TEST_USERS.admin.email,
        exact: true,
      }),
    });
    const ownSelectTrigger = ownRow.getByRole("combobox");
    await expect(ownSelectTrigger).toBeDisabled();
    await expect(ownSelectTrigger).toHaveText("Admin");
    await expect(ownRow.getByRole("button", { name: /remove/i })).toHaveCount(
      0
    );

    // Seeded pending invited row mounts the Remove action (read-only check;
    // removal AlertDialog and DB action are tested in unit/integration tests).
    const invitedRow = page.getByRole("row").filter({
      has: page.getByRole("cell", {
        name: "invited.guest@example.com",
        exact: true,
      }),
    });
    await expect(
      invitedRow.getByRole("button", { name: /remove/i })
    ).toBeVisible();

    // Target user row: promote Guest -> Admin and verify toast + persisted label.
    await expect(page.getByText(targetEmail)).toBeVisible();
    const targetRow = page.getByRole("row").filter({
      has: page.getByRole("cell", { name: targetEmail, exact: true }),
    });
    const targetSelectTrigger = targetRow.getByRole("combobox");

    await expect(targetSelectTrigger).toHaveText("Guest");
    await expect(targetSelectTrigger).toBeEnabled();

    await targetSelectTrigger.click();
    await page.getByRole("option", { name: "Admin" }).click();

    await expect(page.getByText("Role updated successfully")).toBeVisible();
    await expect(targetSelectTrigger).toHaveText("Admin");
  });
});
