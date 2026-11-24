import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MachineTimelinePinballMapCommentRow } from "./MachineTimelinePinballMapCommentRow";
import type { ResolvedPinballMapComment } from "~/lib/timeline/machine-events";

const actions = vi.hoisted(() => ({
  convert: vi.fn(),
}));

vi.mock(
  "~/app/(app)/m/[initials]/(tabs)/timeline/pinballmap-comment-actions",
  () => ({
    convertPinballMapCommentAction: actions.convert,
  })
);

function renderRow(
  overrides: Partial<ResolvedPinballMapComment> = {},
  { canConvert = false }: { canConvert?: boolean } = {}
): void {
  render(
    <MachineTimelinePinballMapCommentRow
      row={{
        id: "event-1",
        machineId: "machine-1",
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        comment: {
          conditionId: 42,
          comment: "left flipper weak",
          username: "pbm_user",
          locationId: 26454,
          convertedIssue: null,
          otherCopies: [],
          previousListing: null,
          ...overrides,
        },
      }}
      canConvert={canConvert}
      showRelativeTime={false}
    />
  );
}

describe("MachineTimelinePinballMapCommentRow", () => {
  beforeEach(() => {
    actions.convert.mockReset();
  });

  it("notes a comment from a previous listing", () => {
    renderRow({ previousListing: "removed" });
    expect(
      screen.getByText("Note: From a Previous Listing")
    ).toBeInTheDocument();
  });

  it("shows no note while the entry is current", () => {
    renderRow({ previousListing: null });
    expect(
      screen.queryByText("Note: From a Previous Listing")
    ).not.toBeInTheDocument();
  });

  it("renders commenter attribution, Pinball Map location link, and sibling cabinet links", () => {
    renderRow({
      username: "e2e_pbm_user",
      locationId: 26454,
      otherCopies: [{ initials: "MM", name: "Medieval Madness" }],
    });

    expect(screen.getByText("e2e_pbm_user")).toBeInTheDocument();
    const viaLink = screen.getByRole("link", { name: "via Pinball Map" });
    expect(viaLink).toHaveAttribute(
      "href",
      "https://pinballmap.com/map/?by_location_id=26454"
    );
    const siblingLink = screen.getByRole("link", { name: "MM" });
    expect(siblingLink).toHaveAttribute("href", "/m/MM/timeline");
    expect(
      screen.queryByRole("button", { name: "Convert to issue" })
    ).not.toBeInTheDocument();
  });

  it("falls back to Pinball Map user when username is null and links a converted issue instead of offering Convert", () => {
    renderRow(
      {
        username: null,
        convertedIssue: {
          machineInitials: "MM",
          issueNumber: 12,
          title: "Weak flipper",
        },
      },
      { canConvert: true }
    );

    expect(screen.getByText("Pinball Map user")).toBeInTheDocument();
    const issueLink = screen.getByRole("link", { name: /Converted to/ });
    expect(issueLink).toHaveAttribute("href", "/m/MM/i/12");
    expect(
      screen.queryByRole("button", { name: "Convert to issue" })
    ).not.toBeInTheDocument();
  });

  it("opens ConvertPinballMapCommentDialog, submits Radix severity, and surfaces action errors", async () => {
    const user = userEvent.setup();
    actions.convert.mockResolvedValue({
      ok: false,
      code: "ALREADY_CONVERTED",
      message: "Already converted on another cabinet.",
    });
    renderRow({}, { canConvert: true });

    await user.click(screen.getByRole("button", { name: "Convert to issue" }));
    const dialog = screen.getByRole("dialog", { name: "Convert to issue" });
    expect(dialog).toBeInTheDocument();

    const submit = within(dialog).getByRole("button", {
      name: "Convert to issue",
    });
    expect(submit).toBeDisabled();

    await user.click(within(dialog).getByTestId("pbm-convert-severity"));
    await user.click(screen.getByRole("option", { name: /Major/ }));
    expect(submit).toBeEnabled();

    await user.click(submit);

    await waitFor(() => {
      expect(actions.convert).toHaveBeenCalledTimes(1);
    });
    const submitted = actions.convert.mock.calls[0]?.[1];
    expect(submitted).toBeInstanceOf(FormData);
    if (submitted instanceof FormData) {
      expect(submitted.get("machineId")).toBe("machine-1");
      expect(submitted.get("conditionId")).toBe("42");
      expect(submitted.get("title")).toBe("left flipper weak");
      expect(submitted.get("severity")).toBe("major");
    }
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Already converted on another cabinet."
    );
  });
});
