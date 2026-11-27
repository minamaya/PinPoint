import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { InfoRail } from "./info-rail";

const addedAt = new Date("2026-04-17T00:00:00Z");

/**
 * Unstubbed integration between InfoRail and PersonHoverCard: verifies that
 * owner-block renders a real anchor to `/u/<id>` for an active owner and plain
 * text (no link) for an invited owner (replaces E2E owner-machines link check).
 */
describe("InfoRail owner profile link (unstubbed PersonHoverCard)", () => {
  const baseProps = {
    addedAt,
    modelName: "Attack from Mars",
    manufacturer: "Bally",
    year: 1995,
    credits: { design: ["Brian Eddy"], art: [], code: [] },
    tags: [],
    pinballmap: {
      locationUrl: null,
      onLineup: null,
      configIssue: false,
      manageHref: null,
    },
  };

  it("links the active owner inside owner-block to /u/<id>", () => {
    render(
      <InfoRail
        {...baseProps}
        owner={{ id: "user-123", name: "Mo Member", avatarUrl: null }}
        invitedOwner={null}
      />
    );

    const ownerBlock = screen.getByTestId("owner-block");
    const profileLink = within(ownerBlock).getByRole("link", {
      name: "Mo Member",
    });
    expect(profileLink).toHaveAttribute("href", "/u/user-123");
  });

  it("renders invited owner as plain text without a profile link", () => {
    render(
      <InfoRail
        {...baseProps}
        owner={null}
        invitedOwner={{ name: "Invited Owner" }}
      />
    );

    const ownerBlock = screen.getByTestId("owner-block");
    expect(within(ownerBlock).queryByRole("link")).not.toBeInTheDocument();
    expect(within(ownerBlock).getByText("Invited Owner")).toBeInTheDocument();
  });
});
