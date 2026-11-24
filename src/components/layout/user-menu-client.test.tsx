import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserMenu } from "./user-menu-client";

const logoutActionMock = vi.hoisted(() => vi.fn());

vi.mock("~/app/(auth)/actions", () => ({ logoutAction: logoutActionMock }));

describe("UserMenu", () => {
  beforeEach(() => {
    logoutActionMock.mockReset();
    window.localStorage.clear();
  });

  describe("trigger and user links", () => {
    it("renders avatar initials and first name on trigger", () => {
      render(<UserMenu userName="Alex Smith" role="member" userId="u-1" />);

      const trigger = screen.getByTestId("user-menu-button");
      expect(trigger).toHaveTextContent("AS");
      expect(screen.getByTestId("user-menu-name")).toHaveTextContent("Alex");
    });

    it("shows Profile, My Machines, My Collections, and Settings for authenticated users", async () => {
      const user = userEvent.setup();
      render(<UserMenu userName="Mo Member" role="member" userId="user-42" />);

      await user.click(screen.getByRole("button", { name: /user menu/i }));

      expect(screen.getByTestId("user-menu-profile")).toHaveAttribute(
        "href",
        "/u/user-42"
      );
      expect(screen.getByTestId("user-menu-my-machines")).toHaveAttribute(
        "href",
        "/m?owner=me"
      );
      expect(screen.getByTestId("user-menu-my-collections")).toHaveAttribute(
        "href",
        "/c/collections"
      );
      expect(screen.getByTestId("user-menu-settings")).toHaveAttribute(
        "href",
        "/settings"
      );
      expect(screen.queryByTestId("user-menu-admin")).not.toBeInTheDocument();
    });

    it("omits user-id-scoped links when userId is absent while keeping Settings", async () => {
      const user = userEvent.setup();
      render(<UserMenu userName="Mo Member" role="member" />);

      await user.click(screen.getByRole("button", { name: /user menu/i }));

      expect(screen.queryByTestId("user-menu-profile")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("user-menu-my-machines")
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("user-menu-my-collections")
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("user-menu-settings")).toHaveAttribute(
        "href",
        "/settings"
      );
    });

    it("clears stored comment drafts and calls logoutAction on Sign Out", async () => {
      const user = userEvent.setup();
      window.localStorage.setItem("comment_draft:u1:i1", "draft");
      window.localStorage.setItem("unrelated_key", "keep");

      render(<UserMenu userName="Mo Member" role="member" userId="u1" />);

      await user.click(screen.getByRole("button", { name: /user menu/i }));
      await user.click(screen.getByTestId("user-menu-signout"));

      expect(window.localStorage.getItem("comment_draft:u1:i1")).toBeNull();
      expect(window.localStorage.getItem("unrelated_key")).toBe("keep");
      expect(logoutActionMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("admin navigation", () => {
    it("links desktop administrators to User Management and combined integrations", async () => {
      const user = userEvent.setup();
      render(<UserMenu userName="Ada Admin" role="admin" />);

      await user.click(screen.getByRole("button", { name: /user menu/i }));

      expect(screen.getByTestId("user-menu-admin")).toHaveAttribute(
        "href",
        "/admin/users"
      );
      expect(
        screen.getByTestId("user-menu-admin-integrations")
      ).toHaveAttribute("href", "/admin/integrations");
    });

    it("lists the Pinball Map lineup right after Integrations", async () => {
      const user = userEvent.setup();
      render(<UserMenu userName="Ada Admin" role="admin" />);

      await user.click(screen.getByRole("button", { name: /user menu/i }));

      const lineup = screen.getByTestId("user-menu-admin-pinball-map");
      expect(lineup).toHaveAttribute("href", "/m/pinball-map");
      expect(lineup).toHaveTextContent("Pinball Map lineup");
      const items = screen.getAllByRole("menuitem");
      const integrations = items.indexOf(
        screen.getByTestId("user-menu-admin-integrations")
      );
      expect(items[integrations + 1]).toBe(lineup);
    });

    it("does not show the admin group to members", async () => {
      const user = userEvent.setup();
      render(<UserMenu userName="Mo Member" role="member" />);

      await user.click(screen.getByRole("button", { name: /user menu/i }));

      expect(
        screen.queryByTestId("user-menu-admin-pinball-map")
      ).not.toBeInTheDocument();
    });
  });
});
