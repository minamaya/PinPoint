import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TagDeleteDialog, TagRenameDialog } from "./TagManageDialogs";
import type { TagActionResult } from "~/app/(app)/c/tags/schemas";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

function RenameHarness({
  onRename,
}: {
  onRename: (name: string) => Promise<TagActionResult>;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open rename
      </button>
      <TagRenameDialog
        open={open}
        onOpenChange={setOpen}
        title="Rename tag"
        currentName="Front room"
        onRename={onRename}
      />
    </>
  );
}

function DeleteHarness({
  onDelete,
}: {
  onDelete: () => Promise<TagActionResult>;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open delete
      </button>
      <TagDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete Location?"
        description="Deletes this tag type and its tags."
        confirmLabel="Delete tag type"
        onDelete={onDelete}
        redirectTo="/c/tags"
      />
    </>
  );
}

describe("TagManageDialogs", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
  });

  it("TagRenameDialog renames, refreshes, and guards unsaved edits on Escape", async () => {
    const onRename = vi.fn<(name: string) => Promise<TagActionResult>>(() =>
      Promise.resolve({ ok: true, value: undefined })
    );
    const user = userEvent.setup();
    render(<RenameHarness onRename={onRename} />);

    await user.click(screen.getByRole("button", { name: "Open rename" }));
    const nameField = screen.getByLabelText(/Name/);
    expect(nameField).toHaveValue("Front room");

    await user.clear(nameField);
    await user.type(nameField, "Lobby");
    await user.keyboard("{Escape}");
    expect(await screen.findByText("Discard changes?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    await user.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(onRename).toHaveBeenCalledWith("Lobby"));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  it("TagDeleteDialog confirms deletion and navigates to redirectTo", async () => {
    const onDelete = vi.fn<() => Promise<TagActionResult>>(() =>
      Promise.resolve({ ok: true, value: undefined })
    );
    const user = userEvent.setup();
    render(<DeleteHarness onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: "Open delete" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "Delete Location?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Delete tag type" })
    );

    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/c/tags"));
  });

  it("TagDeleteDialog surfaces action error without navigating", async () => {
    const onDelete = vi.fn<() => Promise<TagActionResult>>(() =>
      Promise.resolve({
        ok: false,
        code: "FORBIDDEN",
        message: "Not allowed",
      })
    );
    const user = userEvent.setup();
    render(<DeleteHarness onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: "Open delete" }));
    await user.click(screen.getByRole("button", { name: "Delete tag type" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed");
    expect(push).not.toHaveBeenCalled();
  });
});
