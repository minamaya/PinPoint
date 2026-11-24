import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as actions from "~/app/(app)/issues/actions";
import { ReassignMachineForm } from "./reassign-machine-form";

vi.mock("~/app/(app)/issues/actions", async (importOriginal) => ({
  ...(await importOriginal<typeof actions>()),
  reassignIssueMachineAction: vi.fn(),
}));

const reassignSpy = vi.mocked(actions.reassignIssueMachineAction);

const MACHINES = [
  { initials: "TAF", name: "The Addams Family" },
  { initials: "HD", name: "Humpty Dumpty" },
  { initials: "AFM", name: "Attack from Mars" },
];

function renderDialog(open = true): {
  onOpenChange: ReturnType<typeof vi.fn>;
} {
  const onOpenChange = vi.fn();
  render(
    <ReassignMachineForm
      issueId="11111111-1111-4111-8111-111111111111"
      currentInitials="TAF"
      machines={MACHINES}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
  return { onOpenChange };
}

describe("ReassignMachineForm", () => {
  beforeEach(() => {
    reassignSpy.mockReset();
  });

  it("excludes the current machine and disables Move issue until a destination is chosen", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.queryByTestId("reassign-option-TAF")).not.toBeInTheDocument();
    expect(screen.getByTestId("reassign-option-HD")).toBeInTheDocument();
    expect(screen.getByTestId("reassign-option-AFM")).toBeInTheDocument();

    const confirm = screen.getByTestId("reassign-confirm");
    expect(confirm).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Search machines…"), "HD");
    expect(screen.getByTestId("reassign-option-HD")).toBeInTheDocument();
    expect(screen.queryByTestId("reassign-option-AFM")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("reassign-option-HD"));
    expect(confirm).toBeEnabled();
  });

  it("submits issueId and newMachineInitials to reassignIssueMachineAction", async () => {
    const user = userEvent.setup();
    let resolveAction: () => void = () => undefined;
    reassignSpy.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = () =>
            resolve({
              ok: true,
              value: { issueId: "11111111-1111-4111-8111-111111111111" },
            });
        })
    );
    renderDialog();

    await user.click(screen.getByTestId("reassign-option-HD"));
    await user.click(screen.getByTestId("reassign-confirm"));

    await waitFor(() => {
      expect(reassignSpy).toHaveBeenCalledTimes(1);
    });
    const formData = reassignSpy.mock.calls[0]?.[1];
    expect(formData).toBeInstanceOf(FormData);
    if (formData instanceof FormData) {
      expect(formData.get("issueId")).toBe(
        "11111111-1111-4111-8111-111111111111"
      );
      expect(formData.get("newMachineInitials")).toBe("HD");
    }
    resolveAction();
  });

  it("renders a returned action error inline inside the open dialog", async () => {
    const user = userEvent.setup();
    reassignSpy.mockResolvedValue({
      ok: false,
      code: "FORBIDDEN",
      message: "You do not have permission to reassign this issue",
    });
    renderDialog();

    await user.click(screen.getByTestId("reassign-option-AFM"));
    await user.click(screen.getByTestId("reassign-confirm"));

    expect(
      await screen.findByText(
        "You do not have permission to reassign this issue"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("alertdialog", {
        name: "Move issue to another machine",
      })
    ).toBeInTheDocument();
  });

  it("clears the previous machine selection when reopened", async () => {
    const user = userEvent.setup();
    function Harness(): React.JSX.Element {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Reopen
          </button>
          <ReassignMachineForm
            issueId="11111111-1111-4111-8111-111111111111"
            currentInitials="TAF"
            machines={MACHINES}
            open={open}
            onOpenChange={setOpen}
          />
        </>
      );
    }
    render(<Harness />);

    await user.click(screen.getByTestId("reassign-option-HD"));
    expect(screen.getByTestId("reassign-confirm")).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Reopen" }));

    expect(screen.getByTestId("reassign-confirm")).toBeDisabled();
    expect(screen.getByTestId("reassign-option-HD")).not.toHaveAttribute(
      "aria-current",
      "true"
    );
  });
});
