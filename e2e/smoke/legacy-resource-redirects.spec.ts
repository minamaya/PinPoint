/**
 * Smoke: legacy id-addressed links redirect to the canonical routes.
 *
 * Coverage goal: D-class — `/issues/<uuid>` and `/machines/<uuid>` were the URL
 * shapes Discord notifications shipped until PP-gzq2, and neither was ever a
 * route. Discord DMs can't be edited, so those links live forever and the app
 * has to resolve them. Playwright `{ request }` exercises live Next.js routing
 * and Server Component `redirect()` / `notFound()` without browser startups.
 */
import { test, expect } from "@playwright/test";
import { seededIssue, seededMachines } from "../support/constants.js";

test.describe("Legacy resource-id redirects", () => {
  const headers = { "x-skip-autologin": "true" };

  test("/issues/<uuid> and /machines/<uuid> redirect to canonical routes", async ({
    request,
  }) => {
    const issue = seededIssue("HD");
    const issueRes = await request.get(`/issues/${issue.id}`, {
      headers,
      maxRedirects: 0,
    });
    expect(issueRes.status()).toBe(307);
    const issueLocation = issueRes.headers()["location"] ?? "";
    expect(issueLocation).toMatch(new RegExp(`/m/HD/i/${issue.num}$`));

    const issueTarget = await request.get(issueLocation, { headers });
    expect(issueTarget.status()).toBe(200);
    expect(await issueTarget.text()).toContain(issue.title);

    const machine = seededMachines.humptyDumpty;
    const machineRes = await request.get(`/machines/${machine.id}`, {
      headers,
      maxRedirects: 0,
    });
    expect(machineRes.status()).toBe(307);
    const machineLocation = machineRes.headers()["location"] ?? "";
    expect(machineLocation).toMatch(new RegExp(`/m/${machine.initials}$`));

    const machineTarget = await request.get(machineLocation, { headers });
    expect(machineTarget.status()).toBe(200);
    expect(await machineTarget.text()).toContain(machine.name);
  });

  // A non-UUID segment reaches a `uuid` column, where Postgres raises 22P02
  // instead of returning no rows — so without a shape check these 500 through
  // the error boundary and report to Sentry. Crawlers and truncated pastes hit
  // this far more often than a well-formed but unknown id.
  test("unknown UUIDs and non-UUID segments 404 instead of erroring", async ({
    request,
  }) => {
    for (const path of [
      "/issues/00000000-0000-4000-8000-999999999999",
      "/machines/00000000-0000-4000-8000-999999999999",
      "/issues/not-a-uuid",
      "/issues/robots.txt",
      "/machines/not-a-uuid",
    ]) {
      const response = await request.get(path, { headers, maxRedirects: 0 });
      expect(response.status(), `expected 404 for ${path}`).toBe(404);
    }
  });
});
