// @vitest-environment jsdom
/**
 * Integration Test: Machine Info tab and shared machine layout (PP-nffph.8)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Guards the DB-to-UI wiring replaced
 * from e2e/full/machine-info.spec.ts:
 * - MachineInfoTab derives machineStatus from open issues, passes open-only
 *   issues + report/service links to InfoHero, and gates InfoRail manageHref.
 * - MachineDetailLayout omits MachineArtworkHero when a machine has no catalog
 *   artwork and passes canManage=true to MachineTabStrip for non-owner members.
 */
import type React from "react";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDb, setupTestDb } from "~/test/setup/pglite";
import { pinballmapCatalog } from "~/server/db/schema";
import { seedIssue, seedMachine, seedUser } from "~/test/helpers/seed";
import { signInAs, signOut } from "~/test/helpers/mock-auth";
import type { MachineStatus } from "~/lib/machines/status";
import type * as InfoRailModule from "~/app/(app)/m/[initials]/(tabs)/info-rail";

vi.mock("~/lib/supabase/server", () => import("~/test/helpers/mock-auth"));

class NotFoundError extends Error {}
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new NotFoundError("NEXT_NOT_FOUND");
  }),
  useSelectedLayoutSegment: () => null,
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers([["host", "localhost:3000"]])),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <img alt={alt} src={src} />
  ),
}));

vi.mock("~/components/machines/timeline/MachineRecentActivity", () => ({
  MachineRecentActivity: () => <div data-testid="machine-recent-activity" />,
}));

vi.mock("~/components/tags/MachineTagEditor", () => ({
  MachineTagEditor: () => null,
}));

vi.mock("~/components/machines/TopScoresCard", () => ({
  TopScoresCard: () => null,
}));

vi.mock("~/components/people/PersonHoverCard", () => ({
  PersonHoverCard: ({ displayName }: { displayName: string }) => (
    <span>{displayName}</span>
  ),
}));

const mockInfoRail = vi.fn();
vi.mock("~/app/(app)/m/[initials]/(tabs)/info-rail", async (importOriginal) => {
  const actual = await importOriginal<typeof InfoRailModule>();
  return {
    InfoRail: (props: React.ComponentProps<typeof actual.InfoRail>) => {
      mockInfoRail(props);
      return <actual.InfoRail {...props} />;
    },
  };
});

const mockTabStrip = vi.fn();
vi.mock("~/components/machines/MachineTabStrip", () => ({
  MachineTabStrip: (props: {
    initials: string;
    canManage: boolean;
    canSeeApronCards: boolean;
    maintenance: { openCount: number; status: MachineStatus };
  }) => {
    mockTabStrip(props);
    return <nav data-testid="mock-machine-tab-strip" />;
  },
}));

const { default: MachineInfoTab } =
  await import("~/app/(app)/m/[initials]/(tabs)/page");
const { default: MachineDetailLayout } =
  await import("~/app/(app)/m/[initials]/(tabs)/layout");

describe("MachineInfoTab & MachineDetailLayout (PGlite)", () => {
  setupTestDb();

  beforeEach(() => {
    vi.clearAllMocks();
    signOut();
  });

  it("wires open issues, derived Needs Service status, and Report/Service links into InfoHero", async () => {
    const member = await seedUser({ role: "member" });
    const machine = await seedMachine({ initials: "TAF", name: "Addams" });
    await seedIssue(machine.initials, {
      issueNumber: 1,
      status: "new",
      severity: "major",
      title: "Left flipper weak",
    });
    await seedIssue(machine.initials, {
      issueNumber: 2,
      status: "in_progress",
      severity: "minor",
      title: "Thing box slow",
    });
    await seedIssue(machine.initials, {
      issueNumber: 3,
      status: "fixed",
      severity: "unplayable",
      title: "Closed unplayable",
    });

    signInAs(member.id);

    render(
      await MachineInfoTab({
        params: Promise.resolve({ initials: machine.initials }),
      })
    );

    const hero = screen.getByTestId("machine-info-hero");
    expect(screen.getByTestId("machine-info-hero-status")).toHaveTextContent(
      "Needs Service"
    );
    expect(within(hero).getByText("TAF-01")).toBeInTheDocument();
    expect(within(hero).getByText("TAF-02")).toBeInTheDocument();
    expect(within(hero).queryByText("TAF-03")).not.toBeInTheDocument();
    expect(screen.getByTestId("machine-info-report-link")).toHaveAttribute(
      "href",
      "/report?machine=TAF"
    );
    expect(
      within(hero).getByRole("link", { name: /view all on service/i })
    ).toHaveAttribute("href", "/m/TAF/maintenance");
  });

  it("derives Operational when all open issues are absent and only closed issues exist", async () => {
    const machine = await seedMachine({ initials: "OPR", name: "Operational" });
    await seedIssue(machine.initials, {
      issueNumber: 1,
      status: "fixed",
      severity: "major",
    });

    render(
      await MachineInfoTab({
        params: Promise.resolve({ initials: machine.initials }),
      })
    );

    expect(screen.getByTestId("machine-info-hero-status")).toHaveTextContent(
      "Operational"
    );
    expect(screen.getByText(/this machine is healthy/i)).toBeInTheDocument();
  });

  it("passes Manage href to InfoRail for a non-owner member and omits it for guests", async () => {
    const owner = await seedUser({ role: "admin" });
    const member = await seedUser({ role: "member" });
    const guest = await seedUser({ role: "guest" });
    const machine = await seedMachine({
      initials: "MNG",
      name: "Manage Link Test",
      ownerId: owner.id,
    });

    signInAs(member.id);
    render(
      await MachineInfoTab({
        params: Promise.resolve({ initials: machine.initials }),
      })
    );
    expect(mockInfoRail).toHaveBeenCalledWith(
      expect.objectContaining({
        pinballmap: expect.objectContaining({
          manageHref: "/m/MNG/edit",
        }),
      })
    );

    vi.clearAllMocks();
    signInAs(guest.id);
    render(
      await MachineInfoTab({
        params: Promise.resolve({ initials: machine.initials }),
      })
    );
    expect(mockInfoRail).toHaveBeenCalledWith(
      expect.objectContaining({
        pinballmap: expect.objectContaining({
          manageHref: null,
        }),
      })
    );
  });

  it("renders initials chip with no artwork hero when machine has no catalog artwork", async () => {
    const machine = await seedMachine({
      initials: "NOART",
      name: "No Artwork Pin",
    });

    render(
      await MachineDetailLayout({
        params: Promise.resolve({ initials: machine.initials }),
        children: <div>Tab body</div>,
      })
    );

    expect(
      screen.queryByTestId("machine-artwork-hero")
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Machine initials NOART")).toHaveTextContent(
      "NOART"
    );
  });

  it("renders artwork hero and admits non-owner member to Manage tab in layout", async () => {
    const db = await getTestDb();
    const admin = await seedUser({ role: "admin" });
    const member = await seedUser({ role: "member" });
    await db.insert(pinballmapCatalog).values({
      pinballmapMachineId: 9001,
      name: "Medieval Madness",
      opdbImageUrl: "https://img.opdb.org/mm.jpg",
      opdbImageWidth: 640,
      opdbImageHeight: 444,
    });
    const machine = await seedMachine({
      initials: "ART",
      name: "Medieval Madness",
      ownerId: admin.id,
      pinballmapMachineId: 9001,
    });

    signInAs(member.id);
    render(
      await MachineDetailLayout({
        params: Promise.resolve({ initials: machine.initials }),
        children: <div>Tab body</div>,
      })
    );

    expect(screen.getByTestId("machine-artwork-hero")).toBeInTheDocument();
    expect(mockTabStrip).toHaveBeenCalledWith(
      expect.objectContaining({
        initials: "ART",
        canManage: true,
      })
    );
  });
});
