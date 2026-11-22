import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "~/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "~/components/ui/drawer";

function DialogHarness({
  dirty,
  onDiscard,
}: {
  dirty: boolean | undefined;
  onDiscard?: () => void;
}): ReactNode {
  const [open, setOpen] = useState(true);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      dirty={dirty}
      onDiscard={onDiscard}
    >
      <DialogContent>
        <DialogTitle>Edit thing</DialogTitle>
        <DialogDescription>Fields</DialogDescription>
        <input aria-label="Name" />
        <DialogClose asChild>
          <button type="button">Cancel</button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

// Radix attaches its outside-pointer listener on the next tick after mount.
const nextTick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 20));

async function clickOutside(
  selector = '[data-slot="dialog-overlay"]'
): Promise<void> {
  await nextTick();
  const overlays = document.querySelectorAll(selector);
  const overlay = overlays[overlays.length - 1];
  if (!overlay) throw new Error("no overlay");
  fireEvent.pointerDown(overlay);
  fireEvent.pointerUp(overlay);
  fireEvent.click(overlay);
}

const confirm = (): HTMLElement | null =>
  screen.queryByTestId("discard-changes-dialog");

describe("modal dismissal standard (CORE-UI-008)", () => {
  describe("Dialog with dirty={false}", () => {
    it("ignores an outside click", async () => {
      render(<DialogHarness dirty={false} />);
      await clickOutside();
      expect(screen.getByRole("dialog", { name: "Edit thing" })).toBeVisible();
      expect(confirm()).toBeNull();
    });

    it.each([
      ["Escape", async () => userEvent.keyboard("{Escape}")],
      ["Cancel", async () => userEvent.click(screen.getByText("Cancel"))],
      [
        "the close X",
        async () =>
          userEvent.click(screen.getByRole("button", { name: "Close" })),
      ],
    ])("closes at once on %s", async (_label, act) => {
      render(<DialogHarness dirty={false} />);
      await act();
      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Edit thing" })).toBeNull();
      });
      expect(confirm()).toBeNull();
    });
  });

  describe("Dialog with unsaved changes", () => {
    it("ignores an outside click without asking", async () => {
      render(<DialogHarness dirty />);
      await clickOutside();
      expect(screen.getByRole("dialog", { name: "Edit thing" })).toBeVisible();
      expect(confirm()).toBeNull();
    });

    it.each([
      ["Escape", async () => userEvent.keyboard("{Escape}")],
      ["Cancel", async () => userEvent.click(screen.getByText("Cancel"))],
      [
        "the close X",
        async () =>
          userEvent.click(screen.getByRole("button", { name: "Close" })),
      ],
    ])("asks before closing on %s", async (_label, act) => {
      render(<DialogHarness dirty />);
      await act();
      expect(
        await screen.findByRole("alertdialog", { name: "Discard changes?" })
      ).toBeVisible();
      expect(
        // Hidden from assistive tech while the confirm is on top of it.
        document.querySelector('[data-slot="dialog-content"]')
      ).toBeInTheDocument();
    });

    it("keeps the modal open on Keep editing", async () => {
      render(<DialogHarness dirty />);
      await userEvent.keyboard("{Escape}");
      await userEvent.click(
        await screen.findByRole("button", { name: "Keep editing" })
      );
      await waitFor(() => {
        expect(confirm()).toBeNull();
      });
      expect(screen.getByRole("dialog", { name: "Edit thing" })).toBeVisible();
    });

    it("closes and runs onDiscard on Discard", async () => {
      const onDiscard = vi.fn();
      render(<DialogHarness dirty onDiscard={onDiscard} />);
      await userEvent.keyboard("{Escape}");
      await userEvent.click(
        await screen.findByRole("button", { name: "Discard" })
      );
      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Edit thing" })).toBeNull();
      });
      expect(onDiscard).toHaveBeenCalledTimes(1);
    });

    it("does not guard a close made from code", async () => {
      function Saves(): ReactNode {
        const [open, setOpen] = useState(true);
        return (
          <Dialog open={open} onOpenChange={setOpen} dirty>
            <DialogContent>
              <DialogTitle>Edit thing</DialogTitle>
              <DialogDescription>Fields</DialogDescription>
              <button type="button" onClick={() => setOpen(false)}>
                Save
              </button>
            </DialogContent>
          </Dialog>
        );
      }
      render(<Saves />);
      await userEvent.click(screen.getByText("Save"));
      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Edit thing" })).toBeNull();
      });
      expect(confirm()).toBeNull();
    });
  });

  it("leaves a Dialog without `dirty` dismissible by an outside click", async () => {
    render(<DialogHarness dirty={undefined} />);
    await clickOutside();
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit thing" })).toBeNull();
    });
  });

  it("works uncontrolled, opened by its trigger", async () => {
    render(
      <Dialog dirty>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Edit thing</DialogTitle>
          <DialogDescription>Fields</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    await userEvent.click(screen.getByText("Open"));
    await userEvent.keyboard("{Escape}");
    expect(
      await screen.findByRole("alertdialog", { name: "Discard changes?" })
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit thing" })).toBeNull();
    });
  });

  it("does not make a plain dialog nested in a guarded one ignore outside clicks", async () => {
    render(
      <Dialog open dirty={false}>
        <DialogContent>
          <DialogTitle>Outer</DialogTitle>
          <DialogDescription>Fields</DialogDescription>
          <Dialog>
            <DialogTrigger>Open inner</DialogTrigger>
            <DialogContent>
              <DialogTitle>Inner</DialogTitle>
              <DialogDescription>Pick</DialogDescription>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    );
    await userEvent.click(screen.getByText("Open inner"));
    expect(await screen.findByRole("dialog", { name: "Inner" })).toBeVisible();
    await clickOutside();
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Inner" })).toBeNull();
    });
    expect(screen.getByRole("dialog", { name: "Outer" })).toBeVisible();
  });

  describe("Sheet", () => {
    function SheetHarness({ dirty }: { dirty: boolean }): ReactNode {
      const [open, setOpen] = useState(true);
      return (
        <Sheet open={open} onOpenChange={setOpen} dirty={dirty}>
          <SheetContent side="bottom">
            <SheetTitle>Note</SheetTitle>
            <SheetDescription>Write</SheetDescription>
            <SheetClose asChild>
              <button type="button">Cancel</button>
            </SheetClose>
          </SheetContent>
        </Sheet>
      );
    }

    it("ignores an outside click and asks before closing when dirty", async () => {
      render(<SheetHarness dirty />);
      await clickOutside('[data-slot="sheet-overlay"]');
      expect(screen.getByRole("dialog", { name: "Note" })).toBeVisible();
      expect(confirm()).toBeNull();
      await userEvent.click(screen.getByText("Cancel"));
      expect(
        await screen.findByRole("alertdialog", { name: "Discard changes?" })
      ).toBeVisible();
    });

    it("closes at once when clean", async () => {
      render(<SheetHarness dirty={false} />);
      await userEvent.click(screen.getByText("Cancel"));
      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Note" })).toBeNull();
      });
    });
  });

  describe("Drawer", () => {
    function DrawerHarness({ dirty }: { dirty: boolean }): ReactNode {
      const [open, setOpen] = useState(true);
      return (
        <Drawer open={open} onOpenChange={setOpen} dirty={dirty}>
          <DrawerContent>
            <DrawerTitle>Filters</DrawerTitle>
            <DrawerDescription>Pick</DrawerDescription>
          </DrawerContent>
        </Drawer>
      );
    }

    it("ignores an outside click and asks before closing on Escape when dirty", async () => {
      render(<DrawerHarness dirty />);
      await clickOutside('[data-slot="drawer-overlay"]');
      expect(screen.getByRole("dialog", { name: "Filters" })).toBeVisible();
      expect(confirm()).toBeNull();
      await userEvent.keyboard("{Escape}");
      expect(
        await screen.findByRole("alertdialog", { name: "Discard changes?" })
      ).toBeVisible();
    });

    it("snaps the drawer back when the confirm intercepts a swipe-down", async () => {
      render(<DrawerHarness dirty />);
      const content = document.querySelector(
        '[data-slot="drawer-content"]'
      ) as HTMLElement;
      content.style.transform = "translate3d(0, 240px, 0)";
      await userEvent.keyboard("{Escape}");
      await screen.findByRole("alertdialog", { name: "Discard changes?" });
      expect(content.style.transform).toBe("translate3d(0, 0, 0)");
    });
  });
});
