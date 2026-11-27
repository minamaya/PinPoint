// @vitest-environment jsdom
/**
 * Integration Test: AdminLayout access control (PP-nffph.12)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Exercises real `getViewer()`, DB
 * `userProfiles` role lookup, `checkPermission("admin.access", ...)`, and
 * unstubbed `<Forbidden />` rendering:
 * - Unauthenticated callers redirect to `/login?next=/admin`.
 * - Guest, member, and technician callers render `<Forbidden />` with their
 *   role badge and Home link, never the admin children.
 * - Admin callers render children.
 */
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb } from "~/test/setup/pglite";
import { seedUser } from "~/test/helpers/seed";
import { signInAs, signOut } from "~/test/helpers/mock-auth";

vi.mock("~/lib/supabase/server", () => import("~/test/helpers/mock-auth"));

class RedirectSignal extends Error {
  readonly url: string;
  constructor(url: string) {
    super(`NEXT_REDIRECT:${url}`);
    this.url = url;
  }
}

const mockRedirect = vi.fn((url: string): never => {
  throw new RedirectSignal(url);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers([["host", "localhost:3000"]])),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

const { default: AdminLayout } = await import("~/app/(app)/admin/layout");

describe("AdminLayout — PGlite integration", () => {
  setupTestDb();

  beforeEach(() => {
    vi.clearAllMocks();
    signOut();
  });

  it("redirects unauthenticated callers to /login?next=%2Fadmin", async () => {
    await expect(
      AdminLayout({ children: <div>Admin Panel</div> })
    ).rejects.toMatchObject({ url: "/login?next=%2Fadmin" });
    expect(mockRedirect).toHaveBeenCalledWith("/login?next=%2Fadmin");
  });

  it.each([
    ["guest", "Guest"],
    ["member", "Member"],
    ["technician", "Technician"],
  ] as const)(
    "renders Forbidden (Access Denied) for %s without rendering admin children",
    async (role, expectedLabel) => {
      const user = await seedUser({ role });
      signInAs(user.id);

      render(
        await AdminLayout({
          children: <div data-testid="admin-secret">Admin Panel</div>,
        })
      );

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(screen.queryByTestId("admin-secret")).not.toBeInTheDocument();
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
        "href",
        "/"
      );
    }
  );

  it("renders children for admin users", async () => {
    const admin = await seedUser({ role: "admin" });
    signInAs(admin.id);

    render(
      await AdminLayout({
        children: <div data-testid="admin-secret">Admin Panel</div>,
      })
    );

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("admin-secret")).toHaveTextContent("Admin Panel");
    expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
  });
});
