import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { returnFocusTo } from "./focus-return";
import { ItemActionsMenu, type ItemMenuSection } from "./ItemActionsMenu";

function labels(menu: HTMLElement): (string | null)[] {
  return within(menu)
    .getAllByRole("menuitem")
    .map((item) => item.textContent);
}

async function open(name = "Comment actions"): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole("button", { name }));
  return screen.findByRole("menu");
}

/** An item's ⋯ menu (design-bible §26.2, §26.3). */
describe("ItemActionsMenu", () => {
  it("is a borderless ⋯ button named for the item, with a tooltip of the same name", async () => {
    render(
      <ItemActionsMenu
        label="Comment actions"
        description="Sam's comment"
        sections={[[{ key: "edit", label: "Edit", onSelect: vi.fn() }]]}
      />
    );
    const trigger = screen.getByRole("button", {
      name: "Comment actions",
      description: "Sam's comment",
    });
    expect(trigger).toHaveClass(
      "border-transparent",
      "bg-transparent",
      "size-11",
      "md:size-8"
    );
    expect(trigger).not.toHaveAttribute("title");
    await userEvent.hover(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Comment actions"
    );
  });

  it("lists text-only entries, a divider between sections, a destructive section last in red", async () => {
    const sections: ItemMenuSection[] = [
      [
        {
          key: "delete",
          label: "Delete",
          destructive: true,
          onSelect: vi.fn(),
        },
      ],
      [
        { key: "edit", label: "Edit", onSelect: vi.fn() },
        { key: "copy", label: "Duplicate", onSelect: vi.fn() },
      ],
      [],
    ];
    render(<ItemActionsMenu label="Comment actions" sections={sections} />);
    const menu = await open();
    expect(labels(menu)).toEqual(["Edit", "Duplicate", "Delete"]);
    expect(within(menu).getAllByRole("separator")).toHaveLength(1);
    expect(
      within(menu).getByRole("menuitem", { name: "Delete" })
    ).toHaveAttribute("data-variant", "destructive");
    expect(menu.querySelector("svg")).toBeNull();
  });

  it("titles a section and marks the current entry", async () => {
    render(
      <ItemActionsMenu
        label="Issue list actions"
        sections={[
          {
            label: "Show",
            entries: [
              { key: "open", label: "Open issues", href: "/a", current: true },
              { key: "all", label: "All issues", href: "/b" },
            ],
          },
        ]}
      />
    );
    const menu = await open("Issue list actions");
    expect(within(menu).getByText("Show")).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Open issues" })
    ).toHaveAttribute("aria-current", "true");
    expect(
      within(menu).getByRole("menuitem", { name: "All issues" })
    ).not.toHaveAttribute("aria-current");
  });

  it("disables an entry with its reason, and a busy one, without running them", async () => {
    const onSelect = vi.fn();
    render(
      <ItemActionsMenu
        label="Set actions"
        sections={[
          [
            {
              key: "dup",
              label: "Duplicate",
              disabled: true,
              disabledReason: "Save the set first",
              onSelect,
            },
            { key: "export", label: "Export", busy: true, onSelect },
          ],
        ]}
      />
    );
    const menu = await open("Set actions");
    const duplicate = within(menu).getByRole("menuitem", {
      name: /Duplicate/,
      description: "Save the set first",
    });
    expect(duplicate).toHaveAttribute("aria-disabled", "true");
    const busy = within(menu).getByRole("menuitem", { name: "Export" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(duplicate);
    fireEvent.click(busy);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opens a submenu of further entries", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <ItemActionsMenu
        label="Card actions"
        sections={[
          [
            {
              key: "copy",
              label: "Copy from",
              submenu: [{ key: "a", label: "Card A", onSelect }],
            },
          ],
        ]}
      />
    );
    await user.click(screen.getByRole("button", { name: "Card actions" }));
    const subTrigger = await screen.findByRole("menuitem", {
      name: "Copy from",
    });
    subTrigger.focus();
    await user.keyboard("{ArrowRight}");
    expect(
      await screen.findByRole("menuitem", { name: "Card A" })
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("returns focus to its button on close, unless the entry moved focus itself", async () => {
    const user = userEvent.setup();
    render(
      <>
        <input aria-label="Editor" />
        <ItemActionsMenu
          label="Comment actions"
          // As the comment menu: non-modal, so focus can leave for the editor.
          modal={false}
          sections={[
            [
              { key: "plain", label: "Plain", onSelect: vi.fn() },
              {
                key: "edit",
                label: "Edit",
                keepsFocus: true,
                onSelect: () => screen.getByRole("textbox").focus(),
              },
            ],
          ]}
        />
      </>
    );
    const trigger = screen.getByRole("button", { name: "Comment actions" });
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Plain" }));
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Editor" })).toHaveFocus()
    );
  });

  describe("tooltip and description", () => {
    const sections: ItemMenuSection[] = [
      [{ key: "edit", label: "Edit", onSelect: vi.fn() }],
    ];
    /** Past the tooltip's 300ms delay, so a tooltip about to open has. */
    const pastTooltipDelay = (): Promise<void> =>
      new Promise((resolve) => setTimeout(resolve, 400));

    it("opens no tooltip when closing the menu returns focus to its button, and keeps its description", async () => {
      const user = userEvent.setup();
      render(
        <ItemActionsMenu
          label="Section actions"
          description="the Rubbers section"
          sections={sections}
        />
      );
      const trigger = screen.getByRole("button", { name: "Section actions" });

      // Closed with Escape: focus comes back to the button.
      trigger.focus();
      await user.keyboard("{Enter}");
      await screen.findByRole("menu");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(trigger).toHaveFocus());
      await pastTooltipDelay();
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      expect(trigger).toHaveAccessibleDescription("the Rubbers section");

      // Closed by choosing an entry: the same.
      await user.keyboard("{Enter}");
      await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
      await waitFor(() => expect(trigger).toHaveFocus());
      await pastTooltipDelay();
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      expect(trigger).toHaveAccessibleDescription("the Rubbers section");
    });

    it("keeps exactly its own description while the tooltip is open", async () => {
      const user = userEvent.setup();
      render(
        <ItemActionsMenu
          label="Section actions"
          description="the Rubbers section"
          sections={sections}
        />
      );
      const trigger = screen.getByRole("button", { name: "Section actions" });
      await user.hover(trigger);
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "Section actions"
      );
      expect(trigger).toHaveAccessibleDescription("the Rubbers section");
      expect(trigger.getAttribute("aria-describedby")?.split(" ")).toHaveLength(
        1
      );
    });

    it("still shows the tooltip when the button is reached by Tab", async () => {
      const user = userEvent.setup();
      render(
        <>
          <button type="button">Before</button>
          <ItemActionsMenu label="Comment actions" sections={sections} />
        </>
      );
      screen.getByRole("button", { name: "Before" }).focus();
      await user.tab();
      expect(
        screen.getByRole("button", { name: "Comment actions" })
      ).toHaveFocus();
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "Comment actions"
      );
      expect(
        screen.getByRole("button", { name: "Comment actions" })
      ).not.toHaveAttribute("aria-describedby");
    });

    it("shows the tooltip for focus from nowhere, such as the first Tab after a reload", async () => {
      render(<ItemActionsMenu label="Comment actions" sections={sections} />);
      const trigger = screen.getByRole("button", { name: "Comment actions" });
      // Nothing had focus, so the focus event has no related target.
      expect(document.activeElement).toBe(document.body);
      trigger.focus();
      expect(trigger).toHaveFocus();
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "Comment actions"
      );
    });

    it("opens no tooltip for a focus handed back with returnFocusTo, and only that one", async () => {
      const user = userEvent.setup();
      render(
        <>
          <button type="button">Before</button>
          <ItemActionsMenu label="Comment actions" sections={sections} />
        </>
      );
      const before = screen.getByRole("button", { name: "Before" });
      const trigger = screen.getByRole("button", { name: "Comment actions" });
      returnFocusTo(trigger);
      expect(trigger).toHaveFocus();
      await pastTooltipDelay();
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

      // The mark is taken: the next arrival by Tab shows the tooltip.
      before.focus();
      await user.tab();
      expect(trigger).toHaveFocus();
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "Comment actions"
      );
    });

    it("shows the tooltip on a Tab arrival after the menu was dismissed by a click outside", async () => {
      const user = userEvent.setup();
      render(
        <>
          <button type="button">Before</button>
          {/* Non-modal: an outside click dismisses without refocusing ⋯. */}
          <ItemActionsMenu
            label="Comment actions"
            modal={false}
            sections={sections}
          />
        </>
      );
      const before = screen.getByRole("button", { name: "Before" });
      const trigger = screen.getByRole("button", { name: "Comment actions" });
      await user.click(trigger);
      await screen.findByRole("menu");
      await user.click(before);
      await waitFor(() =>
        expect(screen.queryByRole("menu")).not.toBeInTheDocument()
      );
      expect(before).toHaveFocus();

      await user.tab();
      expect(trigger).toHaveFocus();
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "Comment actions"
      );
    });

    it("shows the tooltip on a Tab arrival after focus was handed back to a button that already had it", async () => {
      const user = userEvent.setup();
      render(
        <>
          <button type="button">Before</button>
          <ItemActionsMenu label="Comment actions" sections={sections} />
        </>
      );
      const before = screen.getByRole("button", { name: "Before" });
      const trigger = screen.getByRole("button", { name: "Comment actions" });
      before.focus();
      await user.tab();
      expect(trigger).toHaveFocus();
      // Already focused: no focus event, so no mark may be left behind.
      returnFocusTo(trigger);
      await user.tab({ shift: true });
      expect(before).toHaveFocus();
      await waitFor(() =>
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
      );

      await user.tab();
      expect(trigger).toHaveFocus();
      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        "Comment actions"
      );
    });
  });
});
