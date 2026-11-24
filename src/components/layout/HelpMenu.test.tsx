import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HelpMenu } from "./HelpMenu";

const openFeedbackFormMock = vi.hoisted(() => vi.fn());

vi.mock("~/components/feedback/FeedbackWidget", () => ({
  openFeedbackForm: openFeedbackFormMock,
}));

describe("HelpMenu", () => {
  beforeEach(() => {
    openFeedbackFormMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("hides the unread badge dot when newChangelogCount is 0", () => {
    render(<HelpMenu newChangelogCount={0} />);

    expect(
      screen.getByRole("button", { name: "Help and info" })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("help-menu-badge")).not.toBeInTheDocument();
  });

  it("shows the unread badge dot and count in What's New when unread entries exist", async () => {
    const user = userEvent.setup();
    render(<HelpMenu newChangelogCount={4} />);

    expect(screen.getByTestId("help-menu-badge")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Help and info" }));

    const whatsNew = screen.getByTestId("help-menu-whats-new");
    expect(whatsNew).toHaveAttribute("href", "/whats-new");
    expect(within(whatsNew).getByText("4")).toBeInTheDocument();
  });

  it("caps the What's New unread count label at 20+", async () => {
    const user = userEvent.setup();
    render(<HelpMenu newChangelogCount={25} />);

    await user.click(screen.getByRole("button", { name: "Help and info" }));

    expect(
      within(screen.getByTestId("help-menu-whats-new")).getByText("20+")
    ).toBeInTheDocument();
  });

  it("links to Help, About, and What's New and opens Feedback on selection", async () => {
    const user = userEvent.setup();
    render(<HelpMenu newChangelogCount={0} />);

    await user.click(screen.getByRole("button", { name: "Help and info" }));

    const menu = screen.getByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Help" })
    ).toHaveAttribute("href", "/help");
    expect(
      within(menu).getByRole("menuitem", { name: "About" })
    ).toHaveAttribute("href", "/about");
    expect(
      within(menu).getByRole("menuitem", { name: /What's New/ })
    ).toHaveAttribute("href", "/whats-new");

    await user.click(within(menu).getByRole("menuitem", { name: "Feedback" }));
    expect(openFeedbackFormMock).toHaveBeenCalledTimes(1);
  });

  it("shows dev-only links only when NODE_ENV is development", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<HelpMenu newChangelogCount={0} />);

    await user.click(screen.getByRole("button", { name: "Help and info" }));
    expect(
      screen.queryByTestId("help-menu-design-system")
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("help-menu-preview")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    vi.stubEnv("NODE_ENV", "development");
    rerender(<HelpMenu newChangelogCount={0} />);
    await user.click(screen.getByRole("button", { name: "Help and info" }));

    expect(screen.getByTestId("help-menu-design-system")).toHaveAttribute(
      "href",
      "/dev/design-system"
    );
    expect(screen.getByTestId("help-menu-preview")).toHaveAttribute(
      "href",
      "/dev/preview"
    );
  });
});
