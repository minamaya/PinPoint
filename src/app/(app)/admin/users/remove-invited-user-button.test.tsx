// @vitest-environment jsdom
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoveInvitedUserButton } from "./remove-invited-user-button";

const mockRemoveInvitedUser = vi.fn();
vi.mock("~/app/(app)/admin/users/actions", () => ({
  removeInvitedUser: (userId: string) => mockRemoveInvitedUser(userId),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

describe("RemoveInvitedUserButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a confirmation dialog and does not remove when cancelled", async () => {
    const user = userEvent.setup();
    render(<RemoveInvitedUserButton userId="inv-1" userName="Chip S" />);

    await user.click(
      screen.getByRole("button", { name: "Remove invitation for Chip S" })
    );

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Remove invitation?")).toBeInTheDocument();
    expect(within(dialog).getByText(/Chip S/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(mockRemoveInvitedUser).not.toHaveBeenCalled();
  });

  it("calls removeInvitedUser and shows a success toast when confirmed", async () => {
    mockRemoveInvitedUser.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<RemoveInvitedUserButton userId="inv-1" userName="Chip S" />);

    await user.click(
      screen.getByRole("button", { name: "Remove invitation for Chip S" })
    );
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(mockRemoveInvitedUser).toHaveBeenCalledWith("inv-1");
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Invitation removed successfully"
    );
  });

  it("shows an error toast when removeInvitedUser fails", async () => {
    mockRemoveInvitedUser.mockRejectedValueOnce(
      new Error("Invited user not found")
    );
    const user = userEvent.setup();
    render(<RemoveInvitedUserButton userId="inv-1" userName="Chip S" />);

    await user.click(
      screen.getByRole("button", { name: "Remove invitation for Chip S" })
    );
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Invited user not found");
    });
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});
