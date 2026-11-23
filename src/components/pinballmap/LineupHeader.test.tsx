import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { refreshPinballmapLineupAction } from "~/app/(app)/m/pinballmap-actions";
import { RelativeTimeProvider } from "~/components/issues/RelativeTimeProvider";

import { LineupHeader } from "./LineupHeader";

vi.mock("~/app/(app)/m/pinballmap-actions", () => ({
  refreshPinballmapLineupAction: vi.fn(),
  checkConfirmLineupAction: vi.fn(),
  confirmPinballmapLineupAction: vi.fn(),
}));

const BASE_DATE = new Date("2026-10-01T12:00:00.000Z");

function renderHeader(
  overrides: Partial<React.ComponentProps<typeof LineupHeader>> = {}
): void {
  render(
    <RelativeTimeProvider>
      <LineupHeader
        locationName="Austin Pinball Collective"
        locationUrl="https://pinballmap.com/map/?by_location_id=26454"
        entryCount={3}
        pinballMapUpdated="Oct 1, 2026"
        lastRefreshedAt={BASE_DATE}
        lastRefreshFailed={false}
        refreshRemaining={3}
        refreshAvailableAt={null}
        canConfirm
        {...overrides}
      />
    </RelativeTimeProvider>
  );
}

describe("LineupHeader", () => {
  beforeEach(() => {
    vi.mocked(refreshPinballmapLineupAction).mockReset();
  });

  it("renders venue attribution, counts, timestamps, and Confirm lineup when permitted", () => {
    renderHeader({ entryCount: 1, canConfirm: true });

    const header = screen.getByTestId("pbm-lineup-header");
    const link = within(header).getByRole("link", {
      name: /Austin Pinball Collective/,
    });
    expect(link).toHaveAttribute(
      "href",
      "https://pinballmap.com/map/?by_location_id=26454"
    );
    expect(
      within(header).getByTestId("pbm-lineup-entry-count")
    ).toHaveTextContent("1 entry");
    expect(
      within(header).getByTestId("pbm-lineup-pbm-updated")
    ).toHaveTextContent("Pinball Map last updated Oct 1, 2026");
    expect(header).toHaveTextContent("Refreshed");
    expect(
      within(header).getByTestId("pbm-confirm-lineup")
    ).toBeInTheDocument();
  });

  it("hides Confirm lineup when viewer lacks confirm access or lineup is waiting", () => {
    const { rerender } = render(
      <RelativeTimeProvider>
        <LineupHeader
          locationName="Austin Pinball Collective"
          locationUrl="https://pinballmap.com/map/?by_location_id=26454"
          entryCount={4}
          pinballMapUpdated="Oct 1, 2026"
          lastRefreshedAt={BASE_DATE}
          lastRefreshFailed={false}
          refreshRemaining={3}
          refreshAvailableAt={null}
          canConfirm={false}
        />
      </RelativeTimeProvider>
    );

    expect(screen.getByTestId("pbm-lineup-entry-count")).toHaveTextContent(
      "4 entries"
    );
    expect(screen.queryByTestId("pbm-confirm-lineup")).not.toBeInTheDocument();

    rerender(
      <RelativeTimeProvider>
        <LineupHeader
          locationName={null}
          locationUrl="https://pinballmap.com/map/?by_location_id=26454"
          entryCount={null}
          pinballMapUpdated={null}
          lastRefreshedAt={BASE_DATE}
          lastRefreshFailed
          refreshRemaining={2}
          refreshAvailableAt={null}
          canConfirm
        />
      </RelativeTimeProvider>
    );

    expect(
      screen.queryByTestId("pbm-lineup-entry-count")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("pbm-lineup-header")).toHaveTextContent(
      "Last good refresh"
    );
    expect(screen.queryByTestId("pbm-confirm-lineup")).not.toBeInTheDocument();
  });

  it("surfaces refresh errors inline", async () => {
    const user = userEvent.setup();
    vi.mocked(refreshPinballmapLineupAction).mockResolvedValue({
      ok: false,
      code: "SERVER",
      message: "Pinball Map did not answer.",
    });
    renderHeader();

    await user.click(screen.getByRole("button", { name: /Refresh/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pinball Map did not answer."
    );
  });
});
