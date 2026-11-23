// @vitest-environment jsdom
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRoleSelect } from "./user-role-select";

const mockUpdateUserRole = vi.fn();
vi.mock("~/app/(app)/admin/users/actions", () => ({
  updateUserRole: (
    userId: string,
    newRole: string,
    userType?: "active" | "invited"
  ) => mockUpdateUserRole(userId, newRole, userType),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

describe("UserRoleSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables self-demotion for the current admin", () => {
    render(
      <UserRoleSelect
        userId="admin-1"
        userName="Current Admin"
        currentRole="admin"
        currentUserId="admin-1"
      />
    );

    const trigger = screen.getByRole("combobox", {
      name: "Change role for Current Admin",
    });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent("Admin");
  });

  it("updates another active user's role and shows success toast", async () => {
    mockUpdateUserRole.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(
      <UserRoleSelect
        userId="user-2"
        userName="Target Member"
        currentRole="guest"
        currentUserId="admin-1"
      />
    );

    const trigger = screen.getByRole("combobox", {
      name: "Change role for Target Member",
    });
    expect(trigger).toBeEnabled();

    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Admin" }));

    await waitFor(() => {
      expect(mockUpdateUserRole).toHaveBeenCalledWith(
        "user-2",
        "admin",
        "active"
      );
    });
    expect(mockToastSuccess).toHaveBeenCalledWith("Role updated successfully");
  });

  it("passes userType='invited' when updating an invited user's role", async () => {
    mockUpdateUserRole.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(
      <UserRoleSelect
        userId="invited-1"
        userName="Invited Guest"
        currentRole="guest"
        currentUserId="admin-1"
        userType="invited"
      />
    );

    await user.click(
      screen.getByRole("combobox", { name: "Change role for Invited Guest" })
    );
    await user.click(screen.getByRole("option", { name: "Member" }));

    await waitFor(() => {
      expect(mockUpdateUserRole).toHaveBeenCalledWith(
        "invited-1",
        "member",
        "invited"
      );
    });
  });

  it("surfaces action errors via toast.error", async () => {
    mockUpdateUserRole.mockRejectedValueOnce(
      new Error("Forbidden: Only admins can perform this action")
    );
    const user = userEvent.setup();
    render(
      <UserRoleSelect
        userId="user-2"
        userName="Target Member"
        currentRole="guest"
        currentUserId="admin-1"
      />
    );

    await user.click(
      screen.getByRole("combobox", { name: "Change role for Target Member" })
    );
    await user.click(screen.getByRole("option", { name: "Member" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Forbidden: Only admins can perform this action"
      );
    });
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });
});
