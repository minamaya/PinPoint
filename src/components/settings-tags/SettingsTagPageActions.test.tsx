import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  deleteSettingsTagAction,
  renameSettingsTagAction,
} from "~/app/(app)/c/settings-tags/actions";
import { SettingsTagPageActions } from "./SettingsTagPageActions";

const mockRefresh = vi.fn();
const mockPush = vi.fn();

vi.mock("~/app/(app)/c/settings-tags/actions", () => ({
  renameSettingsTagAction: vi.fn(),
  deleteSettingsTagAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));

const PRINT = "/m/settings-sheets?m=AFM&to=league";
const manage = { tagId: "t1", name: "League", setCount: 2, machineCount: 1 };

/** A settings tag page's actions (machine-settings §3.3, §3.6; design-bible §26). */
describe("SettingsTagPageActions", () => {
  it("shows everyone else Print settings sheets as its own button (list-views §3.7)", () => {
    render(<SettingsTagPageActions printHref={PRINT} manage={null} />);
    expect(
      screen.getByRole("link", { name: "Print settings sheets" })
    ).toHaveAttribute("href", PRINT);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("holds Rename, Print settings sheets, and Delete last in ⋯ for managers", async () => {
    render(<SettingsTagPageActions printHref={PRINT} manage={manage} />);
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent)
    ).toEqual(["Rename…", "Print settings sheets", "Delete tag"]);
    expect(
      within(menu).getByRole("menuitem", { name: "Print settings sheets" })
    ).toHaveAttribute("href", PRINT);
    expect(
      within(menu).getByRole("menuitem", { name: "Delete tag" })
    ).toHaveAttribute("data-variant", "destructive");
  });

  it("confirms Delete tag and returns focus to ⋯ when kept", async () => {
    const user = userEvent.setup();
    render(<SettingsTagPageActions printHref={PRINT} manage={manage} />);
    const more = screen.getByRole("button", { name: "More" });
    await user.click(more);
    await user.click(
      await screen.findByRole("menuitem", { name: "Delete tag" })
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: "Delete “League”?",
    });
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    );
    expect(more).toHaveFocus();
  });

  it("renames the tag via Rename dialog and refreshes the router", async () => {
    mockRefresh.mockClear();
    const mockedRename = vi.mocked(renameSettingsTagAction);
    mockedRename.mockResolvedValue({ ok: true, value: undefined });
    const user = userEvent.setup();

    render(
      <SettingsTagPageActions
        printHref="/m/settings-sheets?to=tag%3Aleague"
        manage={{ tagId: "t1", name: "League", setCount: 0, machineCount: 0 }}
      />
    );

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("menuitem", { name: "Rename…" }));

    const dialog = await screen.findByRole("dialog", { name: "Rename tag" });
    const input = within(dialog).getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Finals");
    await user.click(within(dialog).getByRole("button", { name: "Rename" }));

    await waitFor(() => {
      expect(mockedRename).toHaveBeenCalledWith({
        tagId: "t1",
        name: "Finals",
      });
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("deletes the tag via Delete dialog and redirects to /c/settings-tags", async () => {
    mockPush.mockClear();
    const mockedDelete = vi.mocked(deleteSettingsTagAction);
    mockedDelete.mockResolvedValue({ ok: true, value: undefined });
    const user = userEvent.setup();

    render(
      <SettingsTagPageActions
        printHref="/m/settings-sheets?to=tag%3Aleague"
        manage={{ tagId: "t1", name: "League", setCount: 0, machineCount: 0 }}
      />
    );

    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Delete tag" })
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete “League”?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete tag" })
    );

    await waitFor(() => {
      expect(mockedDelete).toHaveBeenCalledWith({ tagId: "t1" });
    });
    expect(mockPush).toHaveBeenCalledWith("/c/settings-tags");
  });
});
