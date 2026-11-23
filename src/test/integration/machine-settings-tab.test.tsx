// @vitest-environment jsdom
/**
 * Integration Test: the machine's Settings tab RSC boundary (PP-nffph.13)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Verifies role/owner capability
 * props passed from MachineSettingsTab to SettingsTab across signed-out,
 * non-owner member, owner, technician, and admin roles.
 */
import React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getTestDb, setupTestDb } from "~/test/setup/pglite";
import {
  machineSettingsSets,
  machines,
  userProfiles,
} from "~/server/db/schema";
import { createTestMachine, createTestUser } from "~/test/helpers/factories";
import MachineSettingsTab from "~/app/(app)/m/[initials]/(tabs)/settings/page";
import type { SettingsTab as SettingsTabComponent } from "~/components/machines/settings/SettingsTab";

type SettingsTabProps = React.ComponentProps<typeof SettingsTabComponent>;

const mockGetUser = vi.fn();
vi.mock("~/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ auth: { getUser: mockGetUser } }),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers([["host", "localhost:3000"]])),
}));

vi.mock("~/server/db", async () => {
  const { getTestDb } = await import("~/test/setup/pglite");
  return { db: await getTestDb() };
});

const mockSettingsTab = vi.fn<(p: SettingsTabProps) => React.ReactElement>(
  () => <div data-testid="settings-tab" />
);
vi.mock("~/components/machines/settings/SettingsTab", () => ({
  SettingsTab: (p: SettingsTabProps) => mockSettingsTab(p),
}));

const PARAMS = Promise.resolve({ initials: "GZ" });

describe("Machine Settings tab page (PGlite)", () => {
  setupTestDb();

  let machineId: string;
  let ownerId: string;

  async function makeUser(
    role: "guest" | "member" | "technician" | "admin"
  ): Promise<string> {
    const id = randomUUID();
    const db = await getTestDb();
    await db.insert(userProfiles).values(createTestUser({ id, role }));
    return id;
  }

  async function renderAs(userId: string | null): Promise<SettingsTabProps> {
    mockSettingsTab.mockClear();
    mockGetUser.mockResolvedValue({
      data: { user: userId ? { id: userId } : null },
    });
    render(await MachineSettingsTab({ params: PARAMS }));
    const props = mockSettingsTab.mock.calls[0]?.[0];
    if (!props) throw new Error("SettingsTab was not rendered");
    return props;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    ownerId = await makeUser("member");
    machineId = randomUUID();
    const db = await getTestDb();
    await db.insert(machines).values(
      createTestMachine({
        id: machineId,
        initials: "GZ",
        name: "Godzilla",
        ownerId,
      })
    );
    await db.insert(machineSettingsSets).values({
      machineId,
      name: "Community House",
      isCommunity: true,
      createdBy: ownerId,
      updatedBy: ownerId,
    });
  });

  it("renders read-only props for signed-out visitors and non-owner members", async () => {
    const anonProps = await renderAs(null);
    expect(anonProps.canCreate).toBe(false);
    expect(anonProps.canManageTags).toBe(false);
    expect(anonProps.viewerId).toBeNull();
    expect(anonProps.initialSets[0]?.canEdit).toBe(false);

    const otherMemberId = await makeUser("member");
    const nonOwnerProps = await renderAs(otherMemberId);
    expect(nonOwnerProps.canCreate).toBe(false);
    expect(nonOwnerProps.canManageTags).toBe(false);
    expect(nonOwnerProps.viewerId).toBe(otherMemberId);
    expect(nonOwnerProps.initialSets[0]?.canEdit).toBe(false);
  });

  it("grants set creation and edit rights to owner, technician, and admin", async () => {
    const ownerProps = await renderAs(ownerId);
    expect(ownerProps.canCreate).toBe(true);
    expect(ownerProps.canManageTags).toBe(false);
    expect(ownerProps.initialSets[0]?.canEdit).toBe(true);

    const techProps = await renderAs(await makeUser("technician"));
    expect(techProps.canCreate).toBe(true);
    expect(techProps.canManageTags).toBe(true);
    expect(techProps.initialSets[0]?.canEdit).toBe(true);

    const adminProps = await renderAs(await makeUser("admin"));
    expect(adminProps.canCreate).toBe(true);
    expect(adminProps.canManageTags).toBe(true);
    expect(adminProps.initialSets[0]?.canEdit).toBe(true);
  });
});
