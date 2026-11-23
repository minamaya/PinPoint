import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RelativeTimeProvider } from "~/components/issues/RelativeTimeProvider";
import { getViewer } from "~/lib/auth/viewer";
import { loadLineupData, type LineupData } from "~/lib/pinballmap/lineup-data";
import { getRefreshAllowance } from "~/lib/pinballmap/state";
import { getPinballMapLinkStatus } from "~/lib/pinballmap/user-credentials";
import type { PinballmapRuntimeState } from "~/lib/types";

import PinBallMapLineupPage from "./page";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/m/pinball-map",
}));

vi.mock("~/lib/auth/viewer", () => ({
  getViewer: vi.fn(),
}));

vi.mock("~/lib/pinballmap/lineup-data", () => ({
  loadLineupData: vi.fn(),
}));

vi.mock("~/lib/pinballmap/state", () => ({
  getRefreshAllowance: vi.fn(),
}));

vi.mock("~/lib/pinballmap/user-credentials", () => ({
  getPinballMapLinkStatus: vi.fn(),
}));

vi.mock("~/app/(app)/m/pinballmap-actions", () => ({
  refreshPinballmapLineupAction: vi.fn(),
  checkConfirmLineupAction: vi.fn(),
  confirmPinballmapLineupAction: vi.fn(),
  addMachineToPinballMapAction: vi.fn(),
  removeMachineFromPinballMapAction: vi.fn(),
  updateInsiderConnectedAction: vi.fn(),
  removeUnlinkedPinballmapEntryAction: vi.fn(),
  linkUnlinkedPinballmapEntryAction: vi.fn(),
  checkPinballmapRemovalCommentsAction: vi.fn(),
}));

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
          id: 8200,
          machineId: 9201,
          icEnabled: null,
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

function makeLineupData(): LineupData {
  return {
    state: makeRuntimeState(),
    comparison: {
      status: "ready",
      sections: {
        out_of_sync: [
          {
            section: "out_of_sync",
            key: "to_add-9200",
            tag: "to_add",
            title: {
              id: 9200,
              name: "Lineup Add Game",
              manufacturer: null,
              year: null,
            },
            cabinets: [
              {
                id: "m-add",
                initials: "AD",
                name: "Lineup Add Game",
                presenceStatus: "on_the_floor",
                intent: "on",
              },
            ],
            commentCount: null,
            icTarget: null,
          },
        ],
        pinpoint_only: [
          {
            section: "pinpoint_only",
            key: "machine-unlinked",
            machine: {
              id: "machine-unlinked",
              initials: "UN",
              name: "Unlinked Cabinet",
              presenceStatus: "on_the_floor",
              intent: "on",
            },
          },
        ],
        pinball_map_only: [
          {
            section: "pinball_map_only",
            key: "entry-8200",
            lmxId: 8200,
            title: {
              id: 9201,
              name: "Lineup Entry Game",
              manufacturer: null,
              year: null,
            },
            commentCount: 0,
            possibleMatches: [],
          },
        ],
        availability_conflict: [],
      },
      toReview: 3,
      inSync: [],
      notCompared: { uncataloged: [], dontSync: 0, removed: 0 },
      insiderConnected: {
        titles: 0,
        onPinballMap: { on: 0, off: 0, not_set: 0 },
      },
    },
    machines: [
      {
        id: "machine-unlinked",
        initials: "UN",
        name: "Unlinked Cabinet",
        presenceStatus: "on_the_floor",
        pinballmapMachineId: null,
        pinballmapExcluded: false,
        intent: "on",
        icIntent: null,
        ownerId: null,
      },
    ],
    catalog: [],
    abandoned: [],
  };
}

async function renderLineupPage(): Promise<void> {
  const jsx = await PinBallMapLineupPage();
  render(<RelativeTimeProvider>{jsx}</RelativeTimeProvider>);
}

describe("PinBallMapLineupPage", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    vi.mocked(loadLineupData).mockResolvedValue(makeLineupData());
    vi.mocked(getRefreshAllowance).mockResolvedValue({
      remaining: 3,
      nextRefillAt: null,
    });
    vi.mocked(getPinballMapLinkStatus).mockResolvedValue({
      status: "not_linked",
    });
  });

  it("redirects anonymous visitors to login with ?next=/m/pinball-map", async () => {
    vi.mocked(getViewer).mockResolvedValue({
      userId: undefined,
      role: null,
      profile: null,
    });

    await expect(renderLineupPage()).rejects.toThrow(
      "NEXT_REDIRECT:/login?next=%2Fm%2Fpinball-map"
    );
    expect(redirectMock).toHaveBeenCalledWith("/login?next=%2Fm%2Fpinball-map");
  });

  it("renders Forbidden for guests", async () => {
    vi.mocked(getViewer).mockResolvedValue({
      userId: "guest-1",
      role: "guest",
      profile: null,
    });

    await renderLineupPage();

    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    expect(screen.queryByTestId("pbm-lineup-header")).not.toBeInTheDocument();
  });

  it("renders lineup header and sections without Confirm lineup for members", async () => {
    vi.mocked(getViewer).mockResolvedValue({
      userId: "member-1",
      role: "member",
      profile: null,
    });
    vi.mocked(getPinballMapLinkStatus).mockResolvedValue({
      status: "linked",
      username: "member-pbm",
    });

    await renderLineupPage();

    expect(
      screen.getByRole("heading", { name: "Pinball Map lineup" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("pbm-lineup-header")).toBeInTheDocument();
    expect(screen.queryByTestId("pbm-confirm-lineup")).not.toBeInTheDocument();
    expect(screen.getByTestId("pbm-lineup-summary")).toHaveTextContent(
      "3 to review"
    );
    expect(
      within(screen.getByTestId("pbm-lineup-row-machine-unlinked")).getByRole(
        "link",
        { name: "Edit Machine" }
      )
    ).toHaveAttribute("href", "/m/UN/edit");
    expect(
      within(screen.getByTestId("pbm-lineup-row-entry-8200")).queryByRole(
        "link",
        { name: "Create in PinPoint" }
      )
    ).not.toBeInTheDocument();
  });

  it("renders Confirm lineup, Create in PinPoint, and push buttons for linked admins", async () => {
    vi.mocked(getViewer).mockResolvedValue({
      userId: "admin-1",
      role: "admin",
      profile: null,
    });
    vi.mocked(getPinballMapLinkStatus).mockResolvedValue({
      status: "linked",
      username: "admin-pbm",
    });

    await renderLineupPage();

    expect(screen.getByTestId("pbm-confirm-lineup")).toBeInTheDocument();
    const addRow = screen.getByTestId("pbm-lineup-row-to_add-9200");
    expect(
      within(addRow).getByRole("button", { name: "Add to Pinball Map" })
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("pbm-lineup-row-entry-8200")).getByRole(
        "link",
        { name: "Create in PinPoint" }
      )
    ).toHaveAttribute("href", "/m/new?title=Lineup+Entry+Game&pbm=9201");
  });
});
