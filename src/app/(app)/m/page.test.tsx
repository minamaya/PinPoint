import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getQueuedApronCardIds } from "~/app/(app)/m/apron-cards/_data";
import { getViewer } from "~/lib/auth/viewer";
import { loadMachineView } from "~/lib/machines/view/queries";
import { loadMachineViewSavedViews } from "~/lib/machines/view/saved-views";
import { parseMachineViewState } from "~/lib/machines/view/state";
import type { MachineViewResult } from "~/lib/types";

import MachinesPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/m",
}));

vi.mock("~/lib/auth/viewer", () => ({
  getViewer: vi.fn(),
}));

vi.mock("~/lib/machines/view/queries", () => ({
  loadMachineView: vi.fn(),
}));

vi.mock("~/lib/machines/view/saved-views", () => ({
  loadMachineViewSavedViews: vi.fn(),
}));

vi.mock("~/app/(app)/m/apron-cards/_data", () => ({
  getQueuedApronCardIds: vi.fn(),
}));

vi.mock("~/components/machines/view", () => ({
  MachineView: ({ actions }: { actions?: React.ReactNode }) => (
    <div data-testid="mock-machine-view">{actions}</div>
  ),
}));

function makeViewResult(): MachineViewResult {
  return {
    rows: [],
    scopeCount: 0,
    totalCount: 0,
    summary: {
      presence: {
        byPresence: {
          on_the_floor: 0,
          off_the_floor: 0,
          on_loan: 0,
          pending_arrival: 0,
        },
      },
      playability: {
        byStatus: { operational: 0, needs_service: 0, unplayable: 0 },
      },
    },
    state: parseMachineViewState(new URLSearchParams(), "machines"),
    ownerOptions: [],
    permittedFields: [],
    offersMe: false,
    signedIn: true,
  };
}

describe("MachinesPage Pinball Map lineup action visibility", () => {
  beforeEach(() => {
    vi.mocked(loadMachineViewSavedViews).mockResolvedValue({
      savedViews: {
        canSave: false,
        offersDefault: true,
        builtInViews: [],
        views: [],
        defaultViewId: null,
        activeViewId: null,
      },
      redirectTo: null,
    });
    vi.mocked(loadMachineView).mockResolvedValue(makeViewResult());
    vi.mocked(getQueuedApronCardIds).mockResolvedValue([]);
  });

  it("shows the Pinball Map lineup link for members", async () => {
    vi.mocked(getViewer).mockResolvedValue({
      userId: "member-1",
      role: "member",
      profile: null,
    });

    const jsx = await MachinesPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    const link = screen.getByRole("link", { name: /^Pinball Map/ });
    expect(link).toHaveAttribute("href", "/m/pinball-map");
  });

  it("hides the Pinball Map lineup link for guests", async () => {
    vi.mocked(getViewer).mockResolvedValue({
      userId: "guest-1",
      role: "guest",
      profile: null,
    });

    const jsx = await MachinesPage({ searchParams: Promise.resolve({}) });
    render(jsx);

    expect(
      screen.queryByRole("link", { name: /^Pinball Map/ })
    ).not.toBeInTheDocument();
  });
});
