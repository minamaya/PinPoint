import { expect, test } from "@playwright/test";
import { STORAGE_STATE } from "../support/auth-state.js";

const headers = { "x-skip-autologin": "true" };

test.describe("Admin Help Page", () => {
  test("anonymous visitors do not see Admin Help and /help/admin redirects to login", async ({
    request,
  }) => {
    const helpRes = await request.get("/help", { headers, maxRedirects: 0 });
    expect(helpRes.status()).toBe(200);
    const helpHtml = await helpRes.text();
    expect(helpHtml).not.toContain('href="/help/admin"');

    const adminHelpRes = await request.get("/help/admin", {
      headers,
      maxRedirects: 0,
    });
    expect(adminHelpRes.status()).toBe(307);
    expect(adminHelpRes.headers()["location"]).toMatch(/\/login$/);
  });

  test.describe("as member", () => {
    test.use({ storageState: STORAGE_STATE.member });

    test("member does not see Admin Help link and gets 403 UI on /help/admin", async ({
      request,
    }) => {
      const helpRes = await request.get("/help", { headers, maxRedirects: 0 });
      expect(helpRes.status()).toBe(200);
      const helpHtml = await helpRes.text();
      expect(helpHtml).not.toContain('href="/help/admin"');

      const adminHelpRes = await request.get("/help/admin", {
        headers,
        maxRedirects: 0,
      });
      expect(adminHelpRes.status()).toBe(200);
      const adminHelpHtml = await adminHelpRes.text();
      expect(adminHelpHtml).toContain("Access Denied");
      expect(adminHelpHtml).not.toContain("Username-Only Accounts");
    });
  });

  test.describe("as admin", () => {
    test.use({ storageState: STORAGE_STATE.admin });

    test("admin sees Admin Help link on /help and renders /help/admin", async ({
      request,
    }) => {
      const helpRes = await request.get("/help", { headers, maxRedirects: 0 });
      expect(helpRes.status()).toBe(200);
      const helpHtml = await helpRes.text();
      expect(helpHtml).toContain('href="/help/admin"');
      expect(helpHtml).toContain("Admin Help");

      const adminHelpRes = await request.get("/help/admin", {
        headers,
        maxRedirects: 0,
      });
      expect(adminHelpRes.status()).toBe(200);
      const adminHelpHtml = await adminHelpRes.text();
      expect(adminHelpHtml).toContain("Admin Help");
      expect(adminHelpHtml).toContain("Username-Only Accounts");
    });
  });
});
