// @vitest-environment jsdom
/**
 * Integration Test: MachinesPage RSC loader & MachineView wiring (PP-nffph.12)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Renders the real unstubbed
 * `MachinesPage` -> `MachineView` + `MachinesPageActions` tree to verify:
 * - Anonymous viewer filtering by `?owner=<userId>` renders only that owner's
 *   machines (replaces E2E `owner-machines.spec.ts` landing assertion).
 * - Anonymous viewer does not get `Export to CSV` in `⋯`, while `Print
 *   settings sheets` stays available (replaces E2E `machine-export.spec.ts`
 *   anonymous check).
 * - `technician` (and `admin`) sees `Add Machine` linking to `/m/new`, while
 *   `member` and `guest` do not (replaces E2E `technician-role.spec.ts`
 *   Add Machine button check).
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb } from "~/test/setup/pglite";
import { seedMachine, seedUser } from "~/test/helpers/seed";
import { signInAs, signOut } from "~/test/helpers/mock-auth";
import { mockMobileViewport } from "~/test/helpers/viewport";
import { TooltipProvider } from "~/components/ui/tooltip";

vi.mock("~/lib/supabase/server", () => import("~/test/helpers/mock-auth"));

const redirectSpy = vi.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const routerMock = {
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
};
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  redirect: redirectSpy,
  useRouter: () => routerMock,
  usePathname: () => "/m",
  useSearchParams: () => currentSearchParams,
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers([["host", "localhost:3000"]])),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

const { default: MachinesPage } = await import("~/app/(app)/m/page");

describe("MachinesPage RSC — PGlite integration", () => {
  setupTestDb();

  let restoreViewport: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    signOut();
    currentSearchParams = new URLSearchParams();
    window.localStorage.clear();
    window.sessionStorage.clear();
    restoreViewport = mockMobileViewport(false);
  });

  afterEach(() => {
    restoreViewport();
  });

  it("renders only the requested owner's machines for anonymous ?owner=<id>", async () => {
    const ownerOne = await seedUser({ role: "member" });
    const ownerTwo = await seedUser({ role: "admin" });
    await seedMachine({
      initials: "AFM",
      name: "Attack from Mars",
      ownerId: ownerOne.id,
    });
    await seedMachine({
      initials: "TAF",
      name: "The Addams Family",
      ownerId: ownerTwo.id,
    });

    currentSearchParams = new URLSearchParams({ owner: ownerOne.id });
    render(
      <TooltipProvider>
        {await MachinesPage({
          searchParams: Promise.resolve({ owner: ownerOne.id }),
        })}
      </TooltipProvider>
    );

    const list = screen.getByRole("list", { name: "Machines list" });
    expect(
      within(list).getByRole("link", { name: "Attack from Mars" })
    ).toBeInTheDocument();
    expect(
      within(list).queryByRole("link", { name: "The Addams Family" })
    ).not.toBeInTheDocument();
  });

  it("omits Export to CSV from More for anonymous visitors while keeping Print settings sheets", async () => {
    const user = userEvent.setup();
    await seedMachine({ initials: "MM", name: "Medieval Madness" });

    render(
      <TooltipProvider>
        {await MachinesPage({ searchParams: Promise.resolve({}) })}
      </TooltipProvider>
    );

    await user.click(screen.getByRole("button", { name: "More" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Print settings sheets" })
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: "Export to CSV" })
    ).not.toBeInTheDocument();
  });

  it("shows Add Machine linking to /m/new for technician and hides it for member and guest", async () => {
    await seedMachine({ initials: "GZ", name: "Godzilla" });
    const technician = await seedUser({ role: "technician" });
    const member = await seedUser({ role: "member" });
    const guest = await seedUser({ role: "guest" });

    signInAs(technician.id);
    const techRender = render(
      <TooltipProvider>
        {await MachinesPage({ searchParams: Promise.resolve({}) })}
      </TooltipProvider>
    );
    expect(screen.getByRole("link", { name: "Add Machine" })).toHaveAttribute(
      "href",
      "/m/new"
    );
    techRender.unmount();

    for (const viewer of [member, guest]) {
      signInAs(viewer.id);
      const r = render(
        <TooltipProvider>
          {await MachinesPage({ searchParams: Promise.resolve({}) })}
        </TooltipProvider>
      );
      expect(
        screen.queryByRole("link", { name: "Add Machine" })
      ).not.toBeInTheDocument();
      r.unmount();
    }
  });
});
