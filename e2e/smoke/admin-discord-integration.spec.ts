/**
 * E2E smoke: Combined admin integrations page.
 *
 * Covers the combined admin integrations surface:
 * - The legacy Discord route redirects to the combined page
 * - Page renders Discord first and Pinball Map second with their stored state
 * - No distinct integration enable switch is rendered
 * - The combined surface is accessible and has no horizontal overflow
 * - Unauthenticated visitors redirect to login and members receive Access Denied
 *
 * Interactive dialog state (Pinball Map clear confirmation, Discord token
 * removal, and user-menu navigation) lives in colocated RTL component specs,
 * and Vault/DB write paths live in Discord/PinballMap integration suites.
 */

import { test, expect } from "../support/fixtures.js";
import { STORAGE_STATE } from "../support/auth-state.js";
import {
  assertNoA11yViolations,
  assertNoHorizontalOverflow,
} from "../support/actions.js";

test.describe("Admin integrations page", () => {
  test.use({ storageState: STORAGE_STATE.admin });

  test("redirects the legacy route and renders both integration cards", async ({
    page,
  }) => {
    await page.goto("/admin/integrations/discord");
    await expect(page).toHaveURL(/\/admin\/integrations$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Integrations" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Discord" })
    ).toBeVisible();
    const discordCard = page.getByTestId("discord-integration-card");
    const connection = discordCard.getByRole("region", { name: "Connection" });
    await expect(connection.getByLabel("Bot token")).toBeVisible();
    await expect(connection.getByLabel("Server ID")).toBeVisible();
    await expect(connection.getByLabel("Invite link")).toBeVisible();
    await expect(connection.getByRole("checkbox")).toHaveCount(0);
    await expect(connection.getByRole("switch")).toHaveCount(0);
    await expect(
      connection.getByRole("button", { name: "Save changes" })
    ).toBeVisible();
    await expect(
      connection.getByRole("button", { name: "Reset" })
    ).toBeVisible();
    await expect(
      discordCard.getByRole("region", { name: "Activity summary" })
    ).toBeVisible();

    const pinballMapCard = page.getByTestId("pinballmap-integration-card");
    await expect(
      pinballMapCard.getByRole("heading", { level: 2, name: "Pinball Map" })
    ).toBeVisible();
    await expect(pinballMapCard.getByLabel("Location ID")).toHaveValue("26454");
    await expect(
      pinballMapCard.getByText("Austin Pinball Collective", { exact: true })
    ).toBeVisible();
    await expect(
      pinballMapCard.getByRole("link", { name: "View on Pinball Map" })
    ).toHaveAttribute(
      "href",
      "https://pinballmap.com/map/?by_location_id=26454"
    );
    await expect(
      pinballMapCard.getByRole("heading", { level: 3, name: "Sync health" })
    ).toBeVisible();
    await expect(
      pinballMapCard.getByText(/machines in the snapshot/)
    ).toBeVisible();

    await assertNoHorizontalOverflow(page);
    await assertNoA11yViolations(page);
  });
});

test.describe("Admin integrations page (anonymous)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("anonymous visitor redirects to login on /admin/integrations routes", async ({
    request,
  }) => {
    const headers = { "x-skip-autologin": "true" };

    const legacyRes = await request.get("/admin/integrations/discord", {
      headers,
      maxRedirects: 0,
    });
    expect(legacyRes.status()).toBe(307);
    expect(legacyRes.headers()["location"]).toMatch(
      /\/login\?next=%2Fadmin%2Fintegrations%2Fdiscord$/
    );

    const mainRes = await request.get("/admin/integrations", {
      headers,
      maxRedirects: 0,
    });
    expect(mainRes.status()).toBe(307);
    expect(mainRes.headers()["location"]).toMatch(
      /\/login\?next=%2Fadmin%2Fintegrations$/
    );
  });
});

test.describe("Admin integrations page (member)", () => {
  test.use({ storageState: STORAGE_STATE.member });

  test("member receives Access Denied instead of integrations UI", async ({
    request,
  }) => {
    const res = await request.get("/admin/integrations", {
      headers: { "x-skip-autologin": "true" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("Access Denied");
    // Rendered SSR HTML must show Forbidden, not the integrations card DOM.
    // TODO(PP-gun8n): tighten to `!html.includes("discord-integration-card")`
    // once AdminIntegrationsPage adds a page-level permission guard so Next.js
    // parallel layout/page execution stops serializing its RSC Flight payload.
    expect(html).not.toContain('data-testid="discord-integration-card"');
  });
});
