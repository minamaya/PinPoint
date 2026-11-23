import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LineupReady } from "~/lib/pinballmap/lineup-comparison";

import { LineupLinkOptionsProvider } from "./LineupRowActions";
import { LineupSections, type LineupViewContext } from "./LineupSections";

vi.mock("~/app/(app)/m/pinballmap-actions", () => ({
  addMachineToPinballMapAction: vi.fn(),
  removeMachineFromPinballMapAction: vi.fn(),
  updateInsiderConnectedAction: vi.fn(),
  removeUnlinkedPinballmapEntryAction: vi.fn(),
  linkUnlinkedPinballmapEntryAction: vi.fn(),
  checkPinballmapRemovalCommentsAction: vi.fn(),
}));

function makeComparison(overrides: Partial<LineupReady> = {}): LineupReady {
  return {
    status: "ready",
    sections: {
      out_of_sync: [],
      pinpoint_only: [],
      pinball_map_only: [],
      availability_conflict: [],
    },
    toReview: 0,
    inSync: [],
    notCompared: {
      uncataloged: [],
      dontSync: 0,
      removed: 0,
    },
    insiderConnected: {
      titles: 0,
      onPinballMap: { on: 0, off: 0, not_set: 0 },
    },
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<LineupViewContext> = {}
): LineupViewContext {
  return {
    writeEnabled: true,
    locationUrl: "https://pinballmap.com/map/?by_location_id=26454",
    pushActor: () => "machine-1",
    canRemoveEntry: () => true,
    canLink: true,
    canCreate: true,
    ...overrides,
  };
}

function renderSections(
  comparison: LineupReady,
  context: LineupViewContext = makeContext()
): void {
  render(
    <LineupLinkOptionsProvider
      options={[
        {
          id: "m-unlinked",
          initials: "UN",
          name: "Unlinked",
          linkedTitle: null,
        },
      ]}
    >
      <LineupSections comparison={comparison} context={context} />
    </LineupLinkOptionsProvider>
  );
}

describe("LineupSections", () => {
  it("renders Nothing to review alongside In sync and Not compared summary when toReview is 0", () => {
    renderSections(
      makeComparison({
        inSync: [
          {
            key: "title-1",
            title: {
              id: 100,
              name: "Godzilla",
              manufacturer: "Stern",
              year: 2021,
            },
            cabinets: [
              {
                id: "m-1",
                initials: "GZ",
                name: "Godzilla (Pro)",
                presenceStatus: "on_the_floor",
                intent: "on",
              },
            ],
            onPinballMap: true,
            commentCount: 2,
          },
        ],
        notCompared: {
          uncataloged: [{ id: "m-c", initials: "HB", name: "Homebrew" }],
          dontSync: 2,
          removed: 1,
        },
      })
    );

    expect(screen.getByTestId("pbm-lineup-clear")).toBeInTheDocument();
    expect(screen.queryByTestId("pbm-lineup-summary")).not.toBeInTheDocument();
    const inSync = screen.getByTestId("pbm-lineup-in-sync");
    expect(within(inSync).getByText(/1 on Pinball Map/)).toBeInTheDocument();
    expect(within(inSync).getByText("Godzilla")).toBeInTheDocument();

    const footer = screen.getByTestId("pbm-lineup-not-compared");
    expect(footer).toHaveTextContent(
      "Not compared: 1 custom game (HB) · 2 set to Don't sync · 1 removed machine"
    );
  });

  it("renders sections in order, hides empty sections, and wires row links and push actions", () => {
    const comparison = makeComparison({
      toReview: 3,
      sections: {
        out_of_sync: [
          {
            section: "out_of_sync",
            key: "to_add-700",
            tag: "to_add",
            title: {
              id: 700,
              name: "Medieval Madness",
              manufacturer: "Williams",
              year: 1997,
            },
            cabinets: [
              {
                id: "machine-1",
                initials: "MM",
                name: "Medieval Madness",
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
              name: "Unlinked Machine",
              presenceStatus: "on_the_floor",
              intent: "on",
            },
          },
        ],
        pinball_map_only: [
          {
            section: "pinball_map_only",
            key: "entry-8800",
            lmxId: 8800,
            title: {
              id: 701,
              name: "Attack from Mars",
              manufacturer: "Bally",
              year: 1995,
            },
            commentCount: 1,
            possibleMatches: [],
          },
        ],
        availability_conflict: [],
      },
    });

    renderSections(comparison);

    expect(screen.getByTestId("pbm-lineup-summary")).toHaveTextContent(
      "3 to review"
    );

    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "Out of sync",
      "In PinPoint, not linked to Pinball Map",
      "On Pinball Map, not linked to a PinPoint machine",
      "In sync",
    ]);
    expect(
      screen.queryByRole("heading", { name: "Availability conflict", level: 3 })
    ).not.toBeInTheDocument();

    const addRow = screen.getByTestId("pbm-lineup-row-to_add-700");
    expect(addRow).toHaveTextContent("Medieval Madness");
    expect(addRow).toHaveTextContent("To add");
    expect(
      within(addRow).getByRole("button", { name: "Add to Pinball Map" })
    ).toBeInTheDocument();

    const pinpointRow = screen.getByTestId("pbm-lineup-row-machine-unlinked");
    expect(
      within(pinpointRow).getByRole("link", { name: "Edit Machine" })
    ).toHaveAttribute("href", "/m/UN/edit");

    const entryRow = screen.getByTestId("pbm-lineup-row-entry-8800");
    expect(entryRow).toHaveTextContent("Attack from Mars");
    expect(
      within(entryRow).getByRole("link", { name: "Create in PinPoint" })
    ).toHaveAttribute("href", "/m/new?title=Attack+from+Mars&pbm=701");
    expect(
      within(entryRow).getByRole("button", { name: "Remove from Pinball Map" })
    ).toBeInTheDocument();
  });

  it("links out to Pinball Map when viewer lacks a linked account and hides Create without permission", () => {
    const comparison = makeComparison({
      toReview: 2,
      sections: {
        out_of_sync: [
          {
            section: "out_of_sync",
            key: "to_add-700",
            tag: "to_add",
            title: {
              id: 700,
              name: "Medieval Madness",
              manufacturer: null,
              year: null,
            },
            cabinets: [
              {
                id: "machine-1",
                initials: "MM",
                name: "Medieval Madness",
                presenceStatus: "on_the_floor",
                intent: "on",
              },
            ],
            commentCount: null,
            icTarget: null,
          },
        ],
        pinpoint_only: [],
        pinball_map_only: [
          {
            section: "pinball_map_only",
            key: "entry-8800",
            lmxId: 8800,
            title: {
              id: 701,
              name: "Attack from Mars",
              manufacturer: null,
              year: null,
            },
            commentCount: 0,
            possibleMatches: [],
          },
        ],
        availability_conflict: [],
      },
    });

    renderSections(
      comparison,
      makeContext({
        writeEnabled: false,
        canRemoveEntry: () => false,
        canLink: false,
        canCreate: false,
      })
    );

    const addRow = screen.getByTestId("pbm-lineup-row-to_add-700");
    expect(
      within(addRow).queryByRole("button", { name: "Add to Pinball Map" })
    ).not.toBeInTheDocument();
    expect(
      within(addRow).getByRole("link", {
        name: "Open Pinball Map to add Medieval Madness",
      })
    ).toHaveAttribute(
      "href",
      "https://pinballmap.com/map/?by_location_id=26454"
    );

    const entryRow = screen.getByTestId("pbm-lineup-row-entry-8800");
    expect(
      within(entryRow).queryByRole("link", { name: "Create in PinPoint" })
    ).not.toBeInTheDocument();
    expect(
      within(entryRow).queryByRole("button", {
        name: "Remove from Pinball Map",
      })
    ).not.toBeInTheDocument();
  });
});
