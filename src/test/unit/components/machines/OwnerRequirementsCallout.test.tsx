import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { OwnerRequirementsCallout } from "~/components/machines/OwnerRequirementsCallout";
import { plainTextToDoc } from "~/lib/tiptap/types";

describe("OwnerRequirementsCallout", () => {
  it("renders a note alert with the heading and owner requirements text", () => {
    render(
      <OwnerRequirementsCallout
        ownerRequirements={plainTextToDoc(
          "Please handle with care - vintage machine"
        )}
      />
    );

    const callout = screen.getByRole("note", {
      name: "Owner's requirements",
    });
    expect(callout).toHaveAttribute(
      "data-testid",
      "owner-requirements-callout"
    );
    expect(
      within(callout).getByRole("heading", {
        level: 2,
        name: "Owner's requirements",
      })
    ).toBeInTheDocument();
    expect(callout).toHaveTextContent(
      "Please handle with care - vintage machine"
    );
  });
});
