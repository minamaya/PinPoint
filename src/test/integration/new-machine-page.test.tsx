// @vitest-environment jsdom
/**
 * Integration Test: NewMachinePage (/m/new) access & form wiring (PP-nffph.12)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Renders the real unstubbed
 * `NewMachinePage` -> `Forbidden` / `CreateMachineForm` to verify:
 * - Unauthenticated callers redirect to `/login?next=%2Fm%2Fnew`.
 * - Guest and member callers render `<Forbidden />` (Access Denied, role badge,
 *   Go Back `/m`, Home `/`), without `CreateMachineForm`.
 * - Technician and admin callers render `New Machine` heading, `Machine Name`,
 *   `Initials`, `Machine Owner` picker, and `Create Machine` submit button.
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
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/m/new",
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers([["host", "localhost:3000"]])),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

const { default: NewMachinePage } = await import("~/app/(app)/m/new/page");

const EMPTY_SEARCH = Promise.resolve({});

describe("NewMachinePage — PGlite integration", () => {
  setupTestDb();

  beforeEach(() => {
    vi.clearAllMocks();
    signOut();
  });

  it("redirects unauthenticated callers to /login?next=%2Fm%2Fnew", async () => {
    await expect(
      NewMachinePage({ searchParams: EMPTY_SEARCH })
    ).rejects.toMatchObject({ url: "/login?next=%2Fm%2Fnew" });
    expect(mockRedirect).toHaveBeenCalledWith("/login?next=%2Fm%2Fnew");
  });

  it.each([
    ["guest", "Guest"],
    ["member", "Member"],
  ] as const)(
    "renders Forbidden (Access Denied) for %s callers",
    async (role, expectedLabel) => {
      const user = await seedUser({ role });
      signInAs(user.id);

      render(await NewMachinePage({ searchParams: EMPTY_SEARCH }));

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Go Back" })).toHaveAttribute(
        "href",
        "/m"
      );
      expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
        "href",
        "/"
      );
      expect(
        screen.queryByRole("heading", { name: "New Machine" })
      ).not.toBeInTheDocument();
    }
  );

  it.each(["technician", "admin"] as const)(
    "renders New Machine form and Machine Owner picker for %s",
    async (role) => {
      const user = await seedUser({ role });
      signInAs(user.id);

      render(await NewMachinePage({ searchParams: EMPTY_SEARCH }));

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(
        screen.getByRole("heading", { name: "New Machine" })
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/Machine Name/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Initials/)).toBeInTheDocument();
      expect(screen.getByText("Machine Owner")).toBeInTheDocument();
      expect(screen.getByTestId("owner-select")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Create Machine" })
      ).toBeInTheDocument();
    }
  );
});
