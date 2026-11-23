import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Breadcrumb } from "./Breadcrumb";

function trail(): HTMLElement {
  return screen.getByRole("navigation", { name: "Breadcrumb" });
}

describe("Breadcrumb (design-bible §27)", () => {
  it("links Tags and the tag type on a tag's page, separated by ›", () => {
    render(
      <Breadcrumb
        section="tags"
        crumbs={[{ label: "Manufacturer", href: "/c/tags/manufacturer" }]}
      />
    );
    expect(screen.getByRole("link", { name: "Tags" })).toHaveAttribute(
      "href",
      "/c/tags"
    );
    expect(screen.getByRole("link", { name: "Manufacturer" })).toHaveAttribute(
      "href",
      "/c/tags/manufacturer"
    );
    expect(trail()).toHaveTextContent(/^Tags›Manufacturer$/);
  });

  it.each([
    ["collections", "Collections", "/c/collections"],
    ["settingsTags", "Settings tags", "/c/settings-tags"],
    ["help", "Help", "/help"],
  ] as const)("starts %s at its section's root", (section, label, href) => {
    render(<Breadcrumb section={section} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      href
    );
  });

  it("leads with the section's icon, hidden from assistive tech", () => {
    render(<Breadcrumb section="help" />);
    const icon = trail().querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon?.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("shortens only the last crumb, never the first", () => {
    render(
      <Breadcrumb
        section="tags"
        crumbs={[
          {
            label: "Tournament and League Rotation Groups",
            href: "/c/tags/rotation",
          },
        ]}
      />
    );
    const first = screen.getByRole("link", { name: "Tags" }).closest("li");
    const last = screen
      .getByRole("link", { name: "Tournament and League Rotation Groups" })
      .closest("li");
    expect(first).toHaveClass("shrink-0");
    expect(last).toHaveClass("min-w-0");
    expect(
      screen.getByText("Tournament and League Rotation Groups")
    ).toHaveClass("truncate");
  });
});
