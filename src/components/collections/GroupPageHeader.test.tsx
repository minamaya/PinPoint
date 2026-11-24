import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroupPageHeader } from "./GroupPageHeader";

/**
 * jsdom lays nothing out, so the header and its one-line title measurement
 * get widths here: the title is 300px and the header whatever the test gives
 * it. A description column beside it needs 24 + 280 = 304px plus the 16px
 * tolerance.
 */
function stubLayout(headerWidth: number): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const width =
        this.getAttribute("data-measure") === "title"
          ? 300
          : this.getAttribute("data-testid") === "group-header"
            ? headerWidth
            : 0;
      return DOMRect.fromRect({ width, height: 30 });
    }
  );
}

function header(): HTMLElement {
  return screen.getByTestId("group-header");
}

describe("GroupPageHeader (collections-and-tags 4.8–4.11)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the breadcrumb above the title, with no counts", () => {
    stubLayout(1200);
    render(
      <GroupPageHeader
        title="Electromechanicals"
        breadcrumb={{
          section: "tags",
          crumbs: [{ label: "Era", href: "/c/tags/era" }],
        }}
      />
    );

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Electromechanicals",
    });
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    // The breadcrumb comes before the title and is not inside its row.
    expect(
      trail.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(trail.parentElement).toBe(header());
    expect(screen.getByRole("link", { name: "Era" })).toHaveAttribute(
      "href",
      "/c/tags/era"
    );
    expect(screen.queryByTestId("collection-summary")).not.toBeInTheDocument();
  });

  it("puts the description beside the title on a wide header", () => {
    stubLayout(300 + 304 + 16);
    render(
      <GroupPageHeader
        title="Restoration queue"
        breadcrumb={{ section: "collections" }}
        description={<p>Games waiting on parts.</p>}
      />
    );
    expect(header()).toHaveAttribute("data-description", "beside");
  });

  it("puts the description under the title on a narrow header", () => {
    stubLayout(300 + 304 + 15);
    render(
      <GroupPageHeader
        title="Restoration queue"
        breadcrumb={{ section: "collections" }}
        description={<p>Games waiting on parts.</p>}
      />
    );
    expect(header()).toHaveAttribute("data-description", "under");
  });

  it("shows no breadcrumb when the page has none", () => {
    stubLayout(1200);
    render(<GroupPageHeader title="Shared queue" breadcrumb={null} />);
    expect(
      screen.queryByRole("navigation", { name: "Breadcrumb" })
    ).not.toBeInTheDocument();
  });
});
