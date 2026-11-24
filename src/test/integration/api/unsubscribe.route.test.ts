import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getTestDb, setupTestDb } from "~/test/setup/pglite";
import { notificationPreferences, userProfiles } from "~/server/db/schema";
import { createTestUser } from "~/test/helpers/factories";
import { generateUnsubscribeToken } from "~/lib/notifications/unsubscribe-token";
import { GET, POST } from "~/app/api/unsubscribe/route";

vi.mock("~/server/db", async () => {
  const { getTestDb } = await import("~/test/setup/pglite");
  return {
    db: await getTestDb(),
  };
});

function buildGetRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/unsubscribe${query}`, {
    method: "GET",
  });
}

function buildPostRequest(uid?: string, token?: string): NextRequest {
  const body = new URLSearchParams();
  if (uid !== undefined) body.set("uid", uid);
  if (token !== undefined) body.set("token", token);

  return new NextRequest("http://localhost/api/unsubscribe", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

describe("/api/unsubscribe", () => {
  setupTestDb();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("UNSUBSCRIBE_SIGNING_SECRET", "test-unsubscribe-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function seedPreferences(): Promise<{ userId: string }> {
    const db = await getTestDb();
    const userId = crypto.randomUUID();
    await db
      .insert(userProfiles)
      .values(createTestUser({ id: userId }))
      .returning();

    await db.insert(notificationPreferences).values({
      userId,
      emailEnabled: true,
      emailNotifyOnAssigned: true,
      emailNotifyOnStatusChange: true,
      emailNotifyOnNewComment: true,
      emailNotifyOnNewIssue: true,
      emailWatchNewIssuesGlobal: true,
      emailNotifyOnPinballMapComment: true,
    });

    return { userId };
  }

  async function assertPreferencesUnmutated(userId: string): Promise<void> {
    const db = await getTestDb();
    const row = await db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.userId, userId),
    });
    expect(row).toBeDefined();
    expect(row?.emailEnabled).toBe(true);
    expect(row?.emailNotifyOnAssigned).toBe(true);
    expect(row?.emailNotifyOnStatusChange).toBe(true);
    expect(row?.emailNotifyOnNewComment).toBe(true);
    expect(row?.emailNotifyOnNewIssue).toBe(true);
    expect(row?.emailWatchNewIssuesGlobal).toBe(true);
    expect(row?.emailNotifyOnPinballMapComment).toBe(true);
  }

  it("GET returns 400 when uid or token is missing and does not mutate", async () => {
    const { userId } = await seedPreferences();
    const response = GET(buildGetRequest(""));
    const html = await response.text();

    expect(response.status).toBe(400);
    expect(html).toContain("Invalid unsubscribe link.");
    await assertPreferencesUnmutated(userId);
  });

  it("GET returns 403 when token verification fails and does not mutate", async () => {
    const { userId } = await seedPreferences();

    const response = GET(buildGetRequest(`?uid=${userId}&token=bad`));
    const html = await response.text();

    expect(response.status).toBe(403);
    expect(html).toContain("Invalid or expired unsubscribe link.");
    await assertPreferencesUnmutated(userId);
  });

  it("GET returns confirmation page and does not mutate preferences", async () => {
    const { userId } = await seedPreferences();
    const token = generateUnsubscribeToken(userId);
    const response = GET(buildGetRequest(`?uid=${userId}&token=${token}`));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Confirm unsubscribe");
    expect(html).toContain('<form method="post" action="/api/unsubscribe">');
    expect(html).toContain(
      `<input type="hidden" name="uid" value="${userId}" />`
    );
    expect(html).toContain(
      `<input type="hidden" name="token" value="${token}" />`
    );
    await assertPreferencesUnmutated(userId);
  });

  it("POST returns 400 when uid or token is missing and does not mutate", async () => {
    const { userId } = await seedPreferences();
    const response = await POST(buildPostRequest(userId));
    const html = await response.text();

    expect(response.status).toBe(400);
    expect(html).toContain("Invalid unsubscribe request.");
    await assertPreferencesUnmutated(userId);
  });

  it("POST returns 403 when token verification fails and does not mutate", async () => {
    const { userId } = await seedPreferences();

    const response = await POST(buildPostRequest(userId, "bad-token"));
    const html = await response.text();

    expect(response.status).toBe(403);
    expect(html).toContain("Invalid or expired unsubscribe link.");
    await assertPreferencesUnmutated(userId);
  });

  it("POST returns 404 when user preferences are missing", async () => {
    const missingUserId = crypto.randomUUID();
    const token = generateUnsubscribeToken(missingUserId);
    const response = await POST(buildPostRequest(missingUserId, token));
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(html).toContain("User not found.");
  });

  it("POST unsubscribes user from all email notifications", async () => {
    const { userId } = await seedPreferences();
    const token = generateUnsubscribeToken(userId);

    const response = await POST(buildPostRequest(userId, token));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      "You have been unsubscribed from all PinPoint email notifications."
    );

    const db = await getTestDb();
    const updated = await db.query.notificationPreferences.findFirst({
      where: eq(notificationPreferences.userId, userId),
    });

    expect(updated).toBeDefined();
    expect(updated?.emailEnabled).toBe(false);
    expect(updated?.emailNotifyOnAssigned).toBe(false);
    expect(updated?.emailNotifyOnStatusChange).toBe(false);
    expect(updated?.emailNotifyOnNewComment).toBe(false);
    expect(updated?.emailNotifyOnNewIssue).toBe(false);
    expect(updated?.emailWatchNewIssuesGlobal).toBe(false);
    expect(updated?.emailNotifyOnPinballMapComment).toBe(false);
  });
});
