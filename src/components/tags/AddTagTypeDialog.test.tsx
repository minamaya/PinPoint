import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddTagTypeDialog } from "./AddTagTypeDialog";

const createTagType = vi.fn();
vi.mock("~/app/(app)/c/tags/actions", () => ({
  createTagTypeAction: (input: unknown) => createTagType(input),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

function Harness(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <AddTagTypeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

describe("AddTagTypeDialog", () => {
  beforeEach(() => {
    createTagType.mockReset();
    refresh.mockReset();
  });

  it("creates an exclusive tag type, closes, and refreshes", async () => {
    createTagType.mockResolvedValue({
      ok: true,
      value: { id: "tt-1", href: "/c/tags/zone" },
    });
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Add tag type" });
    const submit = within(dialog).getByRole("button", { name: "Add tag type" });
    expect(submit).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/Name/), "Zone");
    await user.click(within(dialog).getByLabelText("One per machine"));
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() =>
      expect(createTagType).toHaveBeenCalledWith({
        name: "Zone",
        exclusive: true,
      })
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  it("shows the action error and stays open when creation fails", async () => {
    createTagType.mockResolvedValue({
      ok: false,
      code: "CONFLICT",
      message: "Name already used",
    });
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Add tag type" });
    await user.type(within(dialog).getByLabelText(/Name/), "Location");
    await user.click(
      within(dialog).getByRole("button", { name: "Add tag type" })
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Name already used"
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("confirms before Escape discards edits and closes immediately when clean", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.type(screen.getByLabelText(/Name/), "Zone");
    await user.keyboard("{Escape}");
    expect(await screen.findByText("Discard changes?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByLabelText(/Name/)).toHaveValue("");
    expect(screen.getByLabelText("One per machine")).not.toBeChecked();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText("Discard changes?")).toBeNull();
  });
});
