import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getMachineForLayout,
  type MachineForLayout,
} from "~/app/(app)/m/[initials]/_data";
import { setInsiderConnectedIntentAction } from "~/app/(app)/m/pinballmap-actions";
import { RelativeTimeProvider } from "~/components/issues/RelativeTimeProvider";
import { getViewer } from "~/lib/auth/viewer";
import { listSurfacingAbandonedForMachine } from "~/lib/pinballmap/abandoned-listings";
import { getCatalogEntry } from "~/lib/pinballmap/catalog";
import { getSameTitleMachines } from "~/lib/pinballmap/same-title";
import {
  getPinballMapState,
  getRefreshAllowance,
} from "~/lib/pinballmap/state";
import { getPinballMapLinkStatus } from "~/lib/pinballmap/user-credentials";
import type { PinballmapRuntimeState } from "~/lib/types";
import { getUnifiedUsers } from "~/lib/users/queries";

import MachineEditPage from "./page";

const { redirectMock, notFoundMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/m/GZ/edit",
}));

vi.mock("~/lib/auth/viewer", () => ({
  getViewer: vi.fn(),
}));

vi.mock("~/app/(app)/m/[initials]/_data", () => ({
  getMachineForLayout: vi.fn(),
}));

vi.mock("~/lib/pinballmap/state", () => ({
  getPinballMapState: vi.fn(),
  getRefreshAllowance: vi.fn(),
}));

vi.mock("~/lib/pinballmap/catalog", () => ({
  getCatalogEntry: vi.fn(),
}));

vi.mock("~/lib/pinballmap/user-credentials", () => ({
  getPinballMapLinkStatus: vi.fn(),
}));

vi.mock("~/lib/pinballmap/abandoned-listings", () => ({
  listSurfacingAbandonedForMachine: vi.fn(),
}));

vi.mock("~/lib/pinballmap/same-title", () => ({
  getSameTitleMachines: vi.fn(),
}));

vi.mock("~/lib/users/queries", () => ({
  getUnifiedUsers: vi.fn(),
}));

vi.mock("~/app/(app)/m/pinballmap-actions", () => ({
  addMachineToPinballMapAction: vi.fn(),
  checkRemovalCommentsAction: vi.fn(),
  refreshPinballmapLineupAction: vi.fn(),
  removeMachineFromPinballMapAction: vi.fn(),
  setInsiderConnectedIntentAction: vi.fn(),
  setPinballmapIntentAction: vi.fn(),
  updateInsiderConnectedAction: vi.fn(),
}));

vi.mock("./machine-details-form", () => ({
  MachineDetailsForm: ({ pinballmap }: { pinballmap?: React.ReactNode }) => (
    <div data-testid="mock-machine-details-form">{pinballmap}</div>
  ),
}));

vi.mock("./machine-owner-transfer", () => ({
  MachineOwnerTransfer: () => <div data-testid="mock-machine-owner-transfer" />,
}));

vi.mock("~/components/machines/PinballmapAbandonedEntries", () => ({
  PinballmapAbandonedEntries: () => null,
}));

class NoopIntersectionObserver {
  observe(): void {}
  disconnect(): void {}
}

function makeMachine(
  overrides: Partial<MachineForLayout> = {}
): MachineForLayout {
  const now = new Date("2026-10-01T12:00:00.000Z");
  return {
    id: "machine-gz",
    initials: "GZ",
    nextIssueNumber: 1,
    name: "Godzilla (Pro)",
    ownerId: null,
    invitedOwnerId: null,
    createdAt: now,
    updatedAt: now,
    description: null,
    ownerRequirements: null,
    settingsRequests: null,
    settingsInstructions: null,
    presenceStatus: "on_the_floor",
    pinballmapMachineId: 910,
    pinballmapExcluded: false,
    pinballmapExcludedReason: null,
    pinballmapIntent: "on",
    pinballmapIcIntent: null,
    modelName: null,
    manufacturer: null,
    year: null,
    type: null,
    display: null,
    playerCount: null,
    designers: null,
    artists: null,
    programmers: null,
    opdbId: null,
    ipdbId: null,
    iscoredGameId: null,
    issues: [],
    owner: null,
    invitedOwner: null,
    watchers: [],
    pinballmapTitle: {
      name: "Godzilla (Pro)",
      machineGroupId: 90,
      groupName: "Godzilla",
      manufacturer: "Stern",
      opdbId: null,
      opdbImageUrl: null,
      opdbImageWidth: null,
      opdbImageHeight: null,
      icEligible: true,
    },
    artwork: null,
    modelTitle: "Godzilla (Pro)",
    currentManufacturer: "Stern",
    ...overrides,
  };
}

function makeRuntimeState(): PinballmapRuntimeState {
  const now = new Date("2026-10-01T12:00:00.000Z");
  return {
    id: "singleton",
    locationId: 26454,
    configurationGeneration: 1,
    mutationLeaseId: null,
    mutationLeaseExpiresAt: null,
    snapshotJson: {
      locationId: 26454,
      name: "Austin Pinball Collective",
      dateLastUpdated: "2026-10-01",
      lastUpdatedByUsername: null,
      machineCount: 1,
      fetchedAtIso: "2026-10-01T12:00:00.000Z",
      raw: {},
      lmxes: [
        {
          id: 810,
          machineId: 910,
          icEnabled: true,
          lastUpdatedByUsername: null,
          conditions: [],
        },
      ],
    },
    snapshotRevision: 1,
    lastSyncedAt: now,
    lastSyncAttemptAt: now,
    lastSyncStatus: "ok",
    lastSyncError: null,
    refreshTokens: 3,
    refreshTokensAt: now,
    regionAlertRegion: "austin",
    regionAlertChannelId: null,
    regionAlertStatus: "not_configured",
    regionAlertLastPostAt: null,
    regionAlertLastStatusDetail: null,
    updatedAt: now,
    updatedBy: null,
  };
}

function setupMachine(overrides: Partial<MachineForLayout> = {}): void {
  const machine = makeMachine(overrides);
  vi.mocked(getMachineForLayout).mockResolvedValue({
    machine,
    totalIssuesCount: 0,
  });
  vi.mocked(getSameTitleMachines).mockResolvedValue([
    {
      id: machine.id,
      initials: machine.initials,
      name: machine.name,
      intent: machine.pinballmapIntent,
      icIntent: machine.pinballmapIcIntent,
    },
  ]);
}

async function renderEditPage(): Promise<void> {
  const jsx = await MachineEditPage({
    params: Promise.resolve({ initials: "GZ" }),
    searchParams: Promise.resolve({}),
  });
  render(<RelativeTimeProvider>{jsx}</RelativeTimeProvider>);
}

describe("MachineEditPage Pinball Map Insider Connected wiring", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
    redirectMock.mockClear();
    notFoundMock.mockClear();
    vi.mocked(setInsiderConnectedIntentAction).mockReset();
    vi.mocked(setInsiderConnectedIntentAction).mockResolvedValue({
      ok: true,
      value: { icIntent: "off" },
    });
    vi.mocked(getViewer).mockResolvedValue({
      userId: "tech-1",
      role: "technician",
      profile: null,
    });
    vi.mocked(getPinballMapState).mockResolvedValue(makeRuntimeState());
    vi.mocked(getRefreshAllowance).mockResolvedValue({
      remaining: 3,
      nextRefillAt: null,
    });
    vi.mocked(getCatalogEntry).mockResolvedValue(null);
    vi.mocked(getPinballMapLinkStatus).mockResolvedValue({
      status: "not_linked",
    });
    vi.mocked(listSurfacingAbandonedForMachine).mockResolvedValue([]);
    vi.mocked(getSameTitleMachines).mockResolvedValue([]);
    vi.mocked(getUnifiedUsers).mockResolvedValue([]);
  });

  it("redirects unauthorized viewers back to /m/[initials]", async () => {
    vi.mocked(getViewer).mockResolvedValue({
      userId: "guest-1",
      role: "guest",
      profile: null,
    });
    setupMachine();

    await expect(renderEditPage()).rejects.toThrow("NEXT_REDIRECT:/m/GZ");
    expect(redirectMock).toHaveBeenCalledWith("/m/GZ");
  });

  it("shows Insider Connected toggle for an icEligible title, submits Off intent, and renders Out of sync when intent differs", async () => {
    const user = userEvent.setup();
    setupMachine({ pinballmapIcIntent: null });

    await renderEditPage();

    expect(screen.getByTestId("pbm-listing-control")).toBeInTheDocument();
    const toggle = screen.getByRole("radiogroup", {
      name: "Insider Connected",
    });
    expect(
      within(toggle).getByRole("radio", { name: "Don't sync" })
    ).toBeChecked();
    expect(
      screen.getByTestId("pbm-insider-connected-observed")
    ).toHaveTextContent("Pinball Map: On");
    expect(
      screen.queryByTestId("pbm-listing-out-of-sync")
    ).not.toBeInTheDocument();

    await user.click(within(toggle).getByRole("radio", { name: "Off" }));
    await waitFor(() => {
      expect(setInsiderConnectedIntentAction).toHaveBeenCalledTimes(1);
    });
    const formData = vi.mocked(setInsiderConnectedIntentAction).mock
      .calls[0]?.[1];
    expect(formData?.get("machineId")).toBe("machine-gz");
    expect(formData?.get("icIntent")).toBe("off");
  });

  it("derives Out of sync on reload when pinballmapIcIntent differs from Pinball Map", async () => {
    setupMachine({ pinballmapIcIntent: "off" });

    await renderEditPage();

    const toggle = screen.getByRole("radiogroup", {
      name: "Insider Connected",
    });
    expect(within(toggle).getByRole("radio", { name: "Off" })).toBeChecked();
    expect(screen.getByTestId("pbm-listing-out-of-sync")).toBeInTheDocument();
  });

  it("hides Insider Connected toggle when pinballmapTitle.icEligible is false", async () => {
    const base = makeMachine();
    if (!base.pinballmapTitle) throw new Error("expected title");
    setupMachine({
      pinballmapTitle: { ...base.pinballmapTitle, icEligible: false },
    });

    await renderEditPage();

    expect(screen.getByTestId("pbm-listing-control")).toBeInTheDocument();
    expect(
      screen.queryByTestId("pbm-insider-connected")
    ).not.toBeInTheDocument();
  });
});
