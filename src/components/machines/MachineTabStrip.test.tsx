import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { MachineTabStrip } from "~/components/machines/MachineTabStrip";

const pathnameMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: pathnameMock,
}));

function mockDesktopWidths(): void {
  let measuredTabIndex = 0;
  const tabWidths = [60, 80, 80, 80, 90, 80];
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement): DOMRect {
      if (this.dataset.testid === "machine-tab-strip") {
        return DOMRect.fromRect({ width: 800 });
      }
      if (this.hasAttribute("data-overflow-trigger-measure")) {
        return DOMRect.fromRect({ width: 48 });
      }
      if (this.hasAttribute("data-tab-measure")) {
        const width = tabWidths[measuredTabIndex] ?? 80;
        measuredTabIndex = (measuredTabIndex + 1) % tabWidths.length;
        return DOMRect.fromRect({ width });
      }
      return DOMRect.fromRect();
    }
  );
}

describe("MachineTabStrip", () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue("/m/GZ");
    mockDesktopWidths();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("omits the Apron card tab when canSeeApronCards is false", async () => {
    render(
      <MachineTabStrip
        initials="GZ"
        maintenance={{ openCount: 0, status: "operational" }}
        canManage={false}
        canSeeApronCards={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("machine-tab-info")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("machine-tab-apron")).toBeNull();
    expect(screen.queryByRole("link", { name: "Apron card" })).toBeNull();
  });

  it("renders the Apron card tab linking to /m/[initials]/apron when canSeeApronCards is true", async () => {
    render(
      <MachineTabStrip
        initials="GZ"
        maintenance={{ openCount: 0, status: "operational" }}
        canManage={false}
        canSeeApronCards
      />
    );

    const apronLink = await screen.findByRole("link", { name: "Apron card" });
    expect(apronLink).toHaveAttribute("href", "/m/GZ/apron");
    expect(screen.getByTestId("machine-tab-apron")).toBe(apronLink);
  });
});
