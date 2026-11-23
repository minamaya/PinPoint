// @vitest-environment jsdom
/**
 * Integration Test: Settings sheets RSC + print route boundaries (PP-nffph.13)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Verifies:
 *   1. TagLayout computes settingsSheetsHref excluding off-floor machines
 *   2. PrintSettingsSheetsPage seeds ?m= initialRun with only on-the-floor machines
 *   3. SettingsSheetPrintPage resolves ?m=&to=tag:...&set= into SettingsSheetDocument
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getTestDb, setupTestDb } from "~/test/setup/pglite";
import {
  machines,
  machineSettingsSetTags,
  machineSettingsSets,
  machineTags,
  settingsTags,
  tags,
  tagTypes,
  userProfiles,
} from "~/server/db/schema";
import { createTestMachine, createTestUser } from "~/test/helpers/factories";
import PrintSettingsSheetsPage from "~/app/(app)/m/settings-sheets/page";
import SettingsSheetPrintPage from "~/app/(print)/m/settings-sheets/print/page";
import TagLayout from "~/app/(app)/c/tags/[type]/[slug]/(tabs)/layout";
import type { SettingsSheetsBuilder as BuilderComponent } from "~/components/machines/settings/SettingsSheetsBuilder";

type BuilderProps = React.ComponentProps<typeof BuilderComponent>;

vi.mock("~/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    }),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers([["host", "localhost:3000"]])),
}));

vi.mock("~/server/db", async () => {
  const { getTestDb } = await import("~/test/setup/pglite");
  return { db: await getTestDb() };
});

const mockBuilder = vi.fn<(p: BuilderProps) => React.ReactElement>(() => (
  <div data-testid="settings-sheets-builder" />
));
vi.mock("~/components/machines/settings/SettingsSheetsBuilder", () => ({
  SettingsSheetsBuilder: (p: BuilderProps) => mockBuilder(p),
}));

const mockTagPageActions = vi.fn<
  (p: { settingsSheetsHref?: string }) => React.ReactElement
>(() => <div data-testid="tag-page-actions" />);
vi.mock("~/components/tags/TagPageActions", () => ({
  TagPageActions: (p: { settingsSheetsHref?: string }) => mockTagPageActions(p),
}));

vi.mock("~/components/collections/MachineGroupShell", () => ({
  MachineGroupShell: ({
    actions,
    children,
  }: {
    actions: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      {actions}
      {children}
    </div>
  ),
}));

vi.mock("~/components/list-view", () => ({
  PageExportProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe("Settings sheets pages (PGlite)", () => {
  setupTestDb();

  let afmId: string;
  let smId: string;
  let hdId: string;
  let finalsId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    window.print = vi.fn();
    const db = await getTestDb();
    const userId = randomUUID();
    await db.insert(userProfiles).values(createTestUser({ id: userId }));

    afmId = randomUUID();
    smId = randomUUID();
    hdId = randomUUID();
    await db.insert(machines).values([
      createTestMachine({
        id: afmId,
        initials: "AFM",
        name: "Attack from Mars",
        presenceStatus: "on_the_floor",
      }),
      createTestMachine({
        id: smId,
        initials: "SM",
        name: "Spider-Man",
        presenceStatus: "on_loan",
      }),
      createTestMachine({
        id: hdId,
        initials: "HD",
        name: "Humpty Dumpty",
        presenceStatus: "on_the_floor",
      }),
    ]);

    const [locType] = await db
      .insert(tagTypes)
      .values({ name: "Location", slug: "location", exclusive: true })
      .returning({ id: tagTypes.id });
    if (!locType) throw new Error("Failed to seed tagType");

    const [locTag] = await db
      .insert(tags)
      .values({
        name: "Front room",
        slug: "front-room",
        tagTypeId: locType.id,
        typeExclusive: true,
      })
      .returning({ id: tags.id });
    if (!locTag) throw new Error("Failed to seed tag");

    await db.insert(machineTags).values([
      { machineId: afmId, tagId: locTag.id },
      { machineId: smId, tagId: locTag.id },
    ]);

    const [batCityTag] = await db
      .insert(settingsTags)
      .values({ name: "Bat City 2025", slug: "bat-city-2025" })
      .returning({ id: settingsTags.id });
    if (!batCityTag) throw new Error("Failed to seed settingsTag");

    const houseId = randomUUID();
    finalsId = randomUUID();
    const qualsId = randomUUID();

    await db.insert(machineSettingsSets).values([
      {
        id: houseId,
        machineId: hdId,
        name: "House rules",
        isPreferredHouse: true,
        isCommunity: true,
        createdBy: userId,
        updatedBy: userId,
        sections: [
          {
            id: "s-house",
            kind: "software",
            baseline: "Factory Default",
            rows: [{ _key: "r1", id: "1-ball", name: "Balls", value: "3" }],
          },
        ],
      },
      {
        id: finalsId,
        machineId: hdId,
        name: "Bat City finals",
        createdBy: userId,
        updatedBy: userId,
        sections: [
          {
            id: "s-finals",
            kind: "software",
            baseline: "Factory Default",
            rows: [{ _key: "r2", id: "1-ball", name: "Balls", value: "5" }],
          },
        ],
      },
      {
        id: qualsId,
        machineId: hdId,
        name: "Bat City quals",
        createdBy: userId,
        updatedBy: userId,
        sections: [
          {
            id: "s-quals",
            kind: "software",
            baseline: "Factory Default",
            rows: [{ _key: "r3", id: "1-ball", name: "Balls", value: "3" }],
          },
        ],
      },
    ]);

    await db.insert(machineSettingsSetTags).values([
      { setId: finalsId, tagId: batCityTag.id },
      { setId: qualsId, tagId: batCityTag.id },
    ]);
  });

  it("excludes off-floor machines in TagLayout settingsSheetsHref and ?m= PrintSettingsSheetsPage initialRun", async () => {
    render(
      await TagLayout({
        params: Promise.resolve({ type: "location", slug: "front-room" }),
        children: <div />,
      })
    );
    const tagProps = mockTagPageActions.mock.calls[0]?.[0];
    expect(tagProps?.settingsSheetsHref).toBe("/m/settings-sheets?m=AFM");

    render(
      await PrintSettingsSheetsPage({
        searchParams: Promise.resolve({ m: "AFM,SM" }),
      })
    );
    const builderProps = mockBuilder.mock.calls[0]?.[0];
    expect(builderProps?.initialRun?.rows.map((r) => r.machineId)).toEqual([
      afmId,
    ]);
    expect(builderProps?.initialMachines.map((m) => m.id)).toEqual([afmId]);
  });

  it("renders SettingsSheetPrintPage comparison from URL defaults and chosen set", async () => {
    render(
      await SettingsSheetPrintPage({
        searchParams: Promise.resolve({
          m: "HD",
          to: "tag:bat-city-2025",
          set: `HD~~${finalsId}`,
        }),
      })
    );

    expect(
      screen.getByText(/Default House to Tag: Bat City 2025/)
    ).toBeInTheDocument();
    expect(screen.getByText("1-ball")).toBeInTheDocument();
  });
});
