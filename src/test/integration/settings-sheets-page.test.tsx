// @vitest-environment jsdom
/**
 * Integration Test: Settings sheets RSC + print route boundaries (PP-nffph.13)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Verifies:
 *   1. TagLayout renders the real TagPageActions with Print settings sheets href
 *      excluding off-floor machines
 *   2. PrintSettingsSheetsPage seeds ?m= initialRun with only on-the-floor machines
 *   3. SettingsSheetPrintPage resolves ?m=&to=tag:...&set= into SettingsSheetDocument
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/c/tags/location/front-room",
  useSearchParams: () => new URLSearchParams(),
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

const originalMatchMedia = Object.getOwnPropertyDescriptor(
  window,
  "matchMedia"
);
const originalPrint = Object.getOwnPropertyDescriptor(window, "print");

describe("Settings sheets pages (PGlite)", () => {
  setupTestDb();

  let afmId: string;
  let smId: string;
  let hdId: string;
  let finalsId: string;

  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    Object.defineProperty(window, "print", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  afterAll(() => {
    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", originalMatchMedia);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
    if (originalPrint) {
      Object.defineProperty(window, "print", originalPrint);
    } else {
      Reflect.deleteProperty(window, "print");
    }
  });

  beforeEach(async () => {
    vi.clearAllMocks();
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

  it("renders real TagPageActions with Print settings sheets href excluding off-floor machines and seeds ?m=", async () => {
    const tagView = render(
      await TagLayout({
        params: Promise.resolve({ type: "location", slug: "front-room" }),
        children: <div />,
      })
    );
    expect(
      screen.getByRole("link", { name: "Print settings sheets" })
    ).toHaveAttribute("href", "/m/settings-sheets?m=AFM");
    tagView.unmount();

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
