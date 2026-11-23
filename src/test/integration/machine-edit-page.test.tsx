// @vitest-environment jsdom
/**
 * Integration Test: Machine Manage (/m/[initials]/edit) page access & gating (PP-nffph.8)
 *
 * Worker-scoped PGlite (CORE-TEST-001). Replaces the class-A/E E2E check in
 * e2e/full/machine-info.spec.ts ("a member without edit permission gets
 * read-only Pinball Map access on Manage"):
 * - Unauthenticated callers and guests are redirected back to /m/[initials].
 * - A non-owner member is admitted and receives only read-only Pinball Map
 *   props (canSetIntent: false, canPush: false, canRefresh: true), with no
 *   MachineDetailsForm or Danger zone / MachineOwnerTransfer.
 * - An owner (and technician/admin) receives MachineDetailsForm, Danger zone,
 *   and editable Pinball Map intent (canSetIntent: true).
 */
import type React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupTestDb } from "~/test/setup/pglite";
import { seedMachine, seedUser } from "~/test/helpers/seed";
import { signInAs, signOut } from "~/test/helpers/mock-auth";
import type { PinballmapListingControlProps } from "~/components/machines/PinballmapListingControl";

vi.mock("~/lib/supabase/server", () => import("~/test/helpers/mock-auth"));

class RedirectError extends Error {
  href: string;
  constructor(href: string) {
    super(`NEXT_REDIRECT:${href}`);
    this.href = href;
  }
}
class NotFoundError extends Error {}

const mockRedirect = vi.fn((href: string): never => {
  throw new RedirectError(href);
});
vi.mock("next/navigation", () => ({
  redirect: (href: string) => mockRedirect(href),
  notFound: vi.fn(() => {
    throw new NotFoundError("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers([["host", "localhost:3000"]])),
  cookies: () => Promise.resolve({ get: () => undefined }),
}));

const mockListingControl = vi.fn();
vi.mock("~/components/machines/PinballmapListingControl", () => ({
  PinballmapListingControl: (props: PinballmapListingControlProps) => {
    mockListingControl(props);
    return <div data-testid="pbm-listing-control" />;
  },
}));

vi.mock("~/components/machines/PinballmapAbandonedEntries", () => ({
  PinballmapAbandonedEntries: () => null,
}));

vi.mock("~/app/(app)/m/[initials]/(tabs)/edit/machine-details-form", () => ({
  MachineDetailsForm: ({ pinballmap }: { pinballmap?: React.ReactNode }) => (
    <form data-testid="mock-machine-details-form">
      {pinballmap}
      <button type="submit">Save details</button>
    </form>
  ),
}));

vi.mock("~/app/(app)/m/[initials]/(tabs)/edit/machine-owner-transfer", () => ({
  MachineOwnerTransfer: () => <div data-testid="mock-owner-transfer" />,
}));

vi.mock("~/app/(app)/m/[initials]/(tabs)/edit/details-dirty", () => ({
  DetailsDirtyProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("~/app/(app)/m/[initials]/(tabs)/edit/pinballmap-dirty-gate", () => ({
  PinballmapDirtyGate: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("~/components/layout/SectionNav", () => ({
  SectionNavLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("~/components/machines/machine-form/SectionAnchor", () => ({
  SectionAnchor: () => null,
}));

vi.mock("~/components/machines/machine-form/MachineFormActionBar", () => ({
  PinnedActionBarSpacer: () => null,
}));

const { default: MachineEditPage } =
  await import("~/app/(app)/m/[initials]/(tabs)/edit/page");

const EMPTY_SEARCH = Promise.resolve<
  Record<string, string | string[] | undefined>
>({});

describe("MachineEditPage — Manage route access & read-only Pinball Map gating (PGlite)", () => {
  setupTestDb();

  beforeEach(() => {
    vi.clearAllMocks();
    signOut();
  });

  it("redirects unauthenticated viewers to the machine Info tab", async () => {
    const machine = await seedMachine({ initials: "RDR", name: "Redirected" });

    await expect(
      MachineEditPage({
        params: Promise.resolve({ initials: machine.initials }),
        searchParams: EMPTY_SEARCH,
      })
    ).rejects.toMatchObject({ href: "/m/RDR" });
    expect(mockRedirect).toHaveBeenCalledWith("/m/RDR");
  });

  it("redirects guests to the machine Info tab", async () => {
    const guest = await seedUser({ role: "guest" });
    const machine = await seedMachine({
      initials: "GST",
      name: "Guest Blocked",
    });
    signInAs(guest.id);

    await expect(
      MachineEditPage({
        params: Promise.resolve({ initials: machine.initials }),
        searchParams: EMPTY_SEARCH,
      })
    ).rejects.toMatchObject({ href: "/m/GST" });
    expect(mockRedirect).toHaveBeenCalledWith("/m/GST");
  });

  it("gives a non-owner member read-only Pinball Map access with no edit form or Danger zone", async () => {
    const adminOwner = await seedUser({ role: "admin" });
    const nonOwnerMember = await seedUser({ role: "member" });
    const machine = await seedMachine({
      initials: "ROM",
      name: "Read Only Manage",
      ownerId: adminOwner.id,
      pinballmapExcluded: false,
    });

    signInAs(nonOwnerMember.id);

    render(
      await MachineEditPage({
        params: Promise.resolve({ initials: machine.initials }),
        searchParams: EMPTY_SEARCH,
      })
    );

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("pbm-listing-control")).toBeInTheDocument();
    expect(mockListingControl).toHaveBeenCalledWith(
      expect.objectContaining({
        machineId: machine.id,
        canSetIntent: false,
        canPush: false,
        canRefresh: true,
      })
    );
    expect(
      screen.queryByRole("button", { name: "Save details" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Danger zone" })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("mock-owner-transfer")).not.toBeInTheDocument();
  });

  it.each(["owner", "technician", "admin"] as const)(
    "renders edit form, Danger zone, and editable Pinball Map intent for %s",
    async (actorRole) => {
      const owner = await seedUser({ role: "member" });
      const actor =
        actorRole === "owner" ? owner : await seedUser({ role: actorRole });
      const machine = await seedMachine({
        initials:
          actorRole === "owner" ? "OWN" : actorRole.slice(0, 3).toUpperCase(),
        name: "Editable Machine",
        ownerId: owner.id,
      });

      signInAs(actor.id);

      render(
        await MachineEditPage({
          params: Promise.resolve({ initials: machine.initials }),
          searchParams: EMPTY_SEARCH,
        })
      );

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: "Save details" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Danger zone" })
      ).toBeInTheDocument();
      expect(screen.getByTestId("mock-owner-transfer")).toBeInTheDocument();
      expect(mockListingControl).toHaveBeenCalledWith(
        expect.objectContaining({
          canSetIntent: true,
          canRefresh: true,
        })
      );
    }
  );
});
