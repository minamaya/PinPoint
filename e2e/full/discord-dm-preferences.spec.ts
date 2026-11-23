import { test, expect } from "../support/fixtures.js";
import { loginAs } from "../support/actions.js";
import {
  createTestUser,
  deleteTestUser,
  setUserDiscordId,
  updateUserRole,
  configureDiscordIntegrationForTest,
  unconfigureDiscordIntegrationForTest,
} from "../support/supabase-admin.js";

test.describe("Discord DM preferences", () => {
  let memberEmail: string;
  let memberId: string;

  test.beforeAll(async () => {
    const ts = Date.now();
    memberEmail = `member_discord_dm_enabled_${ts}@example.com`;
    const user = await createTestUser(memberEmail);
    memberId = user.id;
    await updateUserRole(memberId, "member");

    // Configure the singleton with a fake vault-backed token and guild ID so
    // getDiscordConfig() returns non-null and the form renders the Discord
    // column.
    await configureDiscordIntegrationForTest();
  });

  test.afterAll(async () => {
    await unconfigureDiscordIntegrationForTest().catch(() => {
      // Tolerable if singleton row state already matches.
    });
    await deleteTestUser(memberId);
  });

  test("reflects Discord link state and persists per-event preference toggle across reload", async ({
    page,
  }, testInfo) => {
    await loginAs(page, testInfo, {
      email: memberEmail,
      password: "TestPassword123",
    });
    await page.goto("/settings");

    // Unlinked state: column renders, main switch disabled, Link CTA visible.
    const discordMainSwitch = page.getByLabel("Discord Notifications");
    await expect(discordMainSwitch).toBeVisible();
    await expect(discordMainSwitch).toBeDisabled();
    await expect(
      page.getByRole("link", { name: "Link Discord" })
    ).toBeVisible();

    // Link Discord in DB, reload, toggle per-event preference off, and confirm persistence.
    await setUserDiscordId(memberId, "test-discord-id-toggle");
    try {
      await page.reload();

      const discordAssignSwitch = page.locator("#discordNotifyOnAssigned");
      await expect(discordAssignSwitch).toBeVisible();
      await expect(discordAssignSwitch).toBeChecked();

      await discordAssignSwitch.click();
      await expect(discordAssignSwitch).not.toBeChecked();

      await page.getByRole("button", { name: "Save Preferences" }).click();
      await expect(page.getByRole("button", { name: "Saved!" })).toBeVisible();

      await page.reload();

      const reloaded = page.locator("#discordNotifyOnAssigned");
      await expect(reloaded).toBeVisible();
      await expect(reloaded).not.toBeChecked();
    } finally {
      await setUserDiscordId(memberId, null);
    }
  });
});
